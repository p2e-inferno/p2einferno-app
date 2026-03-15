import { render, screen } from "@testing-library/react";
import { ChatMessageList } from "@/components/chat/chat-message-list";

describe("ChatMessageList", () => {
  const baseMessages = [
    {
      id: "seed",
      role: "assistant" as const,
      content: "Hi",
      ts: 1,
      status: "complete" as const,
      error: null,
    },
  ];

  it("shows the typing indicator for the existing non-streaming loading path", () => {
    render(
      <ChatMessageList
        messages={baseMessages}
        loading
        showTypingIndicator
        onRetryMessage={jest.fn().mockResolvedValue(undefined)}
        onDeleteMessage={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText(/assistant is typing/i)).toBeInTheDocument();
  });

  it("does not render the typing placeholder when an in-list streaming message is already active", () => {
    render(
      <ChatMessageList
        messages={[
          ...baseMessages,
          {
            id: "streaming_assistant",
            role: "assistant",
            content: "Partial",
            ts: 2,
            status: "streaming",
            error: null,
          },
        ]}
        loading
        showTypingIndicator={false}
        onRetryMessage={jest.fn().mockResolvedValue(undefined)}
        onDeleteMessage={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByText(/assistant is typing/i)).not.toBeInTheDocument();
  });
});
