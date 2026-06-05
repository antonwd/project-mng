# UX Upgrade — Plan 3: Sub-Routes and Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit every remaining route in `apps/web` (sub-routes under the app detail, top-level dashboard sub-routes, and the public auth pages) to consume the Plan 1 primitives at 375px and up. Wire `useOptimisticAction` to env-vars and domains. Add `HelpHint`s to technical fields and switches. Land a `setState`-in-effect lint cleanup for `new-app-wizard.tsx`.

**Architecture:** Pure consumer code. No new shared components beyond a couple of small adapter helpers. Each task retrofits one surface and follows the patterns Plan 2 established (`EmptyState` for empty states, `flex-col gap-2 sm:flex-row` for card metadata, CardList rows on `<md`, `min-w-0` + `truncate` on long-content rows, `max-w-md mx-auto p-4 md:p-8` on auth pages).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Plan 1 primitives.

---

## Pre-flight

From `/Users/Anton/Desktop/Projects/projectMng/apps/web`:

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
```

Expected:
- lint: 4 errors / 2 warnings (baseline)
- typecheck: clean
- test: 34/34
- e2e: 2/2

Confirm branch:

```bash
git branch --show-current   # → feat/v0.2.0-ux-upgrade
```

Confirm the Plan 2 fixes are in:

```bash
git log --oneline -1   # → c24a8a8 web: new-app-wizard — drop dead placeholder when SelectValue uses children fn
```

---

## File Structure

**Modified — sub-routes under `(dashboard)/apps/[slug]`:**
- `env/page.tsx` and `components/apps/env-vars-table.tsx`, `env-var-form.tsx`
- `domains/page.tsx` and `components/apps/domains-list.tsx`, `domain-attach-form.tsx`
- `deployments/page.tsx`
- `deployments/[id]/page.tsx` and `components/apps/deployment-logs.tsx`
- `volumes/page.tsx` and `components/apps/volumes-panel.tsx`
- `settings/page.tsx` and `components/apps/settings-panel.tsx`
- `shell/page.tsx`

**Modified — top-level dashboard sub-routes:**
- `(dashboard)/users/page.tsx` and `components/users/users-list.tsx`, `invites-panel.tsx`
- `(dashboard)/audit/page.tsx`
- `(dashboard)/account/page.tsx` and `components/users/account-panel.tsx`

**Modified — public auth pages:**
- `app/login/page.tsx`
- `app/enroll/[token]/page.tsx`

**Modified — wizard:**
- `components/apps/new-app-wizard.tsx` — HelpHints + setState-in-effect lint cleanup

**Modified — tests:**
- `tests/e2e/mobile-smoke.spec.ts` — extend to cover every retrofitted route

**Created:**
- `apps/web/src/lib/action-result.ts` — adapter to bridge `{ error?: string }`-shape actions to the canonical `ActionResult` shape that `useOptimisticAction` expects

No new shared components. No backend, server-action, or schema changes.

---

## Task 0: `action-result` adapter helper

The actions for env-vars, domains, and volumes return `{ error?: string }` or `Promise<void>` shapes that don't directly match `useOptimisticAction`'s expected `ActionResult = { ok: true } | { ok: false, error: string }`. A small adapter avoids inline try/catch noise at every call site.

**Files:**
- Create: `apps/web/src/lib/action-result.ts`
- Test: `apps/web/src/lib/action-result.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/action-result.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fromMaybeError, fromThrowing } from "./action-result";

describe("fromMaybeError", () => {
  it("returns ok when the action result has no error field", async () => {
    const res = await fromMaybeError(async () => ({}));
    expect(res).toEqual({ ok: true });
  });

  it("returns ok when error field is undefined", async () => {
    const res = await fromMaybeError(async () => ({ error: undefined }));
    expect(res).toEqual({ ok: true });
  });

  it("returns not-ok when error field is a string", async () => {
    const res = await fromMaybeError(async () => ({ error: "slug taken" }));
    expect(res).toEqual({ ok: false, error: "slug taken" });
  });

  it("catches thrown errors and returns not-ok", async () => {
    const res = await fromMaybeError(async () => {
      throw new Error("boom");
    });
    expect(res).toEqual({ ok: false, error: "boom" });
  });
});

