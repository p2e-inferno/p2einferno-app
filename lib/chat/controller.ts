import { CHAT_WELCOME_MESSAGE } from "@/lib/chat/constants";
import type { ChatAdapter } from "@/lib/chat/adapters/chat-adapter";
import { httpChatAdapter } from "@/lib/chat/adapters/http-chat-adapter";
import { resolveChatReconciliationPlan } from "@/lib/chat/reconciliation";
import { buildChatAssistantContext } from "@/lib/chat/route-behavior";
import { ChatRequestError } from "@/lib/chat/repository/http";
import { getChatSessionPersistence } from "@/lib/chat/session";
import { getChatStoreState, useChatStore } from "@/lib/chat/store";
import type {
  ChatConversation,
  ChatControllerActionOptions,
  ChatControllerBootstrapOptions,
  ChatMessage,
  ChatWidgetSession,
  RestoreConversationResult,
} from "@/lib/chat/types";
import {
  createAssistantMessage,
  createConversation,
  createUserMessage,
  isPersistableChatMessage,
} from "@/lib/chat/utils";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:controller");

interface ChatOperationContext {
  auth: ChatControllerBootstrapOptions["auth"];
  authKey: string;
  flowEpoch: number;
}

export class ChatController {
  private bootstrapOperationId = 0;
  private flowEpoch = 0;
  private lastAuthKey = "anonymous";

  constructor(private readonly adapter: ChatAdapter = httpChatAdapter) {}

  async bootstrap({
    auth,
    route,
    accessToken,
  }: ChatControllerBootstrapOptions) {
    const store = getChatStoreState();
    const authKey = this.getAuthKey(auth);
    if (authKey !== this.lastAuthKey) {
      this.lastAuthKey = authKey;
      this.flowEpoch += 1;
    }
    const operationId = ++this.bootstrapOperationId;
    const operation = this.createOperationContext(auth);

    useChatStore.setState({
      auth,
      route,
    });

    if (!auth.isReady) {
      return;
    }

    const shouldHydrate =
      !store.hasHydrated || store.lastHydratedUserId !== auth.privyUserId;

    if (!shouldHydrate) {
      await this.persistWidgetSession({ accessToken }, operation);
      return;
    }

    useChatStore.setState({
      status: "hydrating",
      error: null,
    });

    const persistence = getChatSessionPersistence(auth, accessToken);
    const primary = persistence.preferredRepository;
    const fallback = persistence.fallbackRepository;
    let durable: RestoreConversationResult = {
      conversation: null,
      widget: null,
    };
    let durableRestoreError: unknown = null;

    if (primary.isAvailable) {
      durable = await primary.restoreActiveConversation().catch((error) => {
        durableRestoreError = error;
        log.warn("Failed to restore durable chat session", {
          repository: primary.name,
          error,
        });
        return { conversation: null, widget: null };
      });
    }
    const fallbackSnapshot = await fallback.restoreActiveConversation();

    if (!this.isBootstrapCurrent(operationId, operation)) {
      return;
    }

    if (durableRestoreError) {
      useChatStore.getState().applyRestore(fallbackSnapshot, auth.privyUserId);
      useChatStore.setState({
        status: "idle",
        error: "Unable to restore your saved chat session.",
      });
      return;
    }

    const plan = resolveChatReconciliationPlan({
      durable,
      fallback: fallbackSnapshot,
      authenticated: auth.isAuthenticated,
    });
    const resolved = await this.applyReconciliationPlan(
      plan,
      persistence,
      operation,
    );

    if (!this.isBootstrapCurrent(operationId, operation)) {
      return;
    }

    useChatStore.getState().applyRestore(resolved, auth.privyUserId);
    useChatStore.setState({
      status: "idle",
    });
  }

