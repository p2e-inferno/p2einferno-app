import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatTeaser } from "@/components/chat/chat-teaser";

describe("ChatTeaser", () => {
  it("opens from a semantic focusable button without regressing dismiss behavior", async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn().mockResolvedValue(undefined);
    const onDismiss = jest.fn().mockResolvedValue(undefined);

    render(
      <ChatTeaser
        open={false}
        visible
        dismissed={false}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />,
    );

    const openButton = screen.getByRole("button", {
      name: /open chat assistant/i,
    });
    await user.tab();
    await user.tab();
    expect(openButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /dismiss help teaser/i }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
