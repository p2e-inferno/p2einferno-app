import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/chat/chat-panel";

jest.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: ({
    value,
    onChange,
    onSubmit,
  }: {
    value: string;
    onChange: (value: string) => Promise<void>;
    onSubmit: (payload: { text: string; attachments: [] }) => Promise<void>;
  }) => (
    <div>
      <textarea
        aria-label="Chat message"
        value={value}
        onChange={(event) => {
          void onChange(event.target.value);
        }}
      />
      <button
        type="button"
        aria-label="Send message"
        onClick={() => {
          void onSubmit({ text: value, attachments: [] });
        }}
      >
        Send
      </button>
    </div>
  ),
}));

jest.mock("@/components/chat/chat-message-list", () => ({
  ChatMessageList: () => <div data-testid="chat-message-list" />,
}));

describe("ChatPanel", () => {
  it("exposes clear conversation and keyboard send behavior without UI changes", async () => {
    const user = userEvent.setup();
    const onClearConversation = jest.fn().mockResolvedValue(undefined);
    const onSendMessage = jest.fn().mockResolvedValue(undefined);
    const onDraftChange = jest.fn().mockResolvedValue(undefined);

    render(
      <ChatPanel
        open
        draft="Hello"
        messages={[
          {
            id: "seed",
            role: "assistant",
            content: "Hi",
            ts: 1,
            status: "complete",
            error: null,
          },
          {
            id: "user-1",
            role: "user",
            content: "Hello",
            ts: 2,
            status: "complete",
            error: null,
          },
        ]}
        error={null}
        loading={false}
        showTypingIndicator={false}
        showSuggestedPrompts={false}
        pageLabel="Home"
        onClose={jest.fn().mockResolvedValue(undefined)}
        onClearConversation={onClearConversation}
        onDraftChange={onDraftChange}
        onSendMessage={onSendMessage}
        onRetryMessage={jest.fn().mockResolvedValue(undefined)}
        onDeleteMessage={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear conversation/i }),
    );
    expect(onClearConversation).toHaveBeenCalledTimes(1);

    expect(
      screen.getByRole("textbox", { name: /chat message/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(onSendMessage).toHaveBeenCalledWith({
      text: "Hello",
      attachments: [],
    });
  });

  it("renders chat request errors above the composer", () => {
    render(
      <ChatPanel
        open
        draft=""
        messages={[]}
        error="Chat is temporarily rate limited. Please wait 60 seconds and try again."
        loading={false}
        showTypingIndicator={false}
        showSuggestedPrompts={false}
        pageLabel="Home"
        onClose={jest.fn().mockResolvedValue(undefined)}
        onClearConversation={jest.fn().mockResolvedValue(undefined)}
        onDraftChange={jest.fn().mockResolvedValue(undefined)}
        onSendMessage={jest.fn().mockResolvedValue(undefined)}
        onRetryMessage={jest.fn().mockResolvedValue(undefined)}
        onDeleteMessage={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByText(
        "Chat is temporarily rate limited. Please wait 60 seconds and try again.",
      ),
    ).toBeInTheDocument();
  });
});
