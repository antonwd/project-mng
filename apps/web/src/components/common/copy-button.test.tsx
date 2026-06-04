import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const { successMock } = vi.hoisted(() => ({ successMock: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { success: successMock, error: vi.fn() },
}));

import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  beforeEach(() => {
    successMock.mockClear();
  });

  it("displays the value", () => {
    render(<CopyButton value="hello" label="thing" />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("writes the value to the clipboard on click", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub; spy on it after setup
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<CopyButton value="hello" label="thing" />);
    await user.click(screen.getByRole("button", { name: /copy thing/i }));
    expect(writeText).toHaveBeenCalledWith("hello");
    writeText.mockRestore();
  });

  it("fires a success toast on copy", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="hello" label="thing" />);
    await user.click(screen.getByRole("button", { name: /copy thing/i }));
    expect(successMock).toHaveBeenCalledWith("thing copied");
  });
});
