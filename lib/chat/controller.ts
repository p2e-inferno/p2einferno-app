import { CHAT_WELCOME_MESSAGE } from "@/lib/chat/constants";
import type { ChatAdapter } from "@/lib/chat/adapters/chat-adapter";
import { httpChatAdapter } from "@/lib/chat/adapters/http-chat-adapter";
import { extractChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
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

  private getAttachmentPathnames(messages: ChatMessage[]) {
    return Array.from(
      new Set(
        messages.flatMap((message) =>
          (message.attachments ?? [])
            .map((attachment) => extractChatAttachmentBlobPath(attachment.data))
            .filter((pathname): pathname is string => Boolean(pathname)),
        ),
      ),
    );
  }

  private async cleanupAnonymousAttachments(
    pathnames: string[],
    options: ChatControllerActionOptions,
  ) {
    if (!pathnames.length) {
      return;
    }

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
      }

      const response = await fetch("/api/chat/attachments/cleanup", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ pathnames }),
      });

      if (!response.ok) {
        throw new ChatRequestError(
          "Anonymous attachment cleanup failed",
          response.status,
        );
      }
    } catch (error) {
      log.warn("Failed to clean up anonymous chat attachments during reset", {
        count: pathnames.length,
        error,
      });
    }
  }

  private async rollbackPersistedMessage(
    conversationId: string,
    messageId: string,
    options: ChatControllerActionOptions,
    operation: ChatOperationContext,
  ) {
    const persistence = this.getPersistence(operation.auth, options);

    if (persistence.preferredRepository.isAvailable) {
      try {
        await persistence.preferredRepository.removeMessage(
          conversationId,
          messageId,
        );
      } catch (error) {
        log.warn("Failed to roll back persisted chat message in preferred repository", {
          repository: persistence.preferredRepository.name,
          conversationId,
          messageId,
          error,
        });
      }
    }

    if (!this.isOperationCurrent(operation)) {
      return;
    }

    if (
      persistence.fallbackRepository.isAvailable &&
      persistence.fallbackRepository !== persistence.preferredRepository
    ) {
      try {
        await persistence.fallbackRepository.removeMessage(
          conversationId,
          messageId,
        );
      } catch (error) {
        log.warn("Failed to roll back persisted chat message in fallback repository", {
          repository: persistence.fallbackRepository.name,
          conversationId,
          messageId,
          error,
        });
      }
    }
  }

  private formatRetryAt(retryAfterSeconds: number) {
    const retryAt = new Date(Date.now() + retryAfterSeconds * 1000);
    const now = new Date();
    const includeDate = retryAt.toDateString() !== now.toDateString();

    return new Intl.DateTimeFormat(undefined, {
      ...(includeDate
        ? {
            month: "short",
            day: "numeric",
          }
        : {}),
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(retryAt);
  }

  private getRateLimitMessage(
    reason: ChatRequestError["reason"],
    retryAfterSeconds?: number,
    tier?: ChatRequestError["tier"],
  ) {
    if (
      typeof retryAfterSeconds === "number" &&
      Number.isFinite(retryAfterSeconds) &&
      retryAfterSeconds > 0
    ) {
      const formattedRetryAt = this.formatRetryAt(retryAfterSeconds);

      if (reason === "quota") {
        if (tier === "anonymous") {
          return `You’ve reached your chat limit for this period. You can chat again at ${formattedRetryAt}. Connect to the app to unlock higher chat limits.`;
        }

        if (tier === "authenticated") {
          return `You’ve reached your chat limit for this period. You can chat again at ${formattedRetryAt}. Purchase a membership to unlock higher chat limits.`;
        }

        return `You’ve reached your chat limit for this period. You can chat again at ${formattedRetryAt}.`;
      }

      return `You’ve sent messages too quickly for now. You can chat again at ${formattedRetryAt}.`;
    }

    if (reason === "quota") {
      if (tier === "anonymous") {
        return "You’ve reached your chat limit for this period. Please try again later. Connect to the app to unlock higher chat limits.";
      }

      if (tier === "authenticated") {
        return "You’ve reached your chat limit for this period. Please try again later. Purchase a membership to unlock higher chat limits.";
      }

      return "You’ve reached your chat limit for this period. Please try again later.";
    }

    return "You’ve sent messages too quickly for now. Please try again later.";
  }

  private getRequestErrorMessage(error: unknown) {
    if (!(error instanceof ChatRequestError) || error.status !== 429) {
      return error instanceof Error ? error.message : "Unable to send message.";
    }

    return this.getRateLimitMessage(
      error.reason,
      error.retryAfterSeconds,
      error.tier,
    );
  }

  private getMessageRequestError(error: unknown) {
    if (!(error instanceof ChatRequestError)) {
      return null;
    }

    return {
      status: error.status,
      reason: error.reason as "burst" | "quota" | undefined,
      retryAfterSeconds: error.retryAfterSeconds,
      tier: error.tier,
    };
  }

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
    const previousMessage = options.existingMessage
      ? state.messages.find((message) => message.id === options.existingMessage?.id)
      : null;

    useChatStore.setState({
      status: "sending",
      error: null,
      draft: options.existingMessage ? state.draft : "",
      activeConversationId: conversationId,
      messages: messagesAfterUser,
    });

    let replyReceived = false;

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
      replyReceived = true;

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

      const requestErrorMessage = this.getRequestErrorMessage(error);
      const requestError = this.getMessageRequestError(error);
      const preservedQuotaError =
        previousMessage?.requestError?.status === 429 &&
        previousMessage.requestError.reason === "quota" &&
        requestError?.status === 429 &&
        requestError.reason === "burst"
          ? {
              message: previousMessage.error ??
                this.getRateLimitMessage(
                  previousMessage.requestError.reason,
                  previousMessage.requestError.retryAfterSeconds,
                  previousMessage.requestError.tier,
                ),
              requestError: previousMessage.requestError,
            }
          : null;
      const effectiveErrorMessage =
        preservedQuotaError?.message ?? requestErrorMessage;
      const effectiveRequestError =
        preservedQuotaError?.requestError ?? requestError;

      if (!replyReceived) {
        await this.rollbackPersistedMessage(
          conversationId,
          userMessage.id,
          options,
          operation,
        );

        if (!this.isOperationCurrent(operation)) {
          return;
        }
      }

      // Mark the orphaned user message as failed so it is excluded from
      // future history sent to the server, preventing cascading context
      // misalignment in subsequent AI requests.
      useChatStore.getState().updateMessage(userMessage.id, (msg) => ({
        ...msg,
        status: "error",
        error: effectiveErrorMessage,
        requestError: effectiveRequestError,
      }));

      log.error("Failed to send chat message", { error });
      useChatStore.setState({
        status: "error",
        error:
          effectiveRequestError?.status === 429 ? null : effectiveErrorMessage,
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

    await this.sendMessage(
      { text: failedMessage.content, attachments: failedMessage.attachments },
      { ...options, existingMessage: failedMessage },
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
    const attachmentPathnames = this.getAttachmentPathnames(state.messages);

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

    if (!state.auth.isAuthenticated) {
      await this.cleanupAnonymousAttachments(attachmentPathnames, options);
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
