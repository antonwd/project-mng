import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(() => "/apps"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { MobileNav } from "./mobile-nav";

describe("MobileNav", () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue("/apps");
  });

  it("renders a hamburger trigger button", () => {
    render(<MobileNav />);
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });

  it("opens the sheet and shows all nav items when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);
    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(await screen.findByRole("link", { name: /apps/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /users/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /audit log/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /account/i })).toBeInTheDocument();
  });

  it("marks the active route", async () => {
    const user = userEvent.setup();
    usePathnameMock.mockReturnValue("/users");
    render(<MobileNav />);
    await user.click(screen.getByRole("button", { name: /open menu/i }));
    const usersLink = await screen.findByRole("link", { name: /users/i });
    expect(usersLink).toHaveAttribute("data-active", "true");
  });
});
