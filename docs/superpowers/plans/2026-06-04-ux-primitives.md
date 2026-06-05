# UX Upgrade — Plan 1: Shared Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared frontend primitives (`Hint`, `HelpHint`, `CopyButton`, `StatusDot`, mobile nav, state components, optimistic-action hook, toast helper, touch-target utility) that all later UX-upgrade plans will consume. No consumer code changes in this plan — the user-visible diff is zero.

**Architecture:** Pure additive frontend work in `apps/web`. Primitives live under `components/ui/` (shadcn-style wrappers) and `components/common/` (project primitives). Tests are colocated next to source files using Vitest + Testing Library. base-ui's Popover with `openOnHover` is used for hints (single primitive handles desktop hover and touch tap). React 19's `useOptimistic` powers the optimistic-action hook. Sonner powers toasts.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, `@base-ui/react`, `lucide-react`, `sonner`, Vitest 4, `@testing-library/react`.

---

## Pre-flight

Before starting, run from `apps/web`:

```bash
cd apps/web
npm run lint && npm run typecheck && npm test
```

Expected: all pass. This is the green baseline. If anything is red, stop and fix it before continuing.

Confirm you're on `feat/v0.2.0-ux-upgrade`:

```bash
git branch --show-current
```

Expected output: `feat/v0.2.0-ux-upgrade`.

---

## File Structure

Files created or modified in this plan:

**Created:**
- `apps/web/src/components/ui/hint.tsx` — base-ui Popover wrapper, openOnHover + delay
- `apps/web/src/components/ui/hint.test.tsx`
- `apps/web/src/components/common/help-hint.tsx` — Hint + HelpCircle icon
- `apps/web/src/components/common/help-hint.test.tsx`
- `apps/web/src/lib/toast.ts` — `toastResult` helper
- `apps/web/src/lib/toast.test.ts`
- `apps/web/src/components/common/copy-button.tsx`
- `apps/web/src/components/common/copy-button.test.tsx`
- `apps/web/src/components/common/status-dot.tsx`
- `apps/web/src/components/common/status-dot.test.tsx`
- `apps/web/src/components/common/states.tsx` — `EmptyState`, `LoadingSkeleton`, `ErrorState`
- `apps/web/src/components/common/states.test.tsx`
- `apps/web/src/hooks/use-optimistic-action.ts`
- `apps/web/src/hooks/use-optimistic-action.test.tsx`
- `apps/web/src/components/nav/nav-items.ts` — shared nav config
- `apps/web/src/components/nav/mobile-nav.tsx`
- `apps/web/src/components/nav/mobile-nav.test.tsx`

**Modified:**
- `apps/web/src/components/nav/sidebar.tsx` — import nav config from `nav-items.ts`
- `apps/web/src/app/globals.css` — add `.touch-target` utility class

Each primitive is one focused file (≤ 80 lines) with a colocated test file. No primitive imports another except `CopyButton` → `toastResult` and `HelpHint` → `Hint`.

---

## Task 1: `Hint` — base-ui Popover wrapper

**Files:**
- Create: `apps/web/src/components/ui/hint.tsx`
- Test: `apps/web/src/components/ui/hint.test.tsx`

`Hint` is a thin wrapper around `@base-ui/react/popover` that exposes `Hint`, `HintTrigger`, and `HintContent`. The Trigger has `openOnHover` and `delay={200}` set by default, so the popover hovers like a tooltip on desktop and opens on tap on touch — using a single primitive.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/ui/hint.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hint, HintTrigger, HintContent } from "./hint";