  async sendMessage(
    payload: string | { text: string; attachments?: ChatMessage["attachments"] },
    options: ChatControllerActionOptions & { existingMessage?: ChatMessage } = {},
  ) {
    const state = getChatStoreState();
    const rawText = typeof payload === "string" ? payload : payload.text;
    const attachments = typeof payload === "string" ? undefined : payload.attachments;
    const trimmed = rawText.trim();

    if (
      (!trimmed && (!attachments || attachments.length === 0)) ||
      state.status === "sending" ||
      !state.route
    ) {
      return;
    }

    const userMessage = options.existingMessage || createUserMessage(trimmed, attachments);
    const messagesAfterUser = options.existingMessage 
      ? state.messages 
      : [...state.messages, userMessage];
    const source = state.auth.isAuthenticated ? "authenticated" : "anonymous";
    const conversationId =
      state.activeConversationId ??
      createConversation(source, [CHAT_WELCOME_MESSAGE]).id;
    const operation = this.createOperationContext(state.auth);

    useChatStore.setState({
      status: "sending",
      error: null,
      draft: options.existingMessage ? state.draft : "",
      activeConversationId: conversationId,
      messages: messagesAfterUser,
    });

    try {
      await this.persistMessages(
        conversationId,
        [userMessage],
        messagesAfterUser,
        options,
        operation,
      );

      const lifecycleState = {
        started: false,
        completed: false,
        failed: false,
      };

      const response = await this.adapter.reply({
        conversationId,
        message: userMessage,
        messages: messagesAfterUser,
        auth: state.auth,
        route: state.route,
        assistantContext: buildChatAssistantContext(state.route.behavior),
        accessToken: options.accessToken,
        lifecycle: {
          onAssistantMessageStart: (message) => {
            if (!this.isOperationCurrent(operation)) {
              return;
            }
            lifecycleState.started = true;
            this.startAssistantMessage(message);
          },
          onAssistantMessageUpdate: (messageId, content) => {
            if (!this.isOperationCurrent(operation)) {
              return;
            }
            this.updateAssistantMessage(messageId, content);
          },
          onAssistantMessageComplete: async (messageId, content) => {
            if (!this.isOperationCurrent(operation)) {
              return;
            }
            lifecycleState.started = true;
            lifecycleState.completed = true;
            this.finalizeAssistantMessage(messageId, content);
            await this.persistCompletedAssistantMessage(
              conversationId,
              messageId,
              options,
              operation,
            );
          },
          onAssistantMessageError: (messageId, error) => {
            if (!this.isOperationCurrent(operation)) {
              return;
            }
            lifecycleState.started = true;
            lifecycleState.failed = true;
            this.failAssistantMessage(messageId, error);
          },
        },
      });

      if (!this.isOperationCurrent(operation)) {
        return;
      }

      if (response.mode === "final") {
        if (
          lifecycleState.started ||
          lifecycleState.completed ||
          lifecycleState.failed
        ) {
          log.warn(
            "Chat adapter returned final output after lifecycle activity; ignoring final message",
            {
              conversationId,
            },
          );
          if (this.isOperationCurrent(operation)) {
            useChatStore.setState({ status: "idle" });
          }
          return;
        }

        // Source references currently stop at the adapter boundary until a
        // citation UI/state path is added.
        const assistantMessage = response.message;

        useChatStore.getState().appendMessages([assistantMessage]);
        await this.persistMessages(
          conversationId,
          [assistantMessage],
          [...messagesAfterUser, assistantMessage],
          options,
          operation,
        );
      }

      if (this.isOperationCurrent(operation)) {
        useChatStore.setState({ status: "idle" });
      }
    } catch (error) {
      if (!this.isOperationCurrent(operation)) {
        return;
      }

      // Mark the orphaned user message as failed so it is excluded from
      // future history sent to the server, preventing cascading context
      // misalignment in subsequent AI requests.
      useChatStore.getState().updateMessage(userMessage.id, (msg) => ({
        ...msg,
        status: "error",
        error: "Message failed to send.",
      }));

      log.error("Failed to send chat message", { error });
      useChatStore.setState({
        status: "error",
        error:
          error instanceof ChatRequestError && error.status === 429
            ? error.reason === "quota"
              ? "Chat usage limit reached for now. Please try again later."
              : "Chat is temporarily rate limited. Please wait and try again."
            : error instanceof Error
              ? error.message
              : "Unable to send message.",
      });
    } finally {
      await this.persistWidgetSession(options, operation);
    }
  }

