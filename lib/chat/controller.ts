import { CHAT_WELCOME_MESSAGE } from "@/lib/chat/constants";
import { mockChatAdapter } from "@/lib/chat/adapters/mock-chat-adapter";
import { getChatSessionPersistence } from "@/lib/chat/session";
import { getChatStoreState, useChatStore } from "@/lib/chat/store";
import type {
  ChatAdapter,
  ChatControllerBootstrapOptions,
  ChatMessage,
} from "@/lib/chat/types";
import { createConversation, createUserMessage } from "@/lib/chat/utils";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:controller");

export class ChatController {
  constructor(private readonly adapter: ChatAdapter = mockChatAdapter) {}

  async bootstrap({ auth, route }: ChatControllerBootstrapOptions) {
    const store = getChatStoreState();

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
      await this.persistWidgetSession();
      return;
    }

    useChatStore.setState({
      status: "hydrating",
      error: null,
    });

    const persistence = getChatSessionPersistence(auth);
    const primary = persistence.preferredRepository;
    const fallback = persistence.fallbackRepository;
    const restored =
      primary.isAvailable
        ? await primary.restoreActiveConversation()
        : await fallback.restoreActiveConversation();
    const resolved =
      restored.conversation || restored.widget
        ? restored
        : await fallback.restoreActiveConversation();

    useChatStore.getState().applyRestore(resolved, auth.privyUserId);
    useChatStore.setState({
      status: "idle",
    });

    await this.persistWidgetSession();
  }

  async sendMessage(rawText: string) {
    const state = getChatStoreState();
    const trimmed = rawText.trim();

    if (!trimmed || state.status === "sending" || !state.route) {
      return;
    }

    const userMessage = createUserMessage(trimmed);
    const messagesAfterUser = [...state.messages, userMessage];
    const source = state.auth.isAuthenticated ? "authenticated" : "anonymous";
    const conversationId =
      state.activeConversationId ?? createConversation(source, [CHAT_WELCOME_MESSAGE]).id;

    useChatStore.setState({
      status: "sending",
      error: null,
      draft: "",
      activeConversationId: conversationId,
      messages: messagesAfterUser,
    });

    try {
      await this.persistMessages(conversationId, [userMessage], messagesAfterUser);

      const response = await this.adapter.reply({
        conversationId,
        message: userMessage,
        messages: messagesAfterUser,
        auth: state.auth,
        route: state.route,
      });

      const assistantMessage = response.message;

      useChatStore.getState().appendMessages([assistantMessage]);
      await this.persistMessages(conversationId, [assistantMessage], [
        ...messagesAfterUser,
        assistantMessage,
      ]);
      useChatStore.setState({ status: "idle" });
    } catch (error) {
      log.error("Failed to send chat message", { error });
      useChatStore.setState({
        status: "error",
        error: error instanceof Error ? error.message : "Unable to send message.",
      });
    } finally {
      await this.persistWidgetSession();
    }
  }

  async clearConversation() {
    const state = getChatStoreState();
    const persistence = getChatSessionPersistence(state.auth);

    if (persistence.preferredRepository.isAvailable) {
      await persistence.preferredRepository.clearConversation(state.activeConversationId);
    }

    await persistence.fallbackRepository.clearConversation(state.activeConversationId);
    useChatStore.getState().resetConversation();
    await this.persistWidgetSession();
  }

  async persistWidgetSession() {
    const state = getChatStoreState();
    const persistence = getChatSessionPersistence(state.auth);
    const session = useChatStore.getState().getWidgetSession();

    if (persistence.preferredRepository.isAvailable) {
      await persistence.preferredRepository.saveWidgetSession(session);
    }

    await persistence.fallbackRepository.saveWidgetSession(session);
  }

  async persistMessages(
    conversationId: string,
    newMessages: ChatMessage[],
    currentMessages: ChatMessage[],
  ) {
    const state = getChatStoreState();
    const persistence = getChatSessionPersistence(state.auth);
    const source = state.auth.isAuthenticated ? "authenticated" : "anonymous";
    const currentConversation = createConversation(source, currentMessages);
    currentConversation.id = conversationId;

    if (persistence.preferredRepository.isAvailable) {
      await persistence.preferredRepository.createConversation(currentConversation);
      const persisted = await persistence.preferredRepository.appendMessages(
        conversationId,
        newMessages,
      );

      if (persisted?.messages?.length) {
        return;
      }
    }

    const restoredFallback = await persistence.fallbackRepository.restoreActiveConversation();
    if (!restoredFallback.conversation) {
      await persistence.fallbackRepository.createConversation(currentConversation);
      return;
    }
    await persistence.fallbackRepository.appendMessages(conversationId, newMessages);
  }
}

export const chatController = new ChatController();