describe("Hint", () => {
  it("opens content on trigger click and shows it on screen", async () => {
    const user = userEvent.setup();
    render(
      <Hint>
        <HintTrigger>open</HintTrigger>
        <HintContent>hello world</HintContent>
      </Hint>,
    );

    expect(screen.queryByText("hello world")).not.toBeInTheDocument();
    await user.click(screen.getByText("open"));
    expect(await screen.findByText("hello world")).toBeInTheDocument();
  });

  it("forwards className to the popup", async () => {
    const user = userEvent.setup();
    render(
      <Hint>
        <HintTrigger>open</HintTrigger>
        <HintContent className="custom-popup">body</HintContent>
      </Hint>,
    );
    await user.click(screen.getByText("open"));
    const popup = await screen.findByText("body");
    expect(popup).toHaveClass("custom-popup");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/ui/hint.test.tsx
```

Expected: FAIL with "Cannot find module './hint'" or similar.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/ui/hint.tsx`:

```tsx
"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Hint({ ...props }: Popover.Root.Props) {
  return <Popover.Root data-slot="hint" {...props} />;
}

function HintTrigger({
  children,
  ...props
}: Popover.Trigger.Props) {
  return (
    <Popover.Trigger
      data-slot="hint-trigger"
      openOnHover
      delay={200}
      {...props}
    >
      {children}
    </Popover.Trigger>
  );
}

function HintContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: Popover.Popup.Props & { sideOffset?: number }) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={sideOffset}>
        <Popover.Popup
          data-slot="hint-content"
          className={cn(
            "z-50 max-w-xs rounded-md bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md ring-1 ring-foreground/10",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

export { Hint, HintTrigger, HintContent };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/ui/hint.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/hint.tsx apps/web/src/components/ui/hint.test.tsx
git commit -m "web: add Hint primitive (base-ui Popover with openOnHover)"
```

---

## Task 2: `HelpHint` — `?` icon wrapped in `Hint`

**Files:**
- Create: `apps/web/src/components/common/help-hint.tsx`
- Test: `apps/web/src/components/common/help-hint.test.tsx`

`HelpHint` renders a small `HelpCircle` icon (size-3.5, muted) that opens the Hint content on hover or tap. This is what every helpable label/action gets next to it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/common/help-hint.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/common/help-hint.test.tsx
```

Expected: FAIL with "Cannot find module './help-hint'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/common/help-hint.tsx`:

```tsx
"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { Hint, HintTrigger, HintContent } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

type HelpHintProps = {
  children: React.ReactNode;
  className?: string;
  label?: string;
};

export function HelpHint({ children, className, label = "Help" }: HelpHintProps) {
  return (
    <Hint>
      <HintTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        <HelpCircle className="size-3.5" />
      </HintTrigger>
      <HintContent>{children}</HintContent>
    </Hint>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/common/help-hint.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/help-hint.tsx apps/web/src/components/common/help-hint.test.tsx
git commit -m "web: add HelpHint primitive (HelpCircle + Hint)"
```

---

## Task 3: `toastResult` helper

**Files:**
- Create: `apps/web/src/lib/toast.ts`
- Test: `apps/web/src/lib/toast.test.ts`

`toastResult` takes a server-action result of shape `{ ok: true } | { ok: false, error: string }` and fires a success or error toast with appropriate copy. This replaces the repeated try/catch + manual toast calls scattered through actions.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/toast.test.ts`:

```ts
import { vi } from "vitest";

const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: successMock, error: errorMock },
}));