  async retryMessage(
    messageId: string,
    options: ChatControllerActionOptions = {},
  ) {
    const state = getChatStoreState();
    const failedMessage = state.messages.find(
      (m) => m.id === messageId && m.status === "error" && m.role === "user",
    );

    if (!failedMessage || state.status === "sending" || !state.route) {
      return;
    }

    // Reset the message status so it appears normal in the UI
    useChatStore.getState().updateMessage(messageId, (msg) => ({
      ...msg,
      status: "complete",
      error: null,
    }));

    // Re-send using the existing sendMessage flow, specifying the 
    // refreshed message to ensure it is correctly persisted (status: complete).
    const refreshedMessage = getChatStoreState().messages.find(m => m.id === messageId);
    if (!refreshedMessage) {
      return;
    }

    await this.sendMessage(
      { text: refreshedMessage.content, attachments: refreshedMessage.attachments },
      { ...options, existingMessage: refreshedMessage },
    );
  }

  async deleteMessage(messageId: string, options: ChatControllerActionOptions = {}) {
    const state = getChatStoreState();
    const conversationId = state.activeConversationId;
    const messageToDelete = state.messages.find(m => m.id === messageId);
    const messageToDeleteIndex = state.messages.findIndex(
      (message) => message.id === messageId,
    );
    
    if (!messageToDelete || messageToDeleteIndex < 0) {
      return;
    }

    // 1. Local removal
    useChatStore.getState().removeMessage(messageId);

    // 2. Durable removal if we have an active conversation
    if (conversationId) {
      const operation = this.createOperationContext(state.auth);
      const persistence = this.getPersistence(operation.auth, options);
      let preferredDeleteFailed = false;

      if (persistence.preferredRepository.isAvailable) {
        await persistence.preferredRepository.removeMessage(conversationId, messageId).catch((error: unknown) => {
          preferredDeleteFailed = true;
          log.warn("Failed to delete durable chat message from preferred repository", {
            repository: persistence.preferredRepository.name,
            conversationId,
            messageId,
            error
          });
        });
      }

      if (preferredDeleteFailed) {
        useChatStore.setState((currentState) => {
          if (currentState.messages.some((message) => message.id === messageId)) {
            return {
              error: "Failed to delete message from server. Please try again.",
            };
          }

          const nextMessages = [...currentState.messages];
          nextMessages.splice(
            Math.min(messageToDeleteIndex, nextMessages.length),
            0,
            messageToDelete,
          );

          return {
            messages: nextMessages,
            error: "Failed to delete message from server. Please try again.",
          };
        });
        return;
      }

      // 3. Best-effort fallback removal (session storage)
      if (persistence.fallbackRepository.isAvailable && persistence.fallbackRepository !== persistence.preferredRepository) {
        await persistence.fallbackRepository.removeMessage(conversationId, messageId).catch((error: unknown) => {
          log.warn("Failed to delete durable chat message from fallback repository (best effort)", {
            repository: persistence.fallbackRepository.name,
            conversationId,
            messageId,
            error
          });
        });
      }
    }
  }

  async clearConversation(options: ChatControllerActionOptions = {}) {
    const state = getChatStoreState();
    const operation = this.createOperationContext(state.auth, true);
    const persistence = this.getPersistence(operation.auth, options);
    let durableClearFailed = false;

    if (persistence.preferredRepository.isAvailable) {
      await persistence.preferredRepository
        .clearConversation(state.activeConversationId)
        .catch((error) => {
          durableClearFailed = true;
          log.warn("Failed to clear durable chat conversation", {
            repository: persistence.preferredRepository.name,
            error,
          });
        });
    }

    if (!this.isOperationCurrent(operation)) {
      return;
    }

    if (durableClearFailed) {
      useChatStore.setState({
        status: "error",
        error:
          "Unable to clear your saved chat right now. Your previous conversation is still available.",
      });
      return;
    }

    await persistence.fallbackRepository.clearConversation(
      state.activeConversationId,
    );

    if (!this.isOperationCurrent(operation)) {
      return;
    }

    useChatStore.getState().resetConversation();
    await this.persistWidgetSession(options, operation);
  }

  async persistWidgetSession(
    options: ChatControllerActionOptions = {},
    operation = this.createOperationContext(getChatStoreState().auth),
  ) {
    if (!this.isOperationCurrent(operation)) {
      return;
    }

    const persistence = this.getPersistence(operation.auth, options);
    const session = useChatStore.getState().getWidgetSession();

    if (persistence.preferredRepository.isAvailable) {
      await persistence.preferredRepository
        .saveWidgetSession(session)
        .catch((error) => {
          log.warn("Failed to persist durable chat widget session", {
            repository: persistence.preferredRepository.name,
            error,
          });
        });
    }

    if (!this.isOperationCurrent(operation)) {
      return;
    }

    await persistence.fallbackRepository.saveWidgetSession(session);
  }

