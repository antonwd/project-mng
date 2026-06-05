import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpHint } from "./help-hint";

describe("HelpHint", () => {
  it("renders an accessible help icon button", () => {
    render(<HelpHint>This explains the field</HelpHint>);
    const button = screen.getByRole("button", { name: /help/i });
    expect(button).toBeInTheDocument();
  });

  it("shows its children content when the icon is clicked", async () => {
    const user = userEvent.setup();
    render(<HelpHint>Explanation of the field</HelpHint>);
    expect(screen.queryByText("Explanation of the field")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /help/i }));
    expect(await screen.findByText("Explanation of the field")).toBeInTheDocument();
  });
});