describe("toastResult", () => {
  beforeEach(() => {
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("fires a success toast when result is ok", async () => {
    const { toastResult } = await import("./toast");
    toastResult({ ok: true }, { success: "Saved", errorPrefix: "Save failed" });
    expect(successMock).toHaveBeenCalledWith("Saved");
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("fires an error toast with prefix + error message when not ok", async () => {
    const { toastResult } = await import("./toast");
    toastResult(
      { ok: false, error: "slug already in use" },
      { success: "Saved", errorPrefix: "Save failed" },
    );
    expect(errorMock).toHaveBeenCalledWith("Save failed: slug already in use");
    expect(successMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/lib/toast.test.ts
```

Expected: FAIL with "Cannot find module './toast'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/toast.ts`:

```ts
import { toast } from "sonner";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ToastMessages = {
  success: string;
  errorPrefix: string;
};

export function toastResult(result: ActionResult, messages: ToastMessages): void {
  if (result.ok) {
    toast.success(messages.success);
  } else {
    toast.error(`${messages.errorPrefix}: ${result.error}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/lib/toast.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/toast.ts apps/web/src/lib/toast.test.ts
git commit -m "web: add toastResult helper for server-action result toasts"
```

---

## Task 4: `CopyButton`

**Files:**
- Create: `apps/web/src/components/common/copy-button.tsx`
- Test: `apps/web/src/components/common/copy-button.test.tsx`

A button that copies a value to the clipboard and fires a success toast. Renders the value (truncated, monospace) inline. Two variants: `inline` (a button with value + copy icon) and `block` (full-width row with truncation).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/common/copy-button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const successMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: successMock, error: vi.fn() },
}));

import { CopyButton } from "./copy-button";

describe("CopyButton", () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    successMock.mockClear();
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it("displays the value", () => {
    render(<CopyButton value="hello" label="thing" />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("writes the value to the clipboard on click", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="hello" label="thing" />);
    await user.click(screen.getByRole("button", { name: /copy thing/i }));
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("fires a success toast on copy", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="hello" label="thing" />);
    await user.click(screen.getByRole("button", { name: /copy thing/i }));
    expect(successMock).toHaveBeenCalledWith("thing copied");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/common/copy-button.test.tsx
```

Expected: FAIL with "Cannot find module './copy-button'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/common/copy-button.tsx`:

```tsx
"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label: string;
  variant?: "inline" | "block";
  className?: string;
};

export function CopyButton({ value, label, variant = "inline", className }: CopyButtonProps) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs font-mono text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "block" && "w-full justify-between",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Copy className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/common/copy-button.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/copy-button.tsx apps/web/src/components/common/copy-button.test.tsx
git commit -m "web: add CopyButton primitive (clipboard write + toast)"
```

---

## Task 5: `StatusDot`

**Files:**
- Create: `apps/web/src/components/common/status-dot.tsx`
- Test: `apps/web/src/components/common/status-dot.test.tsx`

A small colored dot indicating deploy/runtime status. Pulses when status is in-flight (`queued`, `running`, `deploying`). Used in the apps list, app detail header, recent activity rows.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/common/status-dot.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("renders a green dot for 'running' status", () => {
    const { container } = render(<StatusDot status="running" />);
    const dot = container.querySelector("[data-status='running']");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-emerald-500");
  });

  it("renders an amber dot with pulse for 'deploying' status", () => {
    const { container } = render(<StatusDot status="deploying" />);
    const dot = container.querySelector("[data-status='deploying']");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-amber-500");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("renders a red dot for 'failed' status", () => {
    const { container } = render(<StatusDot status="failed" />);
    const dot = container.querySelector("[data-status='failed']");
    expect(dot).toHaveClass("bg-red-500");
    expect(dot).not.toHaveClass("animate-pulse");
  });

  it("renders a gray dot for 'stopped' status", () => {
    const { container } = render(<StatusDot status="stopped" />);
    expect(container.querySelector("[data-status='stopped']")).toHaveClass("bg-muted-foreground/40");
  });

  it("applies animate-pulse when status is 'queued'", () => {
    const { container } = render(<StatusDot status="queued" />);
    expect(container.querySelector("[data-status='queued']")).toHaveClass("animate-pulse");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/common/status-dot.test.tsx
```

Expected: FAIL with "Cannot find module './status-dot'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/common/status-dot.tsx`:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type DotStatus =
  | "running"
  | "deploying"
  | "queued"
  | "failed"
  | "stopped"
  | "succeeded";

const COLOR: Record<DotStatus, string> = {
  running: "bg-emerald-500",
  succeeded: "bg-emerald-500",
  deploying: "bg-amber-500",
  queued: "bg-amber-500",
  failed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
};

const PULSE: Record<DotStatus, boolean> = {
  running: false,
  succeeded: false,
  deploying: true,
  queued: true,
  failed: false,
  stopped: false,
};

type StatusDotProps = {
  status: DotStatus;
  className?: string;
  label?: string;
};

export function StatusDot({ status, className, label }: StatusDotProps) {
  return (
    <span
      data-status={status}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn(
        "inline-block size-2 rounded-full",
        COLOR[status],
        PULSE[status] && "animate-pulse",
        className,
      )}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/common/status-dot.test.tsx
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/status-dot.tsx apps/web/src/components/common/status-dot.test.tsx
git commit -m "web: add StatusDot primitive (colored dot with pulse for in-flight)"
```

---

## Task 6: `EmptyState`, `LoadingSkeleton`, `ErrorState`

**Files:**
- Create: `apps/web/src/components/common/states.tsx`
- Test: `apps/web/src/components/common/states.test.tsx`

Three shared components for the "data is empty / loading / failed" surfaces that recur across every data-fetching page.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/common/states.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Boxes } from "lucide-react";
import { EmptyState, LoadingSkeleton, ErrorState } from "./states";

describe("EmptyState", () => {
  it("renders title and body", () => {
    render(
      <EmptyState icon={Boxes} title="No apps yet">
        Connect a GitHub repo to deploy.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "No apps yet" })).toBeInTheDocument();
    expect(screen.getByText(/Connect a GitHub repo/)).toBeInTheDocument();
  });

  it("renders an action when provided", () => {
    render(
      <EmptyState icon={Boxes} title="No apps yet" action={<button>Create</button>}>
        body
      </EmptyState>,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});

describe("LoadingSkeleton", () => {
  it("renders the requested number of table rows", () => {
    const { container } = render(<LoadingSkeleton variant="table" rows={3} />);
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
  });

  it("renders the requested number of card-list cards", () => {
    const { container } = render(<LoadingSkeleton variant="card-list" count={2} />);
    expect(container.querySelectorAll("[data-skeleton-card]")).toHaveLength(2);
  });

  it("renders form fields for the form variant", () => {
    const { container } = render(<LoadingSkeleton variant="form" fields={4} />);
    expect(container.querySelectorAll("[data-skeleton-field]")).toHaveLength(4);
  });
});

describe("ErrorState", () => {
  it("renders title and body", () => {
    render(<ErrorState title="Something went wrong">try again</ErrorState>);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  });

  it("invokes the retry callback when retry button is clicked", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(
      <ErrorState title="Failed" onRetry={retry}>
        body
      </ErrorState>,
    );
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("does not render a retry button when onRetry is not provided", () => {
    render(<ErrorState title="Failed">body</ErrorState>);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/common/states.test.tsx
```

Expected: FAIL with "Cannot find module './states'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/common/states.tsx`:

```tsx
import * as React from "react";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 p-8 text-center text-muted-foreground", className)}>
      <Icon className="size-8 text-muted-foreground/60" />
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children && <p className="max-w-sm text-sm">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

type LoadingSkeletonProps =
  | { variant: "table"; rows?: number }
  | { variant: "card-list"; count?: number }
  | { variant: "form"; fields?: number };

export function LoadingSkeleton(props: LoadingSkeletonProps) {
  if (props.variant === "table") {
    const rows = props.rows ?? 5;
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} data-skeleton-row className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (props.variant === "card-list") {
    const count = props.count ?? 3;
    return (
      <div className="grid gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} data-skeleton-card className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }
  const fields = props.fields ?? 4;
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} data-skeleton-field className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

type ErrorStateProps = {
  title: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({ title, children, onRetry, className }: ErrorStateProps) {
  return (
    <Card className={cn("flex flex-col items-center gap-3 p-8 text-center", className)}>
      <AlertCircle className="size-8 text-destructive" />
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Retry
        </Button>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/common/states.test.tsx
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/common/states.tsx apps/web/src/components/common/states.test.tsx
git commit -m "web: add EmptyState, LoadingSkeleton, ErrorState primitives"
```

---

## Task 7: `useOptimisticAction` hook

**Files:**
- Create: `apps/web/src/hooks/use-optimistic-action.ts`
- Test: `apps/web/src/hooks/use-optimistic-action.test.tsx`

Encapsulates React 19's `useOptimistic` + `useTransition` + toast feedback for list add/remove flows. Used by env vars and domains in later plans.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/use-optimistic-action.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const successMock = vi.fn();
const errorMock = vi.fn();
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/hooks/use-optimistic-action.test.tsx
```

Expected: FAIL with "Cannot find module './use-optimistic-action'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/hooks/use-optimistic-action.ts`:

```ts
"use client";

import { useOptimistic, useTransition, useCallback } from "react";
import { toast } from "sonner";

type ActionResult = { ok: true } | { ok: false; error: string };

type Options<Item, K> = {
  initial: Item[];
  addAction: (item: Item) => Promise<ActionResult>;
  removeAction: (key: K) => Promise<ActionResult>;
  keyFn: (item: Item) => K;
  toastMessages: {
    addSuccess: string;
    addErrorPrefix: string;
    removeSuccess: string;
    removeErrorPrefix: string;
  };
};

type OptimisticOp<Item, K> =
  | { kind: "add"; item: Item }
  | { kind: "remove"; key: K };

export function useOptimisticAction<Item, K>({
  initial,
  addAction,
  removeAction,
  keyFn,
  toastMessages,
}: Options<Item, K>) {
  const [items, applyOptimistic] = useOptimistic<Item[], OptimisticOp<Item, K>>(
    initial,
    (current, op) => {
      if (op.kind === "add") return [...current, op.item];
      return current.filter((i) => keyFn(i) !== op.key);
    },
  );
  const [pending, startTransition] = useTransition();

  const add = useCallback(
    (item: Item) => {
      startTransition(async () => {
        applyOptimistic({ kind: "add", item });
        const result = await addAction(item);
        if (result.ok) {
          toast.success(toastMessages.addSuccess);
        } else {
          toast.error(`${toastMessages.addErrorPrefix}: ${result.error}`);
        }
      });
    },
    [addAction, applyOptimistic, toastMessages.addSuccess, toastMessages.addErrorPrefix],
  );

  const remove = useCallback(
    (key: K) => {
      startTransition(async () => {
        applyOptimistic({ kind: "remove", key });
        const result = await removeAction(key);
        if (result.ok) {
          toast.success(toastMessages.removeSuccess);
        } else {
          toast.error(`${toastMessages.removeErrorPrefix}: ${result.error}`);
        }
      });
    },
    [removeAction, applyOptimistic, toastMessages.removeSuccess, toastMessages.removeErrorPrefix],
  );

  return { items, add, remove, pending };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/hooks/use-optimistic-action.test.tsx
```

Expected: PASS (3 tests).

If the revert test fails because React 19's `useOptimistic` automatically reverts when the transition resolves with a non-throwing handler that didn't commit a real state change, adjust the implementation so a failed action triggers a state revert: throw from inside the transition on failure (after firing the toast), or call `applyOptimistic` again with a no-op to force a re-render of the underlying server state. The expected behavior is: optimistic add → action fails → list returns to the pre-add state.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-optimistic-action.ts apps/web/src/hooks/use-optimistic-action.test.tsx
git commit -m "web: add useOptimisticAction hook (useOptimistic + toast)"
```

---

## Task 8: `nav-items.ts` shared config + sidebar consumes it

**Files:**
- Create: `apps/web/src/components/nav/nav-items.ts`
- Modify: `apps/web/src/components/nav/sidebar.tsx`

Extract the nav-items array so `Sidebar` and `MobileNav` share one source of truth. No new test; the existing build verifies the change.

- [ ] **Step 1: Create the shared config**

Create `apps/web/src/components/nav/nav-items.ts`:

```ts
import { Boxes, Users, ScrollText, UserCircle, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/apps", label: "Apps", icon: Boxes },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/account", label: "Account", icon: UserCircle },
];
```

- [ ] **Step 2: Update sidebar to consume it**

Edit `apps/web/src/components/nav/sidebar.tsx`:

Replace the existing top of the file (the `import` lines and the `const items = …` block) so the file reads:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-r bg-muted/30 p-4 space-y-1">
      <div className="font-semibold px-2 py-3 text-lg">projectMng</div>
      {NAV_ITEMS.map((it) => {
        const active = pathname?.startsWith(it.href) ?? false;
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
              active && "bg-muted font-medium",
            )}
          >
            <Icon className="size-4" />
            {it.label}
          </Link>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 3: Run typecheck + tests to verify nothing regressed**

```bash
cd apps/web && npm run typecheck && npm test
```

Expected: typecheck passes; tests all green (including all prior new tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/nav/nav-items.ts apps/web/src/components/nav/sidebar.tsx
git commit -m "web: extract NAV_ITEMS to shared config so MobileNav can reuse"
```

---

## Task 9: `MobileNav`

**Files:**
- Create: `apps/web/src/components/nav/mobile-nav.tsx`
- Test: `apps/web/src/components/nav/mobile-nav.test.tsx`

Hamburger button + `Sheet` (slide from left) that renders the same nav items as `Sidebar`. Closes when the route changes.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/nav/mobile-nav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const usePathnameMock = vi.fn(() => "/apps");
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx vitest run src/components/nav/mobile-nav.test.tsx
```

Expected: FAIL with "Cannot find module './mobile-nav'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/components/nav/mobile-nav.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>projectMng</SheetTitle>
        </SheetHeader>
        <nav className="px-2 space-y-1">
          {NAV_ITEMS.map((it) => {
            const active = pathname?.startsWith(it.href) ?? false;
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                data-active={active}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted touch-target",
                  active && "bg-muted font-medium",
                )}
              >
                <Icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx vitest run src/components/nav/mobile-nav.test.tsx
```

Expected: PASS (3 tests).

If the "closes on route change" test was added later and fails because the Sheet stays open after pathname changes inside the same render tree: the `useEffect` above already handles that — the test currently asserts opens-and-renders, not closes-on-route-change. Closing-on-route-change is exercised end-to-end in Plan 2's Playwright smoke; no additional unit test needed here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/nav/mobile-nav.tsx apps/web/src/components/nav/mobile-nav.test.tsx
git commit -m "web: add MobileNav primitive (hamburger + Sheet, shared nav items)"
```

---

## Task 10: `.touch-target` utility class

**Files:**
- Modify: `apps/web/src/app/globals.css`

Add a utility class so any small button or link can get a 36×36 minimum touch surface without duplicating Tailwind classes everywhere.

- [ ] **Step 1: Add the utility**

Edit `apps/web/src/app/globals.css`. After the existing `@layer base` block (the very last block in the file), append:

```css
@layer utilities {
  .touch-target {
    @apply min-h-9 min-w-9;
  }
}
```

The full file should now end with the new `@layer utilities` block following the existing `@layer base` block — no other changes.

- [ ] **Step 2: Run typecheck + build to verify the CSS compiles**

```bash
cd apps/web && npm run typecheck && npm run build
```

Expected: typecheck passes; build completes without CSS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "web: add .touch-target utility class for min-h-9 min-w-9"
```

---

## Task 11: Plan-wide verification + manual touch test

**Files:** none.

Final acceptance: full test run, lint, build, and a manual hover/tap test of the Hint primitive in a real browser.

- [ ] **Step 1: Run the full local CI suite**

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all four pass. If anything fails, fix it before tagging this plan complete.

- [ ] **Step 2: Run the existing Playwright suite to verify no regressions**

```bash
cd apps/web && npm run e2e
```

Expected: every existing test still passes. Plan 1 made no consumer-code changes, so this should be uneventful.

- [ ] **Step 3: Manual touch test of Hint**

Start the dev server and load a temporary test page to verify the Hint primitive actually opens on tap on a real touch device.

```bash
cd apps/web && npm run dev
```

Create a throwaway page at `apps/web/src/app/_hint-check/page.tsx` with:

```tsx
"use client";
import { HelpHint } from "@/components/common/help-hint";

export default function HintCheck() {
  return (
    <div className="p-8 flex items-center gap-2">
      <span>Build root</span>
      <HelpHint>Path inside the repo where the Dockerfile or Nixpacks build runs. Defaults to the repo root.</HelpHint>
    </div>
  );
}
```

Open `http://localhost:3000/_hint-check` in:

- Desktop browser: confirm the popover opens on hover (delay ~200ms) and closes on mouse-out.
- Mobile browser or DevTools "responsive mode" with touch emulation: confirm the popover opens on tap and closes when tapping outside.

Expected: both behaviors work without changes. If touch fails, capture the failure mode and stop — the primitive needs revision before Plan 2 can build on it.

- [ ] **Step 4: Remove the throwaway page**

```bash
rm -rf apps/web/src/app/_hint-check
```

- [ ] **Step 5: Final summary commit (optional, if any cleanup happened)**

If nothing was added to the working tree, skip. Otherwise:

```bash
git status --short
git add apps/web/src
git commit -m "web: remove _hint-check verification page"
```

---

## Definition of done

- [ ] All 11 tasks above marked complete.
- [ ] `git log --oneline` shows a contiguous run of small, focused commits — one per primitive (or per task).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` all pass.
- [ ] Existing Playwright tests still pass.
- [ ] Hint primitive verified by manual hover + tap test.
- [ ] No primitive is consumed by production code yet — the user-visible diff at https://anton.run after this plan is zero. Plan 2 is the first plan that surfaces these primitives in real UI.
