import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: successMock, error: errorMock },
}));

import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  beforeEach(() => {
    successMock.mockClear();
    errorMock.mockClear();
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

  it("fires an error toast when the clipboard write rejects", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    render(<CopyButton value="abc" label="thing" />);
    await user.click(screen.getByRole("button", { name: /copy thing/i }));
    expect(errorMock).toHaveBeenCalledWith("Could not copy thing");
  });
});
