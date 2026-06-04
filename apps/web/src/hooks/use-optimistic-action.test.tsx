import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const { successMock, errorMock } = vi.hoisted(() => ({
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: successMock, error: errorMock },
}));

import { useOptimisticAction } from "./use-optimistic-action";

type Item = { key: string; value: string };

function Harness({
  initial,
  addAction,
  removeAction,
}: {
  initial: Item[];
  addAction: (item: Item) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeAction: (key: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const { items, add, remove, pending } = useOptimisticAction<Item, string>({
    initial,
    addAction,
    removeAction,
    keyFn: (i) => i.key,
    toastMessages: {
      addSuccess: "Added",
      addErrorPrefix: "Add failed",
      removeSuccess: "Removed",
      removeErrorPrefix: "Remove failed",
    },
  });
  return (
    <div>
      <ul>
        {items.map((i) => (
          <li key={i.key} data-key={i.key}>
            {i.key}={i.value}
          </li>
        ))}
      </ul>
      <button onClick={() => add({ key: "B", value: "two" })}>add B</button>
      <button onClick={() => remove("A")}>remove A</button>
      <span data-testid="pending">{pending ? "pending" : "idle"}</span>
    </div>
  );
}

describe("useOptimisticAction", () => {
  beforeEach(() => {
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("adds an item optimistically and fires success toast", async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValue({ ok: true });
    const removeAction = vi.fn().mockResolvedValue({ ok: true });
    render(
      <Harness
        initial={[{ key: "A", value: "one" }]}
        addAction={addAction}
        removeAction={removeAction}
      />,
    );
    await user.click(screen.getByText("add B"));
    expect(await screen.findByText("B=two")).toBeInTheDocument();
    expect(addAction).toHaveBeenCalledWith({ key: "B", value: "two" });
    expect(successMock).toHaveBeenCalledWith("Added");
  });

  it("reverts the item and fires error toast when add fails", async () => {
    const user = userEvent.setup();
    const addAction = vi.fn().mockResolvedValue({ ok: false, error: "duplicate" });
    const removeAction = vi.fn();
    render(
      <Harness
        initial={[{ key: "A", value: "one" }]}
        addAction={addAction}
        removeAction={removeAction}
      />,
    );
    await user.click(screen.getByText("add B"));
    // Eventually reverts
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("B=two")).not.toBeInTheDocument();
    expect(errorMock).toHaveBeenCalledWith("Add failed: duplicate");
  });

  it("removes an item optimistically and fires success toast", async () => {
    const user = userEvent.setup();
    const addAction = vi.fn();
    const removeAction = vi.fn().mockResolvedValue({ ok: true });
    render(
      <Harness
        initial={[{ key: "A", value: "one" }]}
        addAction={addAction}
        removeAction={removeAction}
      />,
    );
    await user.click(screen.getByText("remove A"));
    expect(screen.queryByText("A=one")).not.toBeInTheDocument();
    expect(removeAction).toHaveBeenCalledWith("A");
    expect(successMock).toHaveBeenCalledWith("Removed");
  });
});