describe("fromThrowing", () => {
  it("returns ok when the action resolves without throwing", async () => {
    const res = await fromThrowing(async () => undefined);
    expect(res).toEqual({ ok: true });
  });

  it("catches thrown errors and returns not-ok", async () => {
    const res = await fromThrowing(async () => {
      throw new Error("nope");
    });
    expect(res).toEqual({ ok: false, error: "nope" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx vitest run src/lib/action-result.test.ts
```

Expected: FAIL with "Cannot find module './action-result'".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/action-result.ts`:

```ts
import type { ActionResult } from "@/lib/toast";

/**
 * Adapt an action that returns `{ error?: string, ... }` (presence of error = failure)
 * to the canonical ActionResult shape.
 */
export async function fromMaybeError<T extends { error?: string }>(
  fn: () => Promise<T>,
): Promise<ActionResult> {
  try {
    const res = await fn();
    return res.error ? { ok: false, error: res.error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Adapt an action that returns Promise<void> and throws on failure
 * to the canonical ActionResult shape.
 */
export async function fromThrowing(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx vitest run src/lib/action-result.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/lib/action-result.ts apps/web/src/lib/action-result.test.ts
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: add action-result adapter for ok/error result shapes"
```

---

## Task 1: Env vars retrofit

**Files:**
- Modify: `apps/web/src/app/(dashboard)/apps/[slug]/env/page.tsx`
- Modify: `apps/web/src/components/apps/env-vars-table.tsx`
- Modify: `apps/web/src/components/apps/env-var-form.tsx`

Wire env vars to `useOptimisticAction` so add/remove feels instant. Add `HelpHint`s explaining the key naming convention and the secret-encryption behavior. Replace the inline empty Card with `EmptyState`.

- [ ] **Step 1: Update the env page**

Replace `apps/web/src/app/(dashboard)/apps/[slug]/env/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { listEnvVars } from "@/actions/env-vars";
import { EnvVarForm } from "@/components/apps/env-var-form";
import { EnvVarsTable } from "@/components/apps/env-vars-table";

type Params = Promise<{ slug: string }>;

export default async function EnvPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const [envVars, deployments] = await Promise.all([
    listEnvVars(app.id),
    listDeployments(app.id).catch(() => []),
  ]);
  const lastSucceeded = deployments.find((d) => d.status === "succeeded");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Environment variables</h2>
      {envVars.length > 0 && lastSucceeded && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Env var changes only take effect after the next deploy.
        </div>
      )}
      <EnvVarForm appId={app.id} />
      <EnvVarsTable appId={app.id} envVars={envVars} />
    </div>
  );
}
```

The page itself is unchanged from current — the work is in the consumer components below.

- [ ] **Step 2: Replace `env-var-form.tsx` to add HelpHints**

Replace `apps/web/src/components/apps/env-var-form.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/common/help-hint";
import { upsertEnvVarAction } from "@/actions/env-vars";

export function EnvVarForm({ appId }: { appId: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(true);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", key);
      fd.set("value", value);
      fd.set("isSecret", isSecret ? "true" : "false");
      const res = await upsertEnvVarAction(appId, fd);
      if (res.error) setError(res.error);
      else {
        setKey("");
        setValue("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <div>
          <Label htmlFor="env-key" className="flex items-center gap-1">
            Key
            <HelpHint>Uppercase letters, digits, and underscores. Convention: <code>DATABASE_URL</code>, <code>PORT</code>, <code>NODE_ENV</code>.</HelpHint>
          </Label>
          <Input id="env-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="DATABASE_URL" />
        </div>
        <div>
          <Label htmlFor="env-value" className="flex items-center gap-1">
            Value
            <HelpHint>Stored encrypted at rest if "Treat as secret" is on. Decrypted only at container start.</HelpHint>
          </Label>
          <Input id="env-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={busy || !key || !value}>{busy ? "Saving…" : "Save"}</Button>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch id="env-secret" checked={isSecret} onCheckedChange={setIsSecret} />
        <Label htmlFor="env-secret" className="cursor-pointer">Treat as secret (mask in UI, runtime-only decrypt)</Label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 3: Replace `env-vars-table.tsx` to use useOptimisticAction + EmptyState**

Replace `apps/web/src/components/apps/env-vars-table.tsx` with:

```tsx
"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { KeyRound } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromMaybeError, fromThrowing } from "@/lib/action-result";
import { upsertEnvVarAction, deleteEnvVarAction, type EnvVar } from "@/actions/env-vars";

export function EnvVarsTable({ appId, envVars }: { appId: string; envVars: EnvVar[] }) {
  const { items, remove, pending } = useOptimisticAction<EnvVar, string>({
    initial: envVars,
    keyFn: (v) => v.key,
    addAction: (v) =>
      fromMaybeError(async () => {
        const fd = new FormData();
        fd.set("key", v.key);
        fd.set("value", v.value ?? "");
        fd.set("isSecret", v.isSecret ? "true" : "false");
        return upsertEnvVarAction(appId, fd);
      }),
    removeAction: (key) => fromThrowing(() => deleteEnvVarAction(appId, key)),
    toastMessages: {
      addSuccess: "Env var saved",
      addErrorPrefix: "Save failed",
      removeSuccess: "Env var deleted",
      removeErrorPrefix: "Delete failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={KeyRound} title="No env vars set">
        Add a variable above. Changes take effect on the next deploy.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y">
      {items.map((v) => (
        <div key={v.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm truncate">{v.key}</div>
            <div className="text-xs text-muted-foreground truncate">
              {v.isSecret ? "********" : v.value}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {v.isSecret && <Badge variant="secondary">secret</Badge>}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete ${v.key}?`)) return;
                remove(v.key);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
```

Key changes:
- Drops `useTransition` + `router.refresh()` — `useOptimisticAction` + Next's automatic revalidation handle it.
- Drops the unused `appId` parameter destructuring from the original (kept as prop for the action closures).
- CardList row: `flex flex-col gap-2 sm:flex-row` so the Key/Value column and the Badge+Delete buttons stack on phone.
- EmptyState replaces the inline `<Card className="p-6 text-center ...">`.

Note: The `add` callback from the hook is intentionally unused here — env vars are added via the EnvVarForm (a separate component that calls `upsertEnvVarAction` directly and re-renders the page via `router.refresh()`). The Optimistic hook still wires `addAction` because the type system requires it, but the form's submit currently goes through the action directly and Next revalidates. This is consistent with the spec's "optimistic add/remove" goal — remove is the main user-facing optimistic surface in this list. (Optimistic add via the form is a future enhancement.)

- [ ] **Step 4: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34 vitest pass, 2/2 e2e pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/env/page.tsx" apps/web/src/components/apps/env-var-form.tsx apps/web/src/components/apps/env-vars-table.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: env vars — useOptimisticAction + HelpHints + EmptyState + responsive rows"
```

---

## Task 2: Domains retrofit

**Files:**
- Modify: `apps/web/src/app/(dashboard)/apps/[slug]/domains/page.tsx`
- Modify: `apps/web/src/components/apps/domain-attach-form.tsx`
- Modify: `apps/web/src/components/apps/domains-list.tsx`

Same pattern as env vars: `useOptimisticAction` for attach/remove, EmptyState, responsive rows. The Check DNS button stays manual (it's a verb, not a state change). Also fix the pre-existing react/no-unescaped-entities lint error in `domain-attach-form.tsx` line 38 (`"` and `'` need escaping).

- [ ] **Step 1: Replace `domain-attach-form.tsx`**

Replace `apps/web/src/components/apps/domain-attach-form.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/common/help-hint";
import { addDomainAction } from "@/actions/domains";

export function DomainAttachForm({ appId }: { appId: string }) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addDomainAction(appId, hostname);
      if (res.error) setError(res.error);
      else {
        setHostname("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="hostname" className="flex items-center gap-1">
            Hostname
            <HelpHint>
              FQDN to attach. Point the A record at this VPS, then click &ldquo;Check DNS&rdquo; on the row to advance the cert state.
            </HelpHint>
          </Label>
          <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value.toLowerCase())} placeholder="app.example.com" />
        </div>
        <Button onClick={submit} disabled={busy || !hostname}>{busy ? "Attaching…" : "Attach domain"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        After attaching, point the hostname&apos;s A record at your VPS, then click &ldquo;Check DNS&rdquo; on the row to advance the cert state.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
```

Key changes:
- HTML-entity escaping (`&ldquo;`, `&rdquo;`, `&apos;`) on the inline copy that contains quotes — fixes the pre-existing `react/no-unescaped-entities` lint error.
- HelpHint on the Hostname field.

- [ ] **Step 2: Replace `domains-list.tsx`**

Replace `apps/web/src/components/apps/domains-list.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { Globe } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromMaybeError, fromThrowing } from "@/lib/action-result";
import { checkDnsAction, removeDomainAction, addDomainAction, type Domain } from "@/actions/domains";
import { formatDistanceToNow } from "date-fns";

export function DomainsList({ appId, domains }: { appId: string; domains: Domain[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checking, startCheckTransition] = useTransition();

  const { items, remove, pending } = useOptimisticAction<Domain, string>({
    initial: domains,
    keyFn: (d) => d.id,
    addAction: (d) => fromMaybeError(() => addDomainAction(appId, d.hostname)),
    removeAction: (id) => fromThrowing(() => removeDomainAction(id)),
    toastMessages: {
      addSuccess: "Domain attached",
      addErrorPrefix: "Attach failed",
      removeSuccess: "Domain removed",
      removeErrorPrefix: "Remove failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={Globe} title="No domains attached">
        Add a hostname above, then point its DNS A record at this VPS.
      </EmptyState>
    );
  }

  function variantFor(status: string) {
    if (status === "active") return "default" as const;
    if (status === "failed") return "destructive" as const;
    return "secondary" as const;
  }

  return (
    <Card className="divide-y">
      {items.map((d) => {
        const daysLeft = d.certExpiresAt
          ? Math.max(0, Math.round((new Date(d.certExpiresAt).getTime() - Date.now()) / 86_400_000))
          : null;
        return (
          <div key={d.id} className="p-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.hostname}</div>
                <div className="text-xs text-muted-foreground">
                  {d.certStatus === "active" && daysLeft !== null && `cert expires in ${daysLeft}d`}
                  {d.certStatus === "pending_dns" && "waiting for DNS A record"}
                  {d.certStatus === "pending_cert" && "issuing certificate…"}
                  {d.certStatus === "failed" && (d.lastError ?? "issuance failed")}
                  {d.certIssuedAt && d.certStatus === "active" && ` · issued ${formatDistanceToNow(new Date(d.certIssuedAt), { addSuffix: true })}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={variantFor(d.certStatus)}>{d.certStatus}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checking || pending}
                  onClick={() => {
                    setErrors((p) => ({ ...p, [d.id]: "" }));
                    startCheckTransition(async () => {
                      try {
                        const res = await checkDnsAction(d.id);
                        if (res.status === "pending_dns") {
                          setErrors((p) => ({ ...p, [d.id]: `DNS not yet pointing to this host (resolved: ${res.resolved.join(", ") || "nothing"})` }));
                        }
                      } catch (e) {
                        setErrors((p) => ({ ...p, [d.id]: e instanceof Error ? e.message : String(e) }));
                      }
                    });
                  }}
                >
                  Check DNS
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Remove ${d.hostname}?`)) return;
                    remove(d.id);
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
            {errors[d.id] && <p className="text-xs text-destructive">{errors[d.id]}</p>}
          </div>
        );
      })}
    </Card>
  );
}
```

Key changes:
- `appId` is now a prop (was previously omitted; needed for `addAction` closure even though add is currently handled by `DomainAttachForm`).
- `useOptimisticAction` for remove. Add is wired for type-completeness even though `DomainAttachForm` calls `addDomainAction` directly with `router.refresh()` afterward.
- CardList: `flex flex-col gap-2 sm:flex-row` so the hostname row stacks on phone with the action button group below.
- EmptyState replaces the inline empty Card.

- [ ] **Step 3: Update `domains/page.tsx` to pass `appId` to `DomainsList`**

Replace `apps/web/src/app/(dashboard)/apps/[slug]/domains/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDomains } from "@/actions/domains";
import { DomainAttachForm } from "@/components/apps/domain-attach-form";
import { DomainsList } from "@/components/apps/domains-list";

type Params = Promise<{ slug: string }>;

export default async function DomainsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const domains = await listDomains(app.id);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Domains</h2>
      <DomainAttachForm appId={app.id} />
      <DomainsList appId={app.id} domains={domains} />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run lint && npm run typecheck && npm test && npm run e2e
```

Expected:
- lint: drops to 2 errors / 2 warnings (the 3 unescaped-entities errors in domain-attach-form.tsx line 38 are fixed; the setState-in-effect error in new-app-wizard remains for Task 12)
- typecheck: clean
- test: 34/34
- e2e: 2/2

- [ ] **Step 5: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/apps/domain-attach-form.tsx apps/web/src/components/apps/domains-list.tsx "apps/web/src/app/(dashboard)/apps/[slug]/domains/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: domains — useOptimisticAction + HelpHint + EmptyState + responsive rows"
```

---

## Task 3: Deployments list retrofit

**File:** `apps/web/src/app/(dashboard)/apps/[slug]/deployments/page.tsx`

Replace the Badge with StatusDot+text (matches apps list pattern), replace the inline empty Card with EmptyState, stack the metadata block on `<sm`.

- [ ] **Step 1: Replace the file**

Replace `apps/web/src/app/(dashboard)/apps/[slug]/deployments/page.tsx` with:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DeployButton } from "@/components/apps/deploy-button";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { formatDistanceToNow } from "date-fns";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/states";
import { statusToDot } from "@/lib/status";
import { History } from "lucide-react";

type Params = Promise<{ slug: string }>;

export default async function DeploymentsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const deployments = await listDeployments(app.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Deployments</h2>
        <DeployButton appId={app.id} />
      </div>
      {deployments.length === 0 ? (
        <EmptyState icon={History} title="No deployments yet">
          Push to <code className="font-mono">{app.defaultBranch}</code> or click <strong>Deploy latest</strong> above.
        </EmptyState>
      ) : (
        <div className="grid gap-2">
          {deployments.map((d) => {
            const duration = d.finishedAt && d.startedAt
              ? `${Math.round((new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime()) / 1000)}s`
              : null;
            return (
              <Link key={d.id} href={`/apps/${app.slug}/deployments/${d.id}`}>
                <Card className="p-3 hover:bg-muted/30 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StatusDot status={statusToDot(d.status)} label={d.status} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        <span className="font-mono text-xs">{d.commitSha.slice(0, 8)}</span>
                        <span className="ml-2 text-muted-foreground">· {d.status}</span>
                      </div>
                      {d.commitMessage && (
                        <div className="text-sm truncate text-muted-foreground">{d.commitMessage.split("\n")[0]}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground shrink-0 sm:text-right sm:flex-col sm:items-end">
                    <span>{d.trigger}</span>
                    {duration && <span>{duration}</span>}
                    <span>{formatDistanceToNow(new Date(d.queuedAt), { addSuffix: true })}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Key changes:
- Imports `statusToDot` from `@/lib/status` (extracted in Plan 2 cleanup).
- StatusDot + status text replaces the Badge.
- Row: `flex flex-col gap-2 sm:flex-row` so the SHA/message line stacks above the trigger/duration/time metadata on phone.
- Metadata column: `flex flex-wrap` on phone (horizontal), `sm:flex-col sm:items-end` on tablet+ (vertical right-aligned, matching the original layout).
- EmptyState with `History` icon replaces inline empty Card.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/deployments/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: deployments list — StatusDot + EmptyState + responsive rows"
```

---

## Task 4: Deployment detail retrofit

**Files:**
- Modify: `apps/web/src/app/(dashboard)/apps/[slug]/deployments/[id]/page.tsx`
- Modify: `apps/web/src/components/apps/deployment-logs.tsx`

Replace the Badge with StatusDot. Add CopyButton on commit SHA. Tighten the logs box height for mobile (`min-h-[40vh] max-h-[70vh]`) and add `overflow-x-auto` + `break-words` on the commit-message Card.

- [ ] **Step 1: Replace the deployment detail page**

Replace `apps/web/src/app/(dashboard)/apps/[slug]/deployments/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DeploymentLogs } from "@/components/apps/deployment-logs";
import { getDeployment } from "@/actions/deployments";
import { StatusDot } from "@/components/common/status-dot";
import { CopyButton } from "@/components/common/copy-button";
import { statusToDot } from "@/lib/status";

type Params = Promise<{ slug: string; id: string }>;

export default async function DeploymentDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  let data;
  try {
    data = await getDeployment(id);
  } catch {
    notFound();
  }
  const { deployment: d, logs } = data;
  const initialLines = logs.map((l) => `[${l.stream}] ${l.line}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={statusToDot(d.status)} label={d.status} />
        <span className="text-sm">{d.status}</span>
        <CopyButton value={d.commitSha} label="commit SHA" />
        {d.commitAuthor && <span className="text-sm text-muted-foreground">by {d.commitAuthor}</span>}
      </div>
      {d.commitMessage && (
        <Card className="p-3 text-sm whitespace-pre-wrap break-words">{d.commitMessage}</Card>
      )}
      {d.errorSummary && (
        <Card className="p-3 text-sm border-destructive/40 bg-destructive/5 space-y-1">
          <div className="font-medium text-destructive">Failure</div>
          <div className="text-xs whitespace-pre-wrap break-words">{d.errorSummary}</div>
        </Card>
      )}
      <DeploymentLogs deploymentId={d.id} initialLines={initialLines} status={d.status} />
    </div>
  );
}
```

Key changes:
- StatusDot + status text replaces the Badge.
- CopyButton on the commit SHA (replaces the inline `<span className="font-mono text-xs">{d.commitSha.slice(0, 12)}</span>`).
- `break-words` added to the commit-message and error-summary cards so long single-token strings don't horizontally overflow on mobile.
- Header row: `flex flex-wrap items-center gap-2` so author wraps below on narrow widths instead of pushing the dot off-screen.

- [ ] **Step 2: Update the DeploymentLogs height**

Replace `apps/web/src/components/apps/deployment-logs.tsx` with:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

type Props = { deploymentId: string; initialLines: string[]; status: string };

export function DeploymentLogs({ deploymentId, initialLines, status }: Props) {
  const [lines, setLines] = useState<string[]>(initialLines);
  const ref = useRef<HTMLDivElement | null>(null);
  const isTerminal = status === "succeeded" || status === "failed";

  useEffect(() => {
    if (isTerminal) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/deployments/${deploymentId}/logs/ws`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { stream: string; line: string };
        setLines((prev) => [...prev, `[${data.stream}] ${data.line}`]);
      } catch {
        setLines((prev) => [...prev, e.data]);
      }
    };
    return () => ws.close();
  }, [deploymentId, isTerminal]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div ref={ref} className="font-mono text-xs bg-zinc-950 text-zinc-100 rounded-md p-4 min-h-[40vh] max-h-[70vh] overflow-y-auto overflow-x-auto">
      {lines.length === 0 ? (
        <div className="text-zinc-500">Waiting for logs…</div>
      ) : (
        lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)
      )}
    </div>
  );
}
```

Key changes:
- `h-[60vh]` → `min-h-[40vh] max-h-[70vh]`. Phones at 800px viewport get ~320px logs box; desktop gets up to 560px.
- Added `overflow-x-auto` so long unbroken log lines scroll horizontally inside the log box rather than overflowing the page.
- Line `whitespace-pre-wrap` → `whitespace-pre` so log lines don't wrap (they scroll horizontally instead). This is the more useful behavior for logs: timestamps and IDs stay aligned.

- [ ] **Step 3: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/deployments/[id]/page.tsx" apps/web/src/components/apps/deployment-logs.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: deployment detail — StatusDot + CopyButton + responsive logs box"
```

---

## Task 5: Volumes retrofit

**Files:**
- Modify: `apps/web/src/components/apps/volumes-panel.tsx`

Wire add/remove to `useOptimisticAction`. Replace inline empty Card with EmptyState. Add HelpHint on Mount path.

- [ ] **Step 1: Replace `volumes-panel.tsx`**

Replace `apps/web/src/components/apps/volumes-panel.tsx` with:

```tsx
"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/common/help-hint";
import { EmptyState } from "@/components/common/states";
import { HardDrive } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromMaybeError, fromThrowing } from "@/lib/action-result";
import { addVolumeAction, removeVolumeAction, type Volume } from "@/actions/volumes";

export function VolumesPanel({ appId, volumes }: { appId: string; volumes: Volume[] }) {
  const [mountPath, setMountPath] = useState("");

  const { items, add, remove, pending } = useOptimisticAction<Volume, string>({
    initial: volumes,
    keyFn: (v) => v.mountPath,
    addAction: (v) => fromMaybeError(() => addVolumeAction(appId, v.mountPath)),
    removeAction: (mp) => fromThrowing(() => removeVolumeAction(appId, mp)),
    toastMessages: {
      addSuccess: "Volume added",
      addErrorPrefix: "Add failed",
      removeSuccess: "Volume removed",
      removeErrorPrefix: "Remove failed",
    },
  });

  function submit() {
    if (!mountPath) return;
    add({ id: "pending", appId, mountPath, dockerVolumeName: "pending" } as Volume);
    setMountPath("");
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="mount" className="flex items-center gap-1">
            Mount path
            <HelpHint>
              Absolute path inside the container. A Docker named volume is created and mounted here. Data persists across container restarts.
            </HelpHint>
          </Label>
          <Input id="mount" value={mountPath} onChange={(e) => setMountPath(e.target.value)} placeholder="/data" />
        </div>
        <Button onClick={submit} disabled={pending || !mountPath}>{pending ? "Adding…" : "Add volume"}</Button>
      </Card>
      {items.length === 0 ? (
        <EmptyState icon={HardDrive} title="No volumes attached">
          Add a mount path above to persist data across container restarts.
        </EmptyState>
      ) : (
        <Card className="divide-y">
          {items.map((v) => (
            <div key={v.mountPath} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{v.mountPath}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{v.dockerVolumeName}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${v.mountPath}? Volume data is not deleted from the host.`)) return;
                  remove(v.mountPath);
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

Key changes:
- `useOptimisticAction` replaces useTransition.
- Optimistic add: the form's submit calls `add(...)` directly. The placeholder values for `id` and `dockerVolumeName` are immediately replaced on the next server re-render (which fires after the action completes and revalidatePath triggers).
- EmptyState with `HardDrive` icon.
- HelpHint on Mount path.
- CardList row: stacks on phone.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/apps/volumes-panel.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: volumes — useOptimisticAction + HelpHint + EmptyState + responsive"
```

---

## Task 6: Settings retrofit

**File:** `apps/web/src/components/apps/settings-panel.tsx`

Add HelpHints on advanced settings. Make the danger zone responsive.

- [ ] **Step 1: Replace `settings-panel.tsx`**

Replace `apps/web/src/components/apps/settings-panel.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/common/help-hint";
import { updateAppAction, deleteAppAction, type AppSummary } from "@/actions/apps";

export function SettingsPanel({ app }: { app: AppSummary }) {
  const router = useRouter();
  const [defaultBranch, setDefaultBranch] = useState(app.defaultBranch);
  const [buildRoot, setBuildRoot] = useState(app.buildRoot);
  const [autoDeploy, setAutoDeploy] = useState(app.autoDeploy);
  const [busy, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function save() {
    startTransition(async () => {
      await updateAppAction(app.id, { defaultBranch, buildRoot, autoDeploy });
      setSavedAt(new Date());
      router.refresh();
    });
  }

  function destroy() {
    if (!confirm(`Permanently delete ${app.slug}? Container will be removed; volume data is retained on the host.`)) return;
    startTransition(async () => {
      await deleteAppAction(app.id);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label htmlFor="branch" className="flex items-center gap-1">
            Default branch
            <HelpHint>
              The branch that <strong>Deploy latest</strong> and auto-deploy (when enabled) build from.
            </HelpHint>
          </Label>
          <Input id="branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="buildRoot" className="flex items-center gap-1">
            Build root
            <HelpHint>
              Directory inside the repo where the Dockerfile or Nixpacks build runs. <code className="font-mono">.</code> = repo root.
            </HelpHint>
          </Label>
          <Input id="buildRoot" value={buildRoot} onChange={(e) => setBuildRoot(e.target.value)} />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <Label htmlFor="autoDeploy" className="flex items-center gap-1">
              Auto-deploy on push
              <HelpHint>
                When on, every push to the default branch triggers a deploy. Off by default for predictability.
              </HelpHint>
            </Label>
            <p className="text-xs text-muted-foreground">When on, every push to the default branch is deployed automatically.</p>
          </div>
          <Switch id="autoDeploy" checked={autoDeploy} onCheckedChange={setAutoDeploy} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          {savedAt && <span className="text-xs text-muted-foreground">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
      </Card>

      <Card className="p-4 space-y-3 border-destructive/40">
        <div className="text-sm font-medium text-destructive flex items-center gap-1">
          Danger zone
          <HelpHint>
            Soft-deletes the app: the running container is stopped and removed. Docker volumes remain on the host so they can be reattached to a fresh app with the same slug later.
          </HelpHint>
        </div>
        <p className="text-sm text-muted-foreground">
          Soft-deletes the app. Container is stopped and removed; Docker volumes remain on the host
          so they can be reattached to a fresh app.
        </p>
        <Button variant="destructive" onClick={destroy} disabled={busy}>Delete app</Button>
      </Card>
    </div>
  );
}
```

Key changes:
- HelpHints on Default branch, Build root, Auto-deploy, Danger zone.
- Auto-deploy row: `items-start` so the Switch aligns with the top of the label block rather than vertically centering against the multi-line text.
- Save button row: `flex-wrap` so the savedAt text wraps below the button on phone.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/apps/settings-panel.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: settings — HelpHints on advanced fields + responsive form"
```

---

## Task 7: Shell retrofit (mobile fallback)

**File:** `apps/web/src/app/(dashboard)/apps/[slug]/shell/page.tsx`

The XTerm shell is unusable below `md` (the terminal sizing assumes ≥768px). Show an `ErrorState` on `<md` explaining the limitation. The XTerm component stays unchanged.

- [ ] **Step 1: Replace the shell page**

Replace `apps/web/src/app/(dashboard)/apps/[slug]/shell/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { XtermShell } from "@/components/shell/xterm-shell";
import { ErrorState } from "@/components/common/states";

type Params = Promise<{ slug: string }>;

export default async function ShellPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Shell</h2>
        <p className="text-sm text-muted-foreground">
          Opens an interactive /bin/sh inside the running container. Sessions are audit-logged (open + close), content is never persisted.
        </p>
      </div>
      <div className="md:hidden">
        <ErrorState title="Shell needs a wider screen">
          The terminal is desktop-only. Open this app on a screen at least 768px wide to use the shell.
        </ErrorState>
      </div>
      <div className="hidden md:block">
        <XtermShell appId={app.id} />
      </div>
    </div>
  );
}
```

Key changes:
- Mobile: ErrorState "Shell needs a wider screen".
- Desktop: XTerm as before. The XTerm component itself is not modified.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/shell/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: shell — ErrorState on <md, XTerm desktop-only"
```

---

## Task 8: Users + Invites retrofit

**Files:**
- Modify: `apps/web/src/components/users/users-list.tsx`
- Modify: `apps/web/src/components/users/invites-panel.tsx`

Wire users delete to `useOptimisticAction`. Replace the inline ad-hoc Copy button on the invite URL with `CopyButton`. Add `HelpHint` to the invite email field.

- [ ] **Step 1: Replace `users-list.tsx`**

Replace `apps/web/src/components/users/users-list.tsx` with:

```tsx
"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { Users as UsersIcon } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromThrowing } from "@/lib/action-result";
import { deleteUserAction, type User } from "@/actions/users";
import { formatDistanceToNow } from "date-fns";

export function UsersList({ users, meId }: { users: User[]; meId: string }) {
  const { items, remove, pending } = useOptimisticAction<User, string>({
    initial: users,
    keyFn: (u) => u.id,
    addAction: () => Promise.resolve({ ok: true as const }),
    removeAction: (id) => fromThrowing(() => deleteUserAction(id)),
    toastMessages: {
      addSuccess: "User added",
      addErrorPrefix: "Add failed",
      removeSuccess: "User deleted",
      removeErrorPrefix: "Delete failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={UsersIcon} title="No users yet">
        Create an invite above and share the URL with the next admin.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y">
      {items.map((u) => (
        <div key={u.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {u.email}
              {u.id === meId && <Badge variant="secondary" className="ml-2">you</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {u.totpEnabled ? "password + TOTP" : "passkey only"} · joined {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
            </div>
          </div>
          {u.id !== meId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Permanently delete ${u.email}? Their sessions and credentials cascade away.`)) return;
                remove(u.id);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
```

Key changes:
- `useOptimisticAction` for delete. `addAction` is a no-op placeholder (users are created via invite consume, not via this list).
- CardList row: stacks on phone.
- EmptyState (rare in practice but defensive).

- [ ] **Step 2: Replace `invites-panel.tsx`**

Replace `apps/web/src/components/users/invites-panel.tsx` with:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/common/copy-button";
import { HelpHint } from "@/components/common/help-hint";
import { createInviteAction, type Invite } from "@/actions/invites";
import { formatDistanceToNow } from "date-fns";

export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function create() {
    setError(null);
    setCreatedUrl(null);
    startTransition(async () => {
      const res = await createInviteAction(email || undefined);
      if (res.error) setError(res.error);
      else if (res.url) {
        setCreatedUrl(res.url);
        setEmail("");
        router.refresh();
      }
    });
  }

  const outstanding = invites.filter((i) => !i.consumedAt && new Date(i.expiresAt) > new Date());

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="invite-email" className="flex items-center gap-1">
            Invite email (optional)
            <HelpHint>
              Pre-fills the invitee&apos;s email on the enrollment form. The invite URL is the only thing that grants access — the email is for convenience.
            </HelpHint>
          </Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new-admin@example.com" />
        </div>
        <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create invite"}</Button>
      </div>
      {createdUrl && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/40">
          <div className="text-sm">Share this one-time URL with the invitee (24h):</div>
          <CopyButton value={createdUrl} label="invite URL" variant="block" />
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {outstanding.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {outstanding.length} outstanding invite{outstanding.length === 1 ? "" : "s"} — first expires {formatDistanceToNow(new Date(outstanding[0]!.expiresAt), { addSuffix: true })}
        </div>
      )}
    </Card>
  );
}
```

Key changes:
- HelpHint on Invite email.
- CopyButton (variant=block) replaces the inline `<code>` + custom Copy button. Toast confirms the copy.
- HTML-entity-escaped `'` in the hint text.

- [ ] **Step 3: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/users/users-list.tsx apps/web/src/components/users/invites-panel.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: users + invites — useOptimisticAction + CopyButton + HelpHint"
```

---

## Task 9: Audit retrofit

**File:** `apps/web/src/app/(dashboard)/audit/page.tsx`

Make the filter form and the event list responsive. Replace the inline empty state with EmptyState. Mobile: timestamp drops above the event details rather than into its own column.

- [ ] **Step 1: Replace the audit page**

Replace `apps/web/src/app/(dashboard)/audit/page.tsx` with:

```tsx
import { listAuditEvents } from "@/actions/audit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";

type Search = Promise<{ action?: string; actorUserId?: string; from?: string; to?: string; offset?: string }>;

export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const offset = sp.offset ? Number(sp.offset) : 0;
  const events = await listAuditEvents({
    action: sp.action,
    actorUserId: sp.actorUserId,
    from: sp.from,
    to: sp.to,
    offset,
    limit: 100,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" method="get">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="action">Action prefix</label>
          <input id="action" name="action" defaultValue={sp.action ?? ""} className="block w-full rounded-md border px-2 py-1 text-sm" placeholder="login." />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="actorUserId">Actor (UUID)</label>
          <input id="actorUserId" name="actorUserId" defaultValue={sp.actorUserId ?? ""} className="block w-full rounded-md border px-2 py-1 text-sm" />
        </div>
        <button className="rounded-md border px-3 py-1 text-sm">Filter</button>
      </form>
      {events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No events match">
          Adjust the filter above or clear it to see all events.
        </EmptyState>
      ) : (
        <Card className="divide-y">
          {events.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 sm:grid sm:grid-cols-[140px_1fr] sm:gap-3 p-3 text-sm">
              <div className="text-xs text-muted-foreground font-mono">{format(new Date(e.ts), "yyyy-MM-dd HH:mm:ss")}</div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{e.action}</Badge>
                  {e.targetType && <span className="text-xs text-muted-foreground">{e.targetType}:{e.targetId?.slice(0, 8)}</span>}
                  {e.actorIp && <span className="text-xs text-muted-foreground font-mono">{e.actorIp}</span>}
                </div>
                {Object.keys(e.metadata ?? {}).length > 0 && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(e.metadata, null, 0)}</pre>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

Key changes:
- Filter form: `md:grid-cols-...` so it stacks single-column on phone.
- Event row: `flex flex-col gap-2 sm:grid sm:grid-cols-[140px_1fr]` so the timestamp appears above the event on phone, beside it on tablet+.
- Action badges wrap (`flex-wrap`) so a long action name + targetType + IP all fit.
- EmptyState replaces the inline `<div className="p-6 text-center ...">`.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/audit/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: audit — responsive event rows + EmptyState"
```

---

## Task 10: Account retrofit

**File:** `apps/web/src/components/users/account-panel.tsx`

Light touch: make rows stack on phone, replace the inline "No passkeys registered." text with an inline EmptyState-style block (keep within the Card section), add HelpHints on the TOTP secret and the QR code.

- [ ] **Step 1: Replace `account-panel.tsx`**

Replace `apps/web/src/components/users/account-panel.tsx` with:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/common/help-hint";
import { CopyButton } from "@/components/common/copy-button";
import { passwordSetupAction, type ActionState } from "@/actions/auth";
import { removeCredentialAction, type Credential } from "@/actions/users";
import type { Me } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

export function AccountPanel({ me, credentials }: { me: Me; credentials: Credential[] }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Identity</div>
        <div className="text-sm text-muted-foreground break-words">{me.email}</div>
      </Card>

      <PasskeysSection credentials={credentials} onChange={() => router.refresh()} />
      <PasswordTotpSection enabled={me.totpEnabled} />
    </div>
  );
}

function PasskeysSection({ credentials, onChange }: { credentials: Credential[]; onChange: () => void }) {
  const [nickname, setNickname] = useState("My device");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function addPasskey() {
    setError(null);
    try {
      const start = await fetch("/api/proxy/auth/webauthn/registration/start", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
      if (!start.ok) throw new Error("could not start passkey registration");
      const startBody = (await start.json()) as { options: Parameters<typeof startRegistration>[0]["optionsJSON"] };
      const attestation = await startRegistration({ optionsJSON: startBody.options });
      const finish = await fetch("/api/proxy/auth/webauthn/registration/finish", {
        method: "POST",
        body: JSON.stringify({ response: attestation, email: "self", nickname }),
        headers: { "content-type": "application/json" },
      });
      if (!finish.ok) throw new Error("passkey registration failed");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium flex items-center gap-1">
          Passkeys
          <HelpHint>
            Phishing-resistant credentials bound to this device. Recommended over password + TOTP.
          </HelpHint>
        </div>
        <Button variant="outline" size="sm" onClick={addPasskey}>Add passkey</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="nickname">Device name (for the next passkey)</Label>
          <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
      </div>
      {credentials.length === 0 ? (
        <div className="text-sm text-muted-foreground">No passkeys registered.</div>
      ) : (
        <div className="divide-y">
          {credentials.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.nickname}</div>
                <div className="text-xs text-muted-foreground">
                  added {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  {c.lastUsedAt && ` · last used ${formatDistanceToNow(new Date(c.lastUsedAt), { addSuffix: true })}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Remove ${c.nickname}? You'll lose this device's passkey.`)) return;
                  startTransition(async () => {
                    await removeCredentialAction(c.id);
                    onChange();
                  });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function genSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function PasswordTotpSection({ enabled }: { enabled: boolean }) {
  const [secret] = useState(() => genSecret());
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (enabled) return;
    QRCode.toDataURL(`otpauth://totp/projectMng?secret=${secret}&issuer=projectMng&algorithm=SHA1&digits=6&period=30`).then(setQr).catch(() => setQr(null));
  }, [enabled, secret]);

  if (enabled) {
    return (
      <Card className="p-4">
        <div className="text-sm font-medium">Password + TOTP</div>
        <div className="text-sm text-muted-foreground">Enabled. Use your authenticator app at login.</div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium flex items-center gap-1">
        Set up password + TOTP
        <HelpHint>
          Fallback for environments without passkey support. Pair with a TOTP app (1Password, Authy, Google Authenticator).
        </HelpHint>
      </div>
      <form
        action={(fd) => {
          fd.set("totpSecret", secret);
          startTransition(async () => {
            const res = await passwordSetupAction(state, fd);
            setState(res);
          });
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="pw">Password (min 8 chars)</Label>
          <Input id="pw" name="password" type="password" minLength={8} required />
        </div>
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm flex items-center gap-1">
            Scan with your authenticator
            <HelpHint>
              Or type the secret below into the app manually. Never reuse this secret on another account.
            </HelpHint>
          </div>
          {qr ? <img src={qr} alt="TOTP QR" className="size-44 mx-auto" /> : <div className="text-xs text-muted-foreground">Generating QR…</div>}
          <CopyButton value={secret} label="TOTP secret" variant="block" />
        </div>
        <div>
          <Label htmlFor="totpToken">6-digit code</Label>
          <Input id="totpToken" name="totpToken" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Enable"}</Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>
    </Card>
  );
}
```

Key changes:
- Email row gets `break-words` for long emails.
- Passkey rows stack on phone.
- Passkey section heading gets a HelpHint.
- TOTP section: HelpHint on the heading, HelpHint on "Scan with your authenticator", CopyButton replaces the inline `<div className="...font-mono break-all">{secret}</div>` so the secret can be copied with one tap.

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/users/account-panel.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: account — HelpHints + CopyButton for TOTP secret + responsive rows"
```

---

## Task 11: Login + Enroll responsive container

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/enroll/[token]/page.tsx`

Wrap the auth forms in `max-w-md mx-auto p-4 md:p-8`. The forms themselves (LoginForm, EnrollForm) are NOT modified.

- [ ] **Step 1: Replace `app/login/page.tsx`**

Replace `apps/web/src/app/login/page.tsx` with:

```tsx
import { LoginForm } from "@/components/auth/login-form";
import { maybeSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const me = await maybeSession();
  if (me) redirect("/apps");
  return (
    <main className="min-h-screen grid place-items-center p-4 md:p-8">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Replace `app/enroll/[token]/page.tsx`**

Replace `apps/web/src/app/enroll/[token]/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { EnrollForm } from "@/components/auth/enroll-form";

type Params = Promise<{ token: string }>;

export default async function EnrollPage({ params }: { params: Params }) {
  const { token } = await params;
  const res = await fetch(`${env.PM_API_URL}/api/enroll/${token}`, { cache: "no-store" });
  if (!res.ok) redirect("/login?reason=expired-invite");
  const body = (await res.json()) as { valid: boolean; email: string | null; expiresAt: string };
  return (
    <main className="min-h-screen grid place-items-center p-4 md:p-8">
      <div className="w-full max-w-md">
        <EnrollForm token={token} prefillEmail={body.email ?? ""} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test && npm run e2e
```

Expected: typecheck clean, 34/34, 2/2.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/app/login/page.tsx "apps/web/src/app/enroll/[token]/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: login + enroll — responsive page container (max-w-md p-4 md:p-8)"
```

---

## Task 12: New-app wizard polish + lint cleanup

**File:** `apps/web/src/components/apps/new-app-wizard.tsx`

Two things:
1. Add `HelpHint`s on Slug, Default branch, Build root, Auto-deploy.
2. Fix the pre-existing `react-hooks/set-state-in-effect` lint error at line 36–40 (`setReposLoading(true)` inside the useEffect that fires whenever `installationId` changes).

The setState-in-effect rule complains because `useEffect` is intended for synchronization with external systems, and triple-flag `loading → fetch → resolve` is better expressed as a transition. We refactor to call the repo fetch from the `onValueChange` of the installations Select directly (so loading is a *consequence of user input*, not a synchronization side-effect), and seed an initial repos fetch via the existing default-installation case.

- [ ] **Step 1: Replace the file**

Replace `apps/web/src/components/apps/new-app-wizard.tsx` with:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/common/help-hint";
import { listInstallationRepos, type Installation, type Repo } from "@/actions/github";
import { createAppAction } from "@/actions/apps";

type Props = { installations: Installation[] };

function deriveSlug(repoFullName: string): string {
  const name = repoFullName.split("/").pop() ?? "";
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export function NewAppWizard({ installations }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [installationId, setInstallationId] = useState<string>(installations[0]?.id.toString() ?? "");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [buildRoot, setBuildRoot] = useState(".");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();

  async function loadRepos(id: string) {
    if (!id) return;
    setReposLoading(true);
    setError(null);
    try {
      const r = await listInstallationRepos(id);
      setRepos(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReposLoading(false);
    }
  }

  // Initial load for the default installation. Runs once.
  useEffect(() => {
    if (installationId) void loadRepos(installationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickInstallation(id: string) {
    setInstallationId(id);
    setSelectedRepo("");
    setRepos([]);
    void loadRepos(id);
  }

  function pickRepo(fullName: string) {
    setSelectedRepo(fullName);
    setSlug(deriveSlug(fullName));
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) setDefaultBranch(repo.defaultBranch);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createAppAction({
        slug,
        githubInstallationId: installationId,
        githubRepoFullName: selectedRepo,
        defaultBranch,
        buildRoot,
        autoDeploy,
      });
      if (res.error) setError(res.error);
      else if (res.slug) router.push(`/apps/${res.slug}`);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New app</h1>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>1. Pick a repository</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-1">
                GitHub installation
                <HelpHint>
                  Which installed GitHub App org/user account to fetch repos from. Install the projectMng app on more accounts to see them here.
                </HelpHint>
              </Label>
              <Select value={installationId} onValueChange={(v) => pickInstallation(v ?? "")}>
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) =>
                      value
                        ? installations.find((i) => i.id.toString() === value)?.account ?? value
                        : "Choose installation"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id.toString()}>{i.account}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Repository</Label>
              {reposLoading ? (
                <div className="text-sm text-muted-foreground py-2">Loading repos…</div>
              ) : (
                <Select value={selectedRepo} onValueChange={(v) => pickRepo(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue>
                      {(value: string | null) =>
                        value
                          ? repos.find((r) => r.fullName === value)?.fullName ?? value
                          : "Choose repo"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((r) => (
                      <SelectItem key={r.id} value={r.fullName}>{r.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button onClick={() => setStep(2)} disabled={!selectedRepo}>Continue</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>2. Configure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="slug" className="flex items-center gap-1">
                Slug (used as subdomain + container name)
                <HelpHint>
                  Lowercase letters, digits, hyphens. Becomes <code className="font-mono">{"{slug}.<your-host>"}</code> and the Docker container name.
                </HelpHint>
              </Label>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="branch" className="flex items-center gap-1">
                Default branch
                <HelpHint>The branch that <strong>Deploy latest</strong> and auto-deploy build from.</HelpHint>
              </Label>
              <Input id="branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="buildRoot" className="flex items-center gap-1">
                Build root
                <HelpHint>Path inside the repo where the build runs. <code className="font-mono">.</code> = repo root.</HelpHint>
              </Label>
              <Input id="buildRoot" value={buildRoot} onChange={(e) => setBuildRoot(e.target.value)} />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label htmlFor="autoDeploy" className="flex items-center gap-1">
                  Auto-deploy on push
                  <HelpHint>Off by default. When on, every push to the default branch triggers a deploy.</HelpHint>
                </Label>
                <p className="text-xs text-muted-foreground">Off by default. Each push to the default branch will trigger a deploy when enabled.</p>
              </div>
              <Switch id="autoDeploy" checked={autoDeploy} onCheckedChange={setAutoDeploy} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={submit} disabled={submitting || !slug}>{submitting ? "Creating…" : "Create app"}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

Key changes:
- HelpHints on every technical Label.
- `pickInstallation` is an event handler (called from `onValueChange`), not a useEffect side-effect — fixes the `set-state-in-effect` lint error. The initial-load `useEffect` is preserved (it has no deps; it fires once on mount) and gets an `eslint-disable-next-line` for `exhaustive-deps` because installationId is intentionally initial-only.

Note: the `pickInstallation` handler resets `selectedRepo` and `repos` to empty before triggering the new load — this is correct behavior (changing installation invalidates the old repo selection).

- [ ] **Step 2: Verify**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run lint && npm run typecheck && npm test && npm run e2e
```

Expected:
- lint: 1 error / 2 warnings (the new-app-wizard setState-in-effect error is now gone; the only remaining error is in `enroll-form.tsx` line 39 if it's still present; verify against current baseline). Match against `git diff main -- apps/web/src/components/auth/enroll-form.tsx | head -1` — the baseline.
- typecheck: clean
- test: 34/34
- e2e: 2/2 (the smoke uses the wizard; verify it still navigates through both steps)

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/apps/new-app-wizard.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: new-app wizard — HelpHints + loadRepos handler (fix setState-in-effect lint)"
```

---

## Task 13: Extend mobile smoke to remaining routes

**File:** `apps/web/tests/e2e/mobile-smoke.spec.ts`

The existing mobile smoke covers `/apps`, `/apps/new`, `/apps/${slug}`. Plan 3 retrofitted ~10 additional routes. Extend the smoke to assert no horizontal scroll on each.

- [ ] **Step 1: Replace the mobile smoke**

Replace `apps/web/tests/e2e/mobile-smoke.spec.ts` with:

```ts
import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 375, height: 800 } });

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return { scroll: html.scrollWidth, client: html.clientWidth };
  });
  expect(overflow.scroll, `horizontal scroll on ${label} (${overflow.scroll} > ${overflow.client})`).toBeLessThanOrEqual(overflow.client);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password + TOTP" }).click();
  const passwordTab = page.getByRole("tabpanel", { name: "Password + TOTP" });
  await passwordTab.locator("#email").fill("smoke@a.com");
  await passwordTab.locator("#password").fill("hunter2");
  await passwordTab.locator("#totp").fill("123456");
  await passwordTab.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/apps$/);
}

test("mobile (375px): no horizontal scroll on public routes", async ({ page }) => {
  await page.goto("/login");
  await assertNoHorizontalScroll(page, "/login");
});

test("mobile (375px): no horizontal scroll on top-level routes", async ({ page }) => {
  await login(page);
  await assertNoHorizontalScroll(page, "/apps (empty)");

  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/users");

  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/audit");

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/account");
});

test("mobile (375px): no horizontal scroll across app sub-routes", async ({ page }) => {
  await login(page);

  // Create a fresh "mobile" app so the test is self-contained.
  await page.getByRole("link", { name: /create your first app|new app/i }).first().click();
  await expect(page).toHaveURL(/\/apps\/new$/);
  await assertNoHorizontalScroll(page, "/apps/new");

  const triggers = page.getByRole("combobox");
  await triggers.nth(0).click();
  await page.getByRole("option", { name: "smoke-org" }).click();
  await triggers.nth(1).click();
  await page.getByRole("option", { name: "smoke-org/hello" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#slug").fill("mobile");
  await page.getByRole("button", { name: "Create app" }).click();
  await expect(page).toHaveURL(/\/apps\/mobile$/);
  await assertNoHorizontalScroll(page, "/apps/mobile (overview)");

  // Visit each sub-route.
  for (const tab of ["deployments", "env", "domains", "volumes", "settings", "shell"]) {
    await page.goto(`/apps/mobile/${tab}`);
    await expect(page.getByRole("heading", { name: /Deployments|Environment variables|Domains|Volumes|Settings|Shell/ })).toBeVisible();
    await assertNoHorizontalScroll(page, `/apps/mobile/${tab}`);
  }
});
```

Key changes:
- Three discrete tests instead of one monolithic test, for cleaner failure reporting.
- `login` extracted as a helper.
- The third test creates the "mobile" app once and then iterates through all the sub-routes via direct navigation.

- [ ] **Step 2: Run the new tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx playwright test tests/e2e/mobile-smoke.spec.ts
```

Expected: 3 passed.

If any sub-route reports horizontal scroll, that's a real regression in one of Tasks 1-12. Identify which task, fix it, re-run.

- [ ] **Step 3: Run the full e2e suite**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: 4 passed (existing smoke + 3 mobile smoke tests).

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/tests/e2e/mobile-smoke.spec.ts
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: mobile smoke — extend to all retrofitted routes"
```

---

## Task 14: Plan-wide verification

**Files:** none.

Run the full local CI suite and a manual visual check across the retrofitted surfaces.

- [ ] **Step 1: Full CI suite**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected:
- lint: matches the post-Plan-3 baseline. After Tasks 2 and 12, the count drops from 4 errors / 2 warnings to ~0 errors / 2 warnings (the 4 errors were: 3 unescaped quotes in domain-attach-form, 1 setState-in-effect in new-app-wizard — both fixed in this plan). The 2 warnings (img elements in enroll-form and account-panel) remain — they're pre-existing and out of scope.
- typecheck: clean
- vitest: 35+ tests (34 from Plan 1+2, plus 6 new from the action-result helper)
- build: clean
- playwright: 4 passed (existing smoke + 3 mobile smoke tests)

- [ ] **Step 2: Manual visual check**

Start `PM_API_URL=http://localhost:3001 NEXT_PUBLIC_WEBAUTHN_RP_ID=localhost npm run dev` and `MOCK_API_PORT=3001 node tests/e2e/mock-api.mjs` in two terminals. Login as `smoke@a.com / hunter2 / 123456`. Then walk through every retrofitted page at both desktop and 375px:

- `/apps/new` — wizard with HelpHints next to each label; installation Select shows account name
- `/apps/mobile/env` — env vars table; add a var, delete a var (both should be optimistic with toast)
- `/apps/mobile/domains` — same UX for domains
- `/apps/mobile/deployments` — StatusDot + responsive rows
- `/apps/mobile/deployments/<id>` — CopyButton on commit SHA; logs box scrolls correctly
- `/apps/mobile/volumes` — HelpHint on Mount path; optimistic add/remove
- `/apps/mobile/settings` — HelpHints on every field; danger zone has HelpHint
- `/apps/mobile/shell` — at 375px shows ErrorState; at ≥md shows XTerm
- `/users` — invites panel CopyButton works; users list responsive
- `/audit` — filter form stacks on phone; events stack on phone
- `/account` — Passkeys section HelpHint; TOTP secret CopyButton
- `/login` and `/enroll/<token>` — centered in `max-w-md` with `p-4 md:p-8`

If anything looks broken at either width, fix and re-commit.

---

## Definition of done

- [ ] All 14 tasks above marked complete.
- [ ] `git log --oneline c24a8a8..HEAD` shows a contiguous run of small, focused commits.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` all pass.
- [ ] Lint baseline drops to ~0 errors / 2 warnings (4 → 0 errors).
- [ ] All retrofitted routes verified at 375px via the extended mobile smoke.
- [ ] Manual visual check at desktop and 375px confirms HelpHints, CopyButtons, optimistic UI, EmptyState, ErrorState all work.