  async persistMessages(
    conversationId: string,
    newMessages: ChatMessage[],
    currentMessages: ChatMessage[],
    options: ChatControllerActionOptions = {},
    operation = this.createOperationContext(getChatStoreState().auth),
  ) {
    if (!this.isOperationCurrent(operation)) {
      return;
    }

    const persistence = this.getPersistence(operation.auth, options);
    const source = operation.auth.isAuthenticated
      ? "authenticated"
      : "anonymous";
    // Streaming-ready policy: keep partial assistant content in memory until finalized.
    const persistableNewMessages = newMessages.filter(isPersistableChatMessage);
    const persistableCurrentMessages = currentMessages.filter(
      isPersistableChatMessage,
    );

    if (persistableNewMessages.length === 0) {
      return;
    }

    const currentConversation = createConversation(
      source,
      persistableCurrentMessages,
    );
    currentConversation.id = conversationId;

    if (persistence.preferredRepository.isAvailable) {
      const persisted = await persistence.preferredRepository
        .createConversation(currentConversation)
        .then(() =>
          persistence.preferredRepository.appendMessages(
            conversationId,
            persistableNewMessages,
          ),
        )
        .catch((error) => {
          log.warn("Failed to persist durable chat messages", {
            repository: persistence.preferredRepository.name,
            conversationId,
            error,
          });
          return null;
        });

      if (persisted?.messages?.length || !this.isOperationCurrent(operation)) {
        return;
      }
    }

    const restoredFallback =
      await persistence.fallbackRepository.restoreActiveConversation();
    if (!this.isOperationCurrent(operation)) {
      return;
    }
    if (!restoredFallback.conversation) {
      await persistence.fallbackRepository.createConversation(
        currentConversation,
      );
      return;
    }
    await persistence.fallbackRepository.appendMessages(
      conversationId,
      persistableNewMessages,
    );
  }

  startAssistantMessage(
    message = createAssistantMessage("", { status: "streaming" }),
  ) {
    useChatStore.getState().appendMessages([message]);
    return message;
  }

  updateAssistantMessage(messageId: string, content: string) {
    useChatStore.getState().updateMessage(messageId, (message) => ({
      ...message,
      content,
      status: "streaming",
      error: null,
    }));
  }

  finalizeAssistantMessage(messageId: string, content?: string) {
    useChatStore.getState().updateMessage(messageId, (message) => ({
      ...message,
      content: content ?? message.content,
      status: "complete",
      error: null,
    }));
  }

  failAssistantMessage(messageId: string, error: string) {
    useChatStore.getState().updateMessage(messageId, (message) => ({
      ...message,
      status: "error",
      error,
    }));
  }

  async persistCompletedAssistantMessage(
    conversationId: string,
    messageId: string,
    options: ChatControllerActionOptions = {},
    operation = this.createOperationContext(getChatStoreState().auth),
  ) {
    if (!this.isOperationCurrent(operation)) {
      return;
    }

    const state = getChatStoreState();
    const message = state.messages.find((entry) => entry.id === messageId);

    if (!message || !isPersistableChatMessage(message)) {
      return;
    }

    await this.persistMessages(
      conversationId,
      [message],
      state.messages,
      options,
      operation,
    );
  }

  private getPersistence(
    auth: ChatControllerBootstrapOptions["auth"],
    options: ChatControllerActionOptions,
  ) {
    return getChatSessionPersistence(auth, options.accessToken);
  }

  private createOperationContext(
    auth: ChatControllerBootstrapOptions["auth"],
    incrementFlow = false,
  ): ChatOperationContext {
    if (incrementFlow) {
      this.flowEpoch += 1;
    }

    return {
      auth,
      authKey: this.getAuthKey(auth),
      flowEpoch: this.flowEpoch,
    };
  }

  private getAuthKey(auth: ChatControllerBootstrapOptions["auth"]) {
    return auth.isAuthenticated && auth.privyUserId
      ? `authenticated:${auth.privyUserId}`
      : "anonymous";
  }

