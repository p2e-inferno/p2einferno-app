import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatWidgetRoot } from "@/components/chat/chat-widget-root";

describe("ChatWidgetRoot", () => {
  it("opens the chat panel from the launcher", async () => {
    const user = userEvent.setup();

    render(<ChatWidgetRoot />);

    await user.click(screen.getByRole("button", { name: /open onboarding assistant/i }));

    expect(screen.getByRole("button", { name: /close chat/i })).toBeInTheDocument();
    expect(screen.getByText(/quick prompts/i)).toBeInTheDocument();
  });
});
