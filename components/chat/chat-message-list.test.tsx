import { render, screen } from "@testing-library/react";
import { ChatMessageList } from "@/components/chat/chat-message-list";

jest.mock("@/components/chat/chat-message-bubble", () => ({
  ChatMessageBubble: ({ message }: { message: { content: string } }) => (
    <div>{message.content}</div>
  ),
}));

describe("ChatMessageList", () => {
  it("contains scroll chaining within the chat log", () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "Hello",
            ts: 1,
            status: "complete",
            error: null,
          },
        ]}
        loading={false}
        showTypingIndicator={false}
        onRetryMessage={jest.fn().mockResolvedValue(undefined)}
        onDeleteMessage={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    const log = screen.getByRole("log");

    expect(log).toHaveClass("overflow-y-auto");
    expect(log).toHaveClass("overscroll-contain");
    expect(log).toHaveClass("touch-pan-y");
  });
});
