jest.mock("@/lib/chat/session", () => ({
  getChatSessionPersistence: jest.fn(),
}));

import { ChatController, chatController } from "@/lib/chat/controller";
import { ChatRequestError } from "@/lib/chat/repository/http";
import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import { getChatSessionPersistence } from "@/lib/chat/session";
import { useChatStore } from "@/lib/chat/store";
import type {
  ChatConversation,
  RestoreConversationResult,
} from "@/lib/chat/types";
import { createAssistantMessage } from "@/lib/chat/utils";

const getChatSessionPersistenceMock =
  getChatSessionPersistence as jest.MockedFunction<
    typeof getChatSessionPersistence
  >;

function createRepository(
  name: string,
  isAvailable = true,
): jest.Mocked<ChatRepository> {
  return {
    name,
    isAvailable,
    restoreActiveConversation: jest.fn(),
    createConversation: jest.fn(),
    appendMessages: jest.fn(),
    removeMessage: jest.fn(),
    clearConversation: jest.fn(),
    saveWidgetSession: jest.fn(),
  };
}

const baseRoute = {
  pathname: "/",
  routeKey: "home",
  pageLabel: "Home",
  segment: null,
  behavior: {
    key: "general",
    assistantLabel: "General guide",
    systemHint:
      "Help users orient themselves and find the next useful step in the app.",
  },
} as const;

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("chat controller authenticated persistence", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-17T10:20:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    sessionStorage.clear();
    useChatStore.setState({
      isOpen: false,
      isPeekVisible: false,
      isPeekDismissed: false,
      draft: "",
      activeConversationId: null,
      messages: [
        {
          id: "seed",
          role: "assistant",
          content:
            "Hey 👋 I’m your in-app guide. Ask me anything — or tap a quick prompt below to get started.",
          ts: 1,
          status: "complete",
          error: null,
        },
      ],
      status: "idle",
      error: null,
      auth: {
        isReady: false,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: null,
      hasHydrated: false,
      lastHydratedUserId: null,
    });
  });

  it("hydrates from durable state and syncs fallback state for authenticated users", async () => {
    const preferred = createRepository("supabase");
    const fallback = createRepository("browser");
    const durableSnapshot: RestoreConversationResult = {
      conversation: {
        id: "chat_durable",
        source: "authenticated",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            id: "seed",
            role: "assistant",
            content: "hello",
            ts: 1,
            status: "complete",
            error: null,
          },
          {
            id: "m2",
            role: "user",
            content: "hi",
            ts: 2,
            status: "complete",
            error: null,
          },
        ],
      },
      widget: {
        isOpen: true,
        isPeekVisible: false,
        isPeekDismissed: true,
        draft: "",
        activeConversationId: "chat_durable",
      },
    };

    preferred.restoreActiveConversation.mockResolvedValue(durableSnapshot);
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockResolvedValue(
      durableSnapshot.conversation!,
    );
    fallback.saveWidgetSession.mockResolvedValue();

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: preferred,
      fallbackRepository: fallback,
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: baseRoute,
      accessToken: "token",
    });

    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(fallback.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat_durable" }),
    );
    expect(fallback.saveWidgetSession).toHaveBeenCalledWith(
      expect.objectContaining({ activeConversationId: "chat_durable" }),
    );
  });

  it("uses unauthenticated fallback when durable persistence is unavailable", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: {
        id: "chat_browser",
        source: "anonymous",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: "seed",
            role: "assistant",
            content: "hello",
            ts: 1,
            status: "complete",
            error: null,
          },
          {
            id: "m2",
            role: "user",
            content: "browser",
            ts: 2,
            status: "complete",
            error: null,
          },
        ],
      },
      widget: null,
    });

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
    });

    expect(useChatStore.getState().messages[1]?.content).toBe("browser");
  });

  it("keeps durable restore failures distinct from empty durable state", async () => {
    const preferred = createRepository("supabase");
    const fallback = createRepository("browser");
    const fallbackConversation: ChatConversation = {
      id: "chat_recover",
      source: "authenticated",
      createdAt: 1,
      updatedAt: 3,
      messages: [
        {
          id: "seed",
          role: "assistant",
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
        },
        {
          id: "m2",
          role: "user",
          content: "pending",
          ts: 2,
          status: "complete",
          error: null,
        },
      ],
    };

    preferred.restoreActiveConversation.mockRejectedValueOnce(
      new Error("temporary"),
    );
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: fallbackConversation,
      widget: {
        isOpen: true,
        isPeekVisible: false,
        isPeekDismissed: true,
        draft: "",
        activeConversationId: "chat_recover",
      },
    });
    fallback.createConversation.mockResolvedValue(fallbackConversation);
    fallback.saveWidgetSession.mockResolvedValue();

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: preferred,
      fallbackRepository: fallback,
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: baseRoute,
      accessToken: "token",
    });

    expect(preferred.createConversation).not.toHaveBeenCalled();
    expect(preferred.appendMessages).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages[1]?.content).toBe("pending");
    expect(useChatStore.getState().error).toBe(
      "Unable to restore your saved chat session.",
    );
  });

  it("merges fallback-only messages back into the durable conversation on recovery", async () => {
    const preferred = createRepository("supabase");
    const fallback = createRepository("browser");

    preferred.restoreActiveConversation.mockResolvedValue({
      conversation: {
        id: "chat_merge",
        source: "authenticated",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            id: "seed",
            role: "assistant",
            content: "hello",
            ts: 1,
            status: "complete",
            error: null,
          },
        ],
      },
      widget: null,
    });
    preferred.appendMessages.mockResolvedValue({
      id: "chat_merge",
      source: "authenticated",
      createdAt: 1,
      updatedAt: 3,
      messages: [
        {
          id: "seed",
          role: "assistant",
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
        },
        {
          id: "m2",
          role: "user",
          content: "recovered",
          ts: 2,
          status: "complete",
          error: null,
        },
      ],
    });
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: {
        id: "chat_merge",
        source: "authenticated",
        createdAt: 1,
        updatedAt: 3,
        messages: [
          {
            id: "seed",
            role: "assistant",
            content: "hello",
            ts: 1,
            status: "complete",
            error: null,
          },
          {
            id: "m2",
            role: "user",
            content: "recovered",
            ts: 2,
            status: "complete",
            error: null,
          },
        ],
      },
      widget: null,
    });
    fallback.createConversation.mockResolvedValue({
      id: "chat_merge",
      source: "authenticated",
      createdAt: 1,
      updatedAt: 3,
      messages: [],
    });

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: preferred,
      fallbackRepository: fallback,
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: baseRoute,
      accessToken: "token",
    });

    expect(preferred.appendMessages).toHaveBeenCalledWith("chat_merge", [
      expect.objectContaining({ id: "m2" }),
    ]);
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it("preserves conversation state across route re-bootstrap for the same authenticated user", async () => {
    const preferred = createRepository("supabase");
    const fallback = createRepository("browser");
    preferred.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.saveWidgetSession.mockResolvedValue();
    preferred.saveWidgetSession.mockResolvedValue();

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: preferred,
      fallbackRepository: fallback,
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: baseRoute,
      accessToken: "token",
    });

    useChatStore.setState({
      messages: [
        {
          id: "seed",
          role: "assistant",
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
        },
        {
          id: "m2",
          role: "user",
          content: "stay",
          ts: 2,
          status: "complete",
          error: null,
        },
      ],
      hasHydrated: true,
      lastHydratedUserId: "did:privy:1",
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: {
        ...baseRoute,
        pathname: "/quests",
        routeKey: "quests",
        pageLabel: "Quests",
        segment: "quests",
        behavior: {
          key: "quests",
          assistantLabel: "Quest guide",
          systemHint:
            "Bias toward explaining quests, task progress, and reward-related flows.",
        },
      },
      accessToken: "token",
    });

    expect(useChatStore.getState().messages[1]?.content).toBe("stay");
    expect(useChatStore.getState().route?.behavior.key).toBe("quests");
  });

  it("does not let a stale bootstrap overwrite a newer user state", async () => {
    const oldPreferred = createRepository("supabase-old");
    const oldFallback = createRepository("browser-old");
    const newPreferred = createRepository("supabase-new");
    const newFallback = createRepository("browser-new");
    const oldRestore = makeDeferred<RestoreConversationResult>();

    oldPreferred.restoreActiveConversation.mockReturnValue(oldRestore.promise);
    oldFallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    newPreferred.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    newFallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });

    getChatSessionPersistenceMock
      .mockReturnValueOnce({
        preferredRepository: oldPreferred,
        fallbackRepository: oldFallback,
      })
      .mockReturnValueOnce({
        preferredRepository: newPreferred,
        fallbackRepository: newFallback,
      });

    const firstBootstrap = chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:old",
        walletAddress: "0xold",
      },
      route: baseRoute,
      accessToken: "old-token",
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:new",
        walletAddress: "0xnew",
      },
      route: baseRoute,
      accessToken: "new-token",
    });

    oldRestore.resolve({
      conversation: {
        id: "chat_old",
        source: "authenticated",
        createdAt: 1,
        updatedAt: 2,
        messages: [
          {
            id: "m-old",
            role: "user",
            content: "old user message",
            ts: 2,
            status: "complete",
            error: null,
          },
        ],
      },
      widget: {
        isOpen: true,
        isPeekVisible: false,
        isPeekDismissed: false,
        draft: "",
        activeConversationId: "chat_old",
      },
    });

    await firstBootstrap;

    expect(useChatStore.getState().lastHydratedUserId).toBe("did:privy:new");
    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        content:
          "Hey 👋 I’m your in-app guide. Ask me anything — or tap a quick prompt below to get started.",
      }),
    ]);
  });

  it("resets widget chrome on user change when no widget snapshot exists", async () => {
    const firstPreferred = createRepository("supabase-first");
    const firstFallback = createRepository("browser-first");
    const secondPreferred = createRepository("supabase-second");
    const secondFallback = createRepository("browser-second");

    firstPreferred.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: {
        isOpen: true,
        isPeekVisible: false,
        isPeekDismissed: true,
        draft: "carry",
        activeConversationId: null,
      },
    });
    firstFallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    secondPreferred.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    secondFallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });

    getChatSessionPersistenceMock
      .mockReturnValueOnce({
        preferredRepository: firstPreferred,
        fallbackRepository: firstFallback,
      })
      .mockReturnValueOnce({
        preferredRepository: secondPreferred,
        fallbackRepository: secondFallback,
      });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:first",
        walletAddress: "0x123",
      },
      route: baseRoute,
      accessToken: "token",
    });

    await chatController.bootstrap({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:second",
        walletAddress: "0x456",
      },
      route: baseRoute,
      accessToken: "token",
    });

    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        isOpen: false,
        isPeekVisible: false,
        isPeekDismissed: false,
        draft: "",
      }),
    );
  });

  it("does not let a stale send completion repopulate state after clear", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockImplementation(
      async (conversationId, messages) => ({
        id: conversationId,
        source: "anonymous",
        createdAt: 1,
        updatedAt: 1,
        messages,
      }),
    );
    fallback.clearConversation.mockResolvedValue(undefined);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const replyDeferred = makeDeferred<any>();
    const adapter = {
      reply: jest.fn(async ({ lifecycle }: any) => {
        const assistant = createAssistantMessage("", { status: "streaming" });
        await lifecycle?.onAssistantMessageStart?.(assistant);
        return replyDeferred.promise;
      }),
    };
    const controller = new ChatController(adapter as any);

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    const sendPromise = controller.sendMessage("hello");
    await Promise.resolve();
    await controller.clearConversation();

    replyDeferred.resolve({
      mode: "final",
      message: createAssistantMessage("stale reply"),
    });
    await sendPromise;

    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0]?.content).toContain("Hey 👋");
  });

  it("keeps authenticated conversation visible when durable clear fails", async () => {
    const preferred = createRepository("supabase");
    const fallback = createRepository("browser");
    preferred.clearConversation.mockRejectedValueOnce(new Error("db down"));
    fallback.clearConversation.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: preferred,
      fallbackRepository: fallback,
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: true,
        privyUserId: "did:privy:1",
        walletAddress: "0x123",
      },
      route: baseRoute,
      activeConversationId: "chat_auth",
      messages: [
        {
          id: "seed",
          role: "assistant",
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
        },
        {
          id: "m2",
          role: "user",
          content: "persisted",
          ts: 2,
          status: "complete",
          error: null,
        },
      ],
      hasHydrated: true,
      lastHydratedUserId: "did:privy:1",
    });

    await chatController.clearConversation({
      accessToken: "token",
    });

    expect(fallback.clearConversation).not.toHaveBeenCalled();
    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        activeConversationId: "chat_auth",
        status: "error",
        error:
          "Unable to clear your saved chat right now. Your previous conversation is still available.",
      }),
    );
    expect(useChatStore.getState().messages).toHaveLength(2);
  });

  it("ignores a final adapter response after lifecycle completion has already happened", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockImplementation(
      async (conversationId, messages) => ({
        id: conversationId,
        source: "anonymous",
        createdAt: 1,
        updatedAt: 1,
        messages,
      }),
    );
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: async ({ lifecycle }) => {
        const assistant = createAssistantMessage("", { status: "streaming" });
        await lifecycle?.onAssistantMessageStart?.(assistant);
        await lifecycle?.onAssistantMessageComplete?.(
          assistant.id,
          "From lifecycle",
        );
        return {
          mode: "final",
          message: createAssistantMessage("Duplicate final"),
        };
      },
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    const assistantMessages = useChatStore
      .getState()
      .messages.filter((message) => message.role === "assistant");

    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[1]?.content).toBe("From lifecycle");
  });

  it("surfaces rate limiting distinctly from generic send failures", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockResolvedValue(null);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: async () => {
        throw new ChatRequestError("Too many chat requests", 429);
      },
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        error: null,
      }),
    );
    expect(
      useChatStore
        .getState()
        .messages.find((message) => message.role === "user")?.error,
    ).toBe("You’ve sent messages too quickly for now. Please try again later.");
  });

  it("surfaces quota exhaustion distinctly from burst rate limiting", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockResolvedValue(null);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: async () => {
        throw new ChatRequestError(
          "Chat usage limit reached for this period.",
          429,
          "quota",
          undefined,
          "anonymous",
        );
      },
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        error: null,
      }),
    );
    expect(fallback.removeMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it("includes retry-after seconds in quota limit messaging when available", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockResolvedValue(null);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: async () => {
        throw new ChatRequestError(
          "Chat usage limit reached for this period.",
          429,
          "quota",
          3600,
          "authenticated",
        );
      },
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    const expectedRetryAt = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date("2026-03-17T11:20:00.000Z"));

    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        error: null,
      }),
    );
    expect(
      useChatStore
        .getState()
        .messages.find((message) => message.role === "user")?.error,
    ).toBe(
      `You’ve reached your chat limit for this period. You can chat again at ${expectedRetryAt}. Purchase a membership to unlock higher chat limits.`,
    );
  });

  it("includes retry-after seconds in burst limit messaging when available", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockResolvedValue(null);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: async () => {
        throw new ChatRequestError("Too many chat requests", 429, "burst", 60);
      },
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    const expectedRetryAt = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date("2026-03-17T10:21:00.000Z"));

    expect(useChatStore.getState()).toEqual(
      expect.objectContaining({
        status: "error",
        error: null,
      }),
    );
    expect(
      useChatStore
        .getState()
        .messages.find((message) => message.role === "user")?.error,
    ).toBe(
      `You’ve sent messages too quickly for now. You can chat again at ${expectedRetryAt}.`,
    );
  });

  it("keeps a prior quota message dominant when retrying into burst protection", async () => {
    const fallback = createRepository("browser");
    fallback.restoreActiveConversation.mockResolvedValue({
      conversation: null,
      widget: null,
    });
    fallback.createConversation.mockImplementation(
      async (conversation) => conversation,
    );
    fallback.appendMessages.mockResolvedValue(null);
    fallback.saveWidgetSession.mockResolvedValue(undefined);

    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallback,
      fallbackRepository: fallback,
    });

    const controller = new ChatController({
      reply: jest
        .fn()
        .mockRejectedValueOnce(
          new ChatRequestError(
            "Chat usage limit reached for this period.",
            429,
            "quota",
            3600,
            "anonymous",
          ),
        )
        .mockRejectedValueOnce(
          new ChatRequestError("Too many chat requests", 429, "burst", 60, "anonymous"),
        ),
    });

    useChatStore.setState({
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route: baseRoute,
      hasHydrated: true,
      lastHydratedUserId: null,
    });

    await controller.sendMessage("hello");

    const failedMessage = useChatStore
      .getState()
      .messages.find((message) => message.role === "user" && message.status === "error");

    expect(failedMessage?.error).toContain("Connect to the app to unlock higher chat limits.");

    await controller.retryMessage(failedMessage!.id);

    const retriedMessage = useChatStore
      .getState()
      .messages.find((message) => message.id === failedMessage!.id);

    expect(retriedMessage?.error).toContain(
      "Connect to the app to unlock higher chat limits.",
    );
    expect(retriedMessage?.error).not.toContain("messages too quickly");
  });
});
