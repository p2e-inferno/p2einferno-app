import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatPanel } from "@/components/chat/chat-panel";

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
        ]}
        loading={false}
        showTypingIndicator={false}
        showSuggestedPrompts={false}
        pageLabel="Home"
        onClose={jest.fn().mockResolvedValue(undefined)}
        onClearConversation={onClearConversation}
        onDraftChange={onDraftChange}
        onSendMessage={onSendMessage}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /clear conversation/i }),
    );
    expect(onClearConversation).toHaveBeenCalledTimes(1);

    const input = screen.getByRole("textbox", { name: /chat message/i });
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(onSendMessage).toHaveBeenCalledWith("Hello");
  });
});
