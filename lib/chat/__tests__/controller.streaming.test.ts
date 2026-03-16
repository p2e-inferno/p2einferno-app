import { chatController } from "@/lib/chat/controller";
import { useChatStore } from "@/lib/chat/store";

describe("chat controller streaming readiness", () => {
  beforeEach(() => {
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
      route: null,
      hasHydrated: true,
      lastHydratedUserId: null,
    });
  });

  it("supports assistant message lifecycle transitions", () => {
    const assistantMessage = chatController.startAssistantMessage();

    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({
        id: assistantMessage.id,
        status: "streaming",
        content: "",
      }),
    );

    chatController.updateAssistantMessage(assistantMessage.id, "Partial reply");
    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({
        id: assistantMessage.id,
        status: "streaming",
        content: "Partial reply",
      }),
    );

    chatController.finalizeAssistantMessage(assistantMessage.id, "Final reply");
    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({
        id: assistantMessage.id,
        status: "complete",
        content: "Final reply",
        error: null,
      }),
    );
  });

  it("marks in-progress assistant messages as failed without removing them", () => {
    const assistantMessage = chatController.startAssistantMessage();
    chatController.updateAssistantMessage(assistantMessage.id, "Partial reply");
    chatController.failAssistantMessage(assistantMessage.id, "Stream failed");

    expect(useChatStore.getState().messages.at(-1)).toEqual(
      expect.objectContaining({
        id: assistantMessage.id,
        status: "error",
        content: "Partial reply",
        error: "Stream failed",
      }),
    );
  });
});
