jest.mock("@/lib/chat/session", () => ({
  getChatSessionPersistence: jest.fn(),
}));

import type { ChatAdapter } from "@/lib/chat/adapters/chat-adapter";
import { ChatController } from "@/lib/chat/controller";
import type { ChatRepository } from "@/lib/chat/repository/chat-repository";
import { getChatSessionPersistence } from "@/lib/chat/session";
import { useChatStore } from "@/lib/chat/store";
import type { ChatConversation } from "@/lib/chat/types";
import { createAssistantMessage } from "@/lib/chat/utils";

const getChatSessionPersistenceMock =
  getChatSessionPersistence as jest.MockedFunction<typeof getChatSessionPersistence>;

type RepositoryWithState = jest.Mocked<ChatRepository> & {
  conversation: ChatConversation | null;
};

function createRepository(name: string): RepositoryWithState {
  const repository = {} as RepositoryWithState;

  Object.assign(repository, {
    name,
    isAvailable: false,
    conversation: null,
    restoreActiveConversation: jest.fn(async () => ({
      conversation: repository.conversation,
      widget: null,
    })),
    createConversation: jest.fn(async (conversation: ChatConversation) => {
      repository.conversation = conversation;
      return conversation;
    }),
    appendMessages: jest.fn(async (conversationId: string, messages) => {
      if (!repository.conversation) {
        repository.conversation = {
          id: conversationId,
          source: "anonymous",
          createdAt: 1,
          updatedAt: 1,
          messages: [],
        };
      }

      repository.conversation = {
        ...repository.conversation,
        id: conversationId,
        messages: [...repository.conversation.messages, ...messages],
      };

      return repository.conversation;
    }),
    clearConversation: jest.fn(),
    saveWidgetSession: jest.fn().mockResolvedValue(undefined),
  });

  return repository;
}

const route = {
  pathname: "/",
  routeKey: "home",
  pageLabel: "Home",
  segment: null,
  behavior: {
    key: "general",
    assistantLabel: "General guide",
    systemHint: "Help users orient themselves and find the next useful step in the app.",
  },
} as const;

describe("chat controller adapter lifecycle contract", () => {
  let fallbackRepository: RepositoryWithState;

  beforeEach(() => {
    fallbackRepository = createRepository("browser");
    getChatSessionPersistenceMock.mockReturnValue({
      preferredRepository: fallbackRepository,
      fallbackRepository: fallbackRepository,
    });

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
          content: "hello",
          ts: 1,
          status: "complete",
          error: null,
        },
      ],
      status: "idle",
      error: null,
      auth: {
        isReady: true,
        isAuthenticated: false,
        privyUserId: null,
        walletAddress: null,
      },
      route,
      hasHydrated: true,
      lastHydratedUserId: null,
    });
  });

  it("supports lifecycle start/update/complete through the adapter boundary without duplicate final append", async () => {
    const streamingAdapter: ChatAdapter = {
      reply: async ({ lifecycle }) => {
        const assistantMessage = createAssistantMessage("", { status: "streaming" });
        await lifecycle?.onAssistantMessageStart?.(assistantMessage);
        await lifecycle?.onAssistantMessageUpdate?.(assistantMessage.id, "Partial");
        await lifecycle?.onAssistantMessageComplete?.(assistantMessage.id, "Final");
        return { mode: "lifecycle" };
      },
    };

    const controller = new ChatController(streamingAdapter);
    await controller.sendMessage("hello");

    const assistantMessages = useChatStore
      .getState()
      .messages.filter((message) => message.role === "assistant");

    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[1]).toEqual(
      expect.objectContaining({
        content: "Final",
        status: "complete",
      }),
    );
    expect(fallbackRepository.conversation?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "hello", status: "complete" }),
        expect.objectContaining({ role: "assistant", content: "Final", status: "complete" }),
      ]),
    );
  });

  it("handles lifecycle-driven assistant failure through the adapter boundary", async () => {
    const failingAdapter: ChatAdapter = {
      reply: async ({ lifecycle }) => {
        const assistantMessage = createAssistantMessage("", { status: "streaming" });
        await lifecycle?.onAssistantMessageStart?.(assistantMessage);
        await lifecycle?.onAssistantMessageUpdate?.(assistantMessage.id, "Partial");
        await lifecycle?.onAssistantMessageError?.(assistantMessage.id, "Failed");
        return { mode: "lifecycle" };
      },
    };

    const controller = new ChatController(failingAdapter);
    await controller.sendMessage("hello");

    const assistantMessage = useChatStore
      .getState()
      .messages.find((message) => message.id !== "seed" && message.role === "assistant");

    expect(assistantMessage).toEqual(
      expect.objectContaining({
        content: "Partial",
        status: "error",
        error: "Failed",
      }),
    );
    expect(fallbackRepository.conversation?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "hello", status: "complete" }),
      ]),
    );
    expect(fallbackRepository.conversation?.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "Partial" }),
      ]),
    );
  });

  it("applies multiple incremental updates to the same assistant message and persists only the completed result", async () => {
    const streamingAdapter: ChatAdapter = {
      reply: async ({ lifecycle }) => {
        const assistantMessage = createAssistantMessage("", { status: "streaming" });
        await lifecycle?.onAssistantMessageStart?.(assistantMessage);

        expect(useChatStore.getState().messages.filter((message) => message.id === assistantMessage.id))
          .toHaveLength(1);
        expect(fallbackRepository.conversation?.messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "hello", status: "complete" }),
          ]),
        );
        expect(fallbackRepository.conversation?.messages).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ role: "assistant", status: "streaming" }),
          ]),
        );

        await lifecycle?.onAssistantMessageUpdate?.(assistantMessage.id, "Par");
        expect(
          useChatStore.getState().messages.find((message) => message.id === assistantMessage.id),
        ).toEqual(
          expect.objectContaining({
            content: "Par",
            status: "streaming",
          }),
        );

        await lifecycle?.onAssistantMessageUpdate?.(assistantMessage.id, "Partial reply");
        expect(
          useChatStore.getState().messages.find((message) => message.id === assistantMessage.id),
        ).toEqual(
          expect.objectContaining({
            content: "Partial reply",
            status: "streaming",
          }),
        );

        await lifecycle?.onAssistantMessageComplete?.(
          assistantMessage.id,
          "Partial reply complete",
        );

        return { mode: "lifecycle" };
      },
    };

    const controller = new ChatController(streamingAdapter);
    await controller.sendMessage("hello");

    const assistantMessages = useChatStore
      .getState()
      .messages.filter((message) => message.role === "assistant");

    expect(assistantMessages).toHaveLength(2);
    expect(
      assistantMessages.filter((message) => message.id !== "seed"),
    ).toHaveLength(1);
    expect(assistantMessages[1]).toEqual(
      expect.objectContaining({
        content: "Partial reply complete",
        status: "complete",
      }),
    );
    expect(fallbackRepository.conversation?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "hello", status: "complete" }),
        expect.objectContaining({
          role: "assistant",
          content: "Partial reply complete",
          status: "complete",
        }),
      ]),
    );
    expect(fallbackRepository.conversation?.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "Par" }),
        expect.objectContaining({ role: "assistant", content: "Partial reply" }),
      ]),
    );
  });
});
