import { render, screen } from "@testing-library/react";
import { ChatMessageBubble } from "@/components/chat/chat-message-bubble";

jest.mock("@/components/common/RichText", () => ({
  RichText: ({ content }: { content: string }) => <>{content}</>,
}));

describe("ChatMessageBubble", () => {
  it("renders normal assistant replies unchanged with the streaming-ready message model", () => {
    render(
      <ChatMessageBubble
        message={{
          id: "assistant_1",
          role: "assistant",
          content: "Normal reply",
          ts: 1,
          status: "complete",
          error: null,
        }}
      />,
    );

    expect(screen.getByText("Normal reply")).toBeInTheDocument();
  });

  it("renders streaming assistant content without breaking the normal bubble path", () => {
    render(
      <ChatMessageBubble
        message={{
          id: "assistant_streaming",
          role: "assistant",
          content: "Partial reply",
          ts: 1,
          status: "streaming",
          error: null,
        }}
      />,
    );

    expect(screen.getByText("Partial reply")).toBeInTheDocument();
  });

  it("renders error assistant content without breaking the normal bubble path", () => {
    render(
      <ChatMessageBubble
        message={{
          id: "assistant_error",
          role: "assistant",
          content: "Failed partial reply",
          ts: 1,
          status: "error",
          error: "Failed",
        }}
      />,
    );

    expect(screen.getByText("Failed partial reply")).toBeInTheDocument();
  });

  it("renders the specific send error for failed user messages", () => {
    render(
      <ChatMessageBubble
        message={{
          id: "user_error",
          role: "user",
          content: "hello",
          ts: 1,
          status: "error",
          error:
            "Chat is temporarily rate limited. Please wait 60 seconds and try again.",
        }}
      />,
    );

    expect(
      screen.getByText(
        "Chat is temporarily rate limited. Please wait 60 seconds and try again.",
      ),
    ).toBeInTheDocument();
  });
});