  private isOperationCurrent(operation: ChatOperationContext) {
    return (
      operation.flowEpoch === this.flowEpoch &&
      operation.authKey === this.getAuthKey(getChatStoreState().auth)
    );
  }

  private isBootstrapCurrent(
    operationId: number,
    operation: ChatOperationContext,
  ) {
    return (
      operationId === this.bootstrapOperationId &&
      this.isOperationCurrent(operation)
    );
  }

  private async applyReconciliationPlan(
    plan: ReturnType<typeof resolveChatReconciliationPlan>,
    persistence: ReturnType<typeof getChatSessionPersistence>,
    operation: ChatOperationContext,
  ): Promise<RestoreConversationResult> {
    if (
      !this.isOperationCurrent(operation) ||
      !persistence.preferredRepository.isAvailable ||
      plan.action === "fallback_only" ||
      plan.action === "none"
    ) {
      return plan.resolved;
    }

    if (plan.action === "promote_fallback") {
      const conversation = plan.resolved.conversation;
      if (!conversation) {
        return plan.resolved;
      }

      const promoted = await this.persistDurableConversationSnapshot(
        persistence,
        conversation,
        conversation.messages,
        operation,
      );

      if (!promoted || !this.isOperationCurrent(operation)) {
        return plan.resolved;
      }

      const widget = await this.syncFallbackWithDurable(
        persistence,
        promoted,
        plan.resolved.widget,
        operation,
      );

      return {
        conversation: promoted,
        widget,
      };
    }

    if (plan.action === "merge_fallback_messages") {
      const durableConversation = plan.resolved.conversation;
      if (!durableConversation || plan.pendingMessages.length === 0) {
        return plan.resolved;
      }

      const merged = await persistence.preferredRepository
        .appendMessages(durableConversation.id, plan.pendingMessages)
        .catch((error) => {
          log.warn(
            "Failed to reconcile fallback chat messages into durable storage",
            {
              repository: persistence.preferredRepository.name,
              conversationId: durableConversation.id,
              error,
            },
          );
          return null;
        });

      if (!merged || !this.isOperationCurrent(operation)) {
        return plan.resolved;
      }

      const widget = await this.syncFallbackWithDurable(
        persistence,
        merged,
        plan.resolved.widget,
        operation,
      );

      return {
        conversation: merged,
        widget,
      };
    }

    const conversation = plan.resolved.conversation;
    const widget = await this.syncFallbackWithDurable(
      persistence,
      conversation,
      plan.resolved.widget,
      operation,
    );

    return {
      conversation,
      widget,
    };
  }

  private async persistDurableConversationSnapshot(
    persistence: ReturnType<typeof getChatSessionPersistence>,
    conversation: ChatConversation,
    messages: ChatMessage[],
    operation: ChatOperationContext,
  ): Promise<ChatConversation | null> {
    if (!this.isOperationCurrent(operation)) {
      return null;
    }

    const persistableMessages = messages.filter(isPersistableChatMessage);

    return persistence.preferredRepository
      .createConversation({
        ...conversation,
        messages: [],
      })
      .then(() =>
        persistence.preferredRepository.appendMessages(
          conversation.id,
          persistableMessages,
        ),
      )
      .catch((error) => {
        log.warn(
          "Failed to promote fallback chat conversation into durable storage",
          {
            repository: persistence.preferredRepository.name,
            conversationId: conversation.id,
            error,
          },
        );
        return null;
      });
  }

  private async syncFallbackWithDurable(
    persistence: ReturnType<typeof getChatSessionPersistence>,
    conversation: ChatConversation | null,
    widget: ChatWidgetSession | null,
    operation: ChatOperationContext,
  ): Promise<ChatWidgetSession | null> {
    if (!this.isOperationCurrent(operation)) {
      return widget;
    }

    if (conversation) {
      await persistence.fallbackRepository.createConversation(conversation);
    } else {
      await persistence.fallbackRepository.clearConversation(null);
    }

    const nextWidget = widget
      ? {
          ...widget,
          activeConversationId: conversation?.id ?? null,
        }
      : null;

    if (nextWidget && this.isOperationCurrent(operation)) {
      await persistence.fallbackRepository.saveWidgetSession(nextWidget);
    }

    return nextWidget;
  }
}

export const chatController = new ChatController();
