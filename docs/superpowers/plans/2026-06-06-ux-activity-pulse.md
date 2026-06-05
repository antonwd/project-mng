# UX Upgrade — Plan 4: Recent Activity Banner + Live Status Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `RecentActivityBanner` at the top of `/apps` that surfaces recent deploys + admin events from the audit log, and verify the in-flight `StatusDot` pulse already established by Plan 2 actually fires for `queued`/`running`/`deploying` states. Tag `v0.2.0` at the end.

**Architecture:** Pure additive frontend work. The `RecentActivityBanner` is a server component that calls the existing `listAuditEvents` action, filters to a curated set of "interesting" action strings, and renders 8 events (banner) on desktop or a one-line summary on mobile. The `StatusDot` pulse end-to-end check is just a verification (no code change expected — `listApps` already returns the in-flight status, `statusToDot` already maps queued/running/deploying to PULSE-true states). No new shared components, no API changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, existing Plan 1 primitives.

---

## Pre-flight

From `/Users/Anton/Desktop/Projects/projectMng/apps/web`:

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
```

Expected:
- lint: 0 errors / 2 warnings (Plan 3 final state)
- typecheck: clean
- test: 40/40
- e2e: 4/4

Confirm branch and last commit:

```bash
git branch --show-current   # → feat/v0.2.0-ux-upgrade
git log --oneline -1        # → a9363b7 web: drop duplicate subtext where HelpHint already covers the instruction
```

---

## Background — Confirmed audit action strings (read from `apps/api/src/http/routes/*`)

The actual action names recorded in the audit log are:
- App lifecycle: `app.create`, `app.update`, `app.delete`
- Deploy lifecycle: `deploy.enqueue`, `deploy.redeploy`, `deploy.rollback` (note: NOT `deployment.succeeded` — succeed/fail state lives on the `deployments` table, not the audit log)
- Domains: `domain.add`, `domain.remove`
- Env: `env.upsert`, `env.delete`
- Volumes: `volume.add`, `volume.remove`
- Users: `user.delete`, `credential.remove`
- Invites: `invite.create`
- Auth: `login.success`, `login.failure`, `login.rate_limited`, `logout`, `password.setup`

For the banner, we curate to high-signal events only: deploys, app/domain lifecycle, invites, and user/credential removals. We skip env (too noisy), volumes (low signal), auth (too routine), and update/upsert events that don't change visible state.

---

## Background — Status pulse end-to-end

- `actions/apps.ts:listApps` returns `lastDeploy.status` as a free-form string from the API.
- `lib/status.ts:statusToDot` maps the string to `DotStatus`. The mapping already returns `queued`, `running`, `deploying` for in-flight states.
- `components/common/status-dot.tsx` has a `PULSE` map that sets `animate-pulse` for `queued` and `deploying`. (Note: `running` does NOT pulse — it's a stable post-deploy state.)
- The apps list (`apps/page.tsx`) already calls `statusToDot(a.lastDeploy?.status)` and passes it to `StatusDot`. So a freshly-queued deploy will visibly pulse on the next render of `/apps`.

**Conclusion:** The pulse already works. Plan 4 includes a quick e2e check to confirm, but no code changes are required to wire it.

---

## File Structure

**Created:**
- `apps/web/src/components/dashboard/recent-activity.tsx` — `RecentActivityBanner` server component

**Modified:**
- `apps/web/src/app/(dashboard)/apps/page.tsx` — render `<RecentActivityBanner />` above the apps grid
- `apps/web/tests/e2e/mock-api.mjs` — seed a small audit history so the mobile smoke can assert the banner renders
- `apps/web/tests/e2e/mobile-smoke.spec.ts` — add an assertion that the banner is visible/hidden at the correct breakpoint

No backend changes. No new shared components beyond the banner itself.

---

## Task 1: `RecentActivityBanner` server component

**File:** Create `apps/web/src/components/dashboard/recent-activity.tsx`.

A server component that fetches the audit log, filters to interesting actions, takes the first 8, renders a banner (desktop) or a one-line summary (mobile). Returns `null` if no interesting events are present.

- [ ] **Step 1: Create the file**

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAuditEvents } from "@/actions/audit";
import { formatDistanceToNow } from "date-fns";

const INTERESTING_ACTIONS = new Set([
  "app.create",
  "app.delete",
  "deploy.enqueue",
  "deploy.redeploy",
  "deploy.rollback",
  "domain.add",
  "domain.remove",
  "invite.create",
  "user.delete",
  "credential.remove",
]);

function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  if (targetType === "app") return `/apps/${targetId}`;
  if (targetType === "user") return `/users`;
  if (targetType === "domain") return null; // domain detail isn't a route; link to /apps instead
  return null;
}

function actionLabel(action: string): string {
  // Render the action as a short human-readable phrase.
  const map: Record<string, string> = {
    "app.create": "created app",
    "app.delete": "deleted app",
    "deploy.enqueue": "queued deploy",
    "deploy.redeploy": "redeployed",
    "deploy.rollback": "rolled back",
    "domain.add": "attached domain",
    "domain.remove": "removed domain",
    "invite.create": "created invite",
    "user.delete": "deleted user",
    "credential.remove": "removed credential",
  };
  return map[action] ?? action;
}

export async function RecentActivityBanner() {
  const all = await listAuditEvents({ limit: 30 }).catch(() => []);
  const events = all.filter((e) => INTERESTING_ACTIONS.has(e.action)).slice(0, 8);
  if (events.length === 0) return null;

  return (
    <>
      {/* Mobile: collapsed single-line summary */}
      <Card className="md:hidden px-3 py-2 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground truncate">
          {events.length} recent event{events.length === 1 ? "" : "s"} · last {formatDistanceToNow(new Date(events[0].ts), { addSuffix: true })}
        </span>
        <Link href="/audit" className="text-xs underline shrink-0">View all</Link>
      </Card>

      {/* Desktop: full banner */}
      <Card className="hidden md:block">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <div className="text-sm font-medium">Recent activity</div>
          <Link href="/audit" className="text-xs underline text-muted-foreground">View all</Link>
        </div>
        <ul className="divide-y">
          {events.map((e) => {
            const href = targetHref(e.targetType, e.targetId);
            const row = (
              <div className="flex items-center gap-3 px-4 py-2 text-sm">
                <Badge variant="secondary" className="font-mono text-xs">{e.action}</Badge>
                <span className="truncate flex-1 min-w-0">
                  {actionLabel(e.action)}
                  {e.targetId && <span className="text-muted-foreground"> · {e.targetType}:{e.targetId.slice(0, 8)}</span>}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                </span>
              </div>
            );
            return (
              <li key={e.id}>
                {href ? <Link href={href} className="block hover:bg-muted/30">{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
```

Key design choices:
- Two renders: mobile (`md:hidden`) and desktop (`hidden md:block`). Mobile is one-line, desktop is a card with 8 rows. No JS resize handling needed.
- `listAuditEvents({ limit: 30 })` over-fetches by ~3.75× so the filter has room to find 8 interesting events.
- `INTERESTING_ACTIONS` is a `Set` for O(1) filter lookups.
- `targetHref` only links app and user targets to existing routes. Domain rows render as plain text (no detail route exists).
- `actionLabel` maps the action string to a short phrase. Falls back to the raw action string if unmapped (defensive).
- Returns `null` when zero interesting events — the banner is hidden entirely, matching the spec's "hide when empty" requirement.
- The banner doesn't use `StatusDot` per the spec's section 4.4 — the row format is `Badge · action · target · time`. Spec section 4.4 mentioned `StatusDot` but in context that only makes sense for deploy.* rows where success/failure state is known. Since audit events for deploys are `deploy.enqueue/redeploy/rollback` (no success/fail outcome in the audit log itself), a status dot would be misleading. The Badge with the action name is the honest representation.

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/dashboard/recent-activity.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: add RecentActivityBanner — server component for /apps top banner"
```

---

## Task 2: Wire the banner into `/apps`

**File:** `apps/web/src/app/(dashboard)/apps/page.tsx`

Render `<RecentActivityBanner />` above the apps grid. The banner self-hides when no interesting events exist, so the page layout is unchanged when the banner is absent.

- [ ] **Step 1: Replace `apps/page.tsx`**

Replace the contents with:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listApps } from "@/actions/apps";
import { formatDistanceToNow } from "date-fns";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/states";
import { statusToDot } from "@/lib/status";
import { Boxes } from "lucide-react";
import { RecentActivityBanner } from "@/components/dashboard/recent-activity";

export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Apps</h1>
        <Link href="/apps/new"><Button>New app</Button></Link>
      </div>
      <RecentActivityBanner />
      {apps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No apps yet"
          action={<Link href="/apps/new"><Button>Create your first app</Button></Link>}
        >
          Connect a GitHub repo to deploy your first app.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {apps.map((a) => {
            const dot = statusToDot(a.lastDeploy?.status);
            return (
              <Link href={`/apps/${a.slug}`} key={a.id}>
                <Card className="px-4 py-3 hover:bg-muted/30 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.slug}</div>
                    <div className="text-sm text-muted-foreground truncate">{a.githubRepoFullName}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {a.lastDeploy && (
                      <div className="flex items-center gap-2">
                        <StatusDot status={dot} label={a.lastDeploy.status} />
                        <span>{a.lastDeploy.status}</span>
                        {a.lastDeploy.finishedAt && (
                          <span className="text-xs">
                            · {formatDistanceToNow(new Date(a.lastDeploy.finishedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    )}
                    {typeof a.domainCount === "number" && a.domainCount > 0 && (
                      <span>{a.domainCount} domain{a.domainCount === 1 ? "" : "s"}</span>
                    )}
                    <span className="font-mono text-xs">:{a.internalPort}</span>
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

The only diff vs. the current file: one new import (`RecentActivityBanner`) and one new line inside the JSX (`<RecentActivityBanner />`) above the conditional.

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: apps list — render RecentActivityBanner above the grid"
```

---

## Task 3: Seed audit events in the mock-api

**File:** `apps/web/tests/e2e/mock-api.mjs`

The Playwright mock-api currently returns an empty `state.deployments` and has no audit events. To verify the banner renders, seed a small audit history with interesting actions.

- [ ] **Step 1: Read the current mock-api**

Read `apps/web/tests/e2e/mock-api.mjs` to understand the current state shape and where the `state` object is initialized.

- [ ] **Step 2: Add audit events to the seed state**

Find the `state = { ... }` initializer near the top of the file. Add an `auditEvents` array entry:

```js
const state = {
  users: [{ id: "user-1", email: "smoke@a.com", totpEnabled: true, createdAt: "2025-01-01T00:00:00.000Z" }],
  apps: [],
  deployments: [],
  installations: [{ id: 42, account: "smoke-org" }],
  repos: [{ id: 1, fullName: "smoke-org/hello", defaultBranch: "main" }],
  auditEvents: [
    { id: "ev-1", ts: new Date(Date.now() - 5 * 60_000).toISOString(),  actorUserId: "user-1", actorIp: "127.0.0.1", action: "app.create",      targetType: "app",    targetId: "app-1", metadata: {} },
    { id: "ev-2", ts: new Date(Date.now() - 4 * 60_000).toISOString(),  actorUserId: "user-1", actorIp: "127.0.0.1", action: "deploy.enqueue",  targetType: "deploy", targetId: "dep-1", metadata: {} },
    { id: "ev-3", ts: new Date(Date.now() - 3 * 60_000).toISOString(),  actorUserId: "user-1", actorIp: "127.0.0.1", action: "domain.add",      targetType: "domain", targetId: "dom-1", metadata: {} },
    { id: "ev-4", ts: new Date(Date.now() - 2 * 60_000).toISOString(),  actorUserId: "user-1", actorIp: "127.0.0.1", action: "invite.create",   targetType: "user",   targetId: "user-2", metadata: {} },
  ],
};
```

- [ ] **Step 3: Add the `/api/audit-log` handler**

Below the existing route handlers in the `createServer` callback (after `isAuthed` is verified — the request is authenticated), add a handler for `GET /api/audit-log`:

```js
if (method === "GET" && path === "/api/audit-log") {
  // Mock the filtering by `action` prefix and `limit`. From/to are unused for now.
  const action = url.searchParams.get("action") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const filtered = action
    ? state.auditEvents.filter((e) => e.action.startsWith(action))
    : state.auditEvents.slice();
  // Most recent first.
  filtered.sort((a, b) => b.ts.localeCompare(a.ts));
  return json(res, 200, { events: filtered.slice(0, limit) });
}
```

Place this handler in the same `if/else` chain as the other route handlers (after `isAuthed` check passes).

- [ ] **Step 4: Verify the mock-api handler responds**

Run only the mobile smoke to confirm the new handler doesn't break anything:

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx playwright test tests/e2e/mobile-smoke.spec.ts
```

Expected: 3 passed (no change in test outcomes yet).

- [ ] **Step 5: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/tests/e2e/mock-api.mjs
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: mock-api — seed audit events + GET /api/audit-log handler"
```

---

## Task 4: Extend mobile smoke to assert the banner

**File:** `apps/web/tests/e2e/mobile-smoke.spec.ts`

Add an assertion that the mobile-collapsed banner ("N recent events · last …") is visible on `/apps` at 375px, and that the desktop banner ("Recent activity") is NOT visible at that viewport.

- [ ] **Step 1: Update the test file**

Find the second test in `mobile-smoke.spec.ts`:

```ts
test("mobile (375px): no horizontal scroll on top-level routes", async ({ page }) => {
  await login(page);
  await assertNoHorizontalScroll(page, "/apps (empty)");
  // ...
```

After the `await assertNoHorizontalScroll(page, "/apps (empty)");` line, add:

```ts
// The recent-activity banner should render in mobile-collapsed form (single line "N recent events · ...")
// and the desktop "Recent activity" heading should NOT be visible at 375px.
await expect(page.getByText(/recent event/i).first()).toBeVisible();
await expect(page.getByText("Recent activity")).not.toBeVisible();
```

The rest of the test (visiting /users, /audit, /account) is unchanged.

- [ ] **Step 2: Run the mobile smoke**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx playwright test tests/e2e/mobile-smoke.spec.ts
```

Expected: 3 passed. If the banner doesn't appear (e.g. because the mock-api handler returns the wrong shape), debug — the API returns `{ events: [...] }`, and `listAuditEvents` reads `res.events`.

- [ ] **Step 3: Run the full e2e suite**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/tests/e2e/mobile-smoke.spec.ts
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: mobile smoke — assert collapsed banner visible at 375px"
```

---

## Task 5: Plan-wide verification + manual visual check

**Files:** none.

- [ ] **Step 1: Full CI suite**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected:
- lint: 0 errors / 2 warnings (Plan 3 baseline preserved)
- typecheck: clean
- vitest: 40/40
- build: clean
- playwright: 4/4

- [ ] **Step 2: Manual visual check**

Start in two terminals:

```bash
# Terminal 1 (mock-api):
cd /Users/Anton/Desktop/Projects/projectMng/apps/web
MOCK_API_PORT=3001 node tests/e2e/mock-api.mjs

# Terminal 2 (dev):
cd /Users/Anton/Desktop/Projects/projectMng/apps/web
PM_API_URL=http://localhost:3001 NEXT_PUBLIC_WEBAUTHN_RP_ID=localhost npm run dev
```

Login as `smoke@a.com / hunter2 / 123456`. Then on `/apps`:

- Desktop ≥md: a "Recent activity" Card sits above the (empty) apps grid, with 4 rows (the seeded events: app.create, deploy.enqueue, domain.add, invite.create). Each row shows the action badge + label + target + relative time. "View all" link at the top right routes to `/audit`.
- Mobile <md: a one-line `Card` summary reading "4 recent events · last 2 minutes ago" with a "View all" link.
- If the banner is empty (no interesting events): the banner disappears entirely. Verify by clearing `state.auditEvents` in mock-api temporarily.

- [ ] **Step 3 (optional): Live status pulse check**

In a real production environment, kick off a deploy and visit `/apps`. The corresponding card's `StatusDot` should pulse while `lastDeploy.status` is `queued` or `deploying`. In the mock-api this isn't easily reproducible without manipulating the in-memory state, so we accept the Plan 1/2 unit tests of `StatusDot` (which already cover `queued` and `deploying` triggering the pulse class) plus the existing apps-list integration as sufficient verification for this plan.

---

## Task 6: Tag v0.2.0 (optional — confirm with user before tagging)

After Plans 1-4 are fully merged into `main` (via PR), tag `v0.2.0`:

```bash
git checkout main
git pull
git tag -a v0.2.0 -m "v0.2.0 — UX upgrade pass: mobile parity, tooltips, optimistic UI, recent activity, status pulse"
git push origin v0.2.0
```

The `.github/workflows/release.yml` workflow triggers on `v*.*.*` tags and builds + publishes new images.

**Do not tag from `feat/v0.2.0-ux-upgrade` directly** — the project convention is to tag from `main` after PR merge.

---

## Definition of done

- [ ] All 5 tasks above marked complete (Task 6 deferred to user discretion).
- [ ] `git log --oneline a9363b7..HEAD` shows a contiguous run of small, focused commits.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` all pass.
- [ ] Manual visual check confirms the banner renders correctly at desktop and 375px.
- [ ] No new lint errors, no test regressions, no e2e regressions.
