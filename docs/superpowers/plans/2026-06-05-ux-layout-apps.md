# UX Upgrade — Plan 2: Layout, Apps List, App Detail Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the dashboard shell (layout + header) and the two highest-traffic surfaces (apps list, app detail overview) to consume the Plan 1 primitives — `MobileNav`, `HelpHint`, `CopyButton`, `StatusDot` — and to render correctly at 375px.

**Architecture:** Pure consumer code. No new components, no new server actions. The dashboard layout switches from a fixed 240px sidebar to a responsive grid that collapses to single-column `<md`. The Header gains a hamburger (MobileNav) and shrinks the sign-out + email on small screens. The apps list cards stack metadata vertically `<md`. The app detail overview cards stack and expose IDs (internal port, image tag, commit SHA) via `CopyButton`. A new Playwright mobile smoke verifies no horizontal scroll at 375px on `/apps`, `/apps/new`, and `/apps/${seededSlug}`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, `lucide-react`, Plan 1 primitives.

---

## Pre-flight

From `/Users/Anton/Desktop/Projects/projectMng/apps/web`:

```bash
npm run lint && npm run typecheck && npm test && npm run e2e
```

Expected:
- lint: 4 errors / 2 warnings (baseline pre-existing in unrelated files)
- typecheck: clean
- test: 34 passed across 9 files
- e2e: 1 passed (existing smoke)

Confirm branch:

```bash
git branch --show-current
```

Expected: `feat/v0.2.0-ux-upgrade`.

Confirm `9c72d97` and downstream Plan 1 commits are present:

```bash
git log --oneline a043061 -1
```

Expected: `a043061 web: align CopyButton + HelpHint focus ring to shadcn ring-3/ring-ring/50`.

---

## File Structure

**Modified:**
- `apps/web/src/components/nav/header.tsx` — hamburger + wordmark + email truncation + icon-only sign-out at narrow widths
- `apps/web/src/app/(dashboard)/layout.tsx` — responsive grid, sidebar hidden `<md`, main padding shrinks
- `apps/web/src/app/(dashboard)/apps/page.tsx` — StatusDot + responsive card layout
- `apps/web/src/app/(dashboard)/apps/[slug]/layout.tsx` — tab strip becomes `overflow-x-auto` on `<md`
- `apps/web/src/app/(dashboard)/apps/[slug]/page.tsx` — responsive grid, CopyButtons for internal port + image tag + commit SHA, StatusDot for deploy status

**Created:**
- `apps/web/tests/e2e/mobile-smoke.spec.ts` — Playwright test at viewport 375×800 asserting no horizontal scroll on `/apps`, `/apps/new`, and the seeded app's overview

No new shared components. No backend, server-action, or schema changes.

---

## Task 1: Header retrofit

**File:** `apps/web/src/components/nav/header.tsx`

The current `Header` is a 13-line server component that renders email + a "Sign out" button. We add the `MobileNav` hamburger at the left (visible `md:hidden`), a wordmark next to it on mobile (the desktop wordmark stays in the `Sidebar`), and shrink the sign-out + email on narrow widths.

- [ ] **Step 1: Replace the header file contents**

Replace the entire contents of `apps/web/src/components/nav/header.tsx` with:

```tsx
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";
import { MobileNav } from "@/components/nav/mobile-nav";
import { LogOut } from "lucide-react";

export function Header({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <MobileNav />
        <span className="font-semibold text-base md:hidden">projectMng</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-sm text-muted-foreground truncate max-w-[12ch] sm:max-w-none">{email}</div>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" className="sm:hidden">
            <LogOut />
          </Button>
          <Button variant="ghost" size="sm" type="submit" className="hidden sm:inline-flex">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
```

Key changes:
- `sticky top-0 z-30` keeps the header pinned during scroll on mobile.
- `bg-background` ensures the sticky header has a solid background.
- Padding shrinks to `px-4` on `<md`, returning to `px-6` at `≥md`.
- `MobileNav` is rendered always; it renders a hamburger button only `md:hidden` (it's the trigger that has `md:hidden`, not the Sheet content), so this is harmless on desktop — the trigger button is invisible.
- The mobile wordmark `<span>projectMng</span>` is only visible `md:hidden`. The sidebar's wordmark covers the desktop case.
- Email truncates to 12 characters via `max-w-[12ch] truncate` on `<sm`, full width at `≥sm`.
- Sign-out: icon-only `<sm`, text-with-button `≥sm`.

- [ ] **Step 2: Run typecheck and tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test
```

Expected: typecheck clean, all 34 tests still pass.

- [ ] **Step 3: Visually verify (manual quick check)**

Start dev: `npm run dev`. Load `http://localhost:3000` (or 3001 if 3000 in use) → login. Then:
- Desktop ≥md: header shows email + "Sign out" button. Hamburger is invisible.
- Resize window <md (e.g. 375px): hamburger appears at left, wordmark next to it. Sign-out becomes a small icon button. Email is truncated to ~12 chars.

If anything looks broken, stop and report.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/src/components/nav/header.tsx
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: Header — add MobileNav, mobile wordmark, responsive email + sign-out"
```

---

## Task 2: Dashboard layout retrofit

**File:** `apps/web/src/app/(dashboard)/layout.tsx`

The current layout uses `grid grid-cols-[240px_1fr]` always. We want the sidebar visible only `≥md`; on `<md` the layout becomes single-column with the Header at top and main below.

- [ ] **Step 1: Replace the layout file contents**

Replace the entire contents of `apps/web/src/app/(dashboard)/layout.tsx` with:

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "@/components/nav/sidebar";
import { Header } from "@/components/nav/header";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  return (
    <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex flex-col min-w-0">
        <Header email={me.email} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
```

Key changes:
- `min-h-screen` moved to the outer grid.
- Sidebar wrapped in a `hidden md:block` div, so it's not in the DOM on mobile (and doesn't take grid space).
- Grid template `md:grid-cols-[240px_1fr]` applies only `≥md`; on `<md` it's an implicit single-column grid.
- Inner column uses `min-w-0` so children with long content (like log viewers) don't blow out the flex item width.
- Main padding `p-4 md:p-8` shrinks on mobile.

- [ ] **Step 2: Run typecheck and tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test
```

Expected: typecheck clean, all 34 tests pass.

- [ ] **Step 3: Visually verify**

Dev server should already be running. Refresh `/apps`:
- Desktop ≥md: sidebar visible at left, main content at right.
- Resize <md: sidebar disappears. Header (with hamburger) is at the top. Tap hamburger → drawer opens with nav links.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/layout.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: dashboard layout — sidebar hidden <md, single-col, responsive padding"
```

---

## Task 3: Apps list retrofit

**File:** `apps/web/src/app/(dashboard)/apps/page.tsx`

The current apps list renders cards with `flex items-center justify-between` — the trailing metadata (status badge, timestamp, domain count, internal port) overflows or wraps awkwardly on phones. We replace the Badge with `StatusDot` + status text, and switch the card layout to stack metadata below the heading on `<md`.

- [ ] **Step 1: Replace the page file contents**

Replace the entire contents of `apps/web/src/app/(dashboard)/apps/page.tsx` with:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listApps } from "@/actions/apps";
import { formatDistanceToNow } from "date-fns";
import { StatusDot, type DotStatus } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/states";
import { Boxes } from "lucide-react";

function statusToDot(status: string | undefined): DotStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "running" || status === "deploying" || status === "queued") return status;
  return "stopped";
}

export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Apps</h1>
        <Link href="/apps/new"><Button>New app</Button></Link>
      </div>
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

Key changes:
- Empty state uses the Plan 1 `EmptyState` primitive with `Boxes` icon.
- Cards switch from `flex items-center justify-between` to `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` — single-column metadata on phone, side-by-side at `≥sm`.
- `min-w-0` + `truncate` on the title/repo lines prevents long slug or repo names from breaking the layout.
- Status badge replaced with `StatusDot` + a status text span, plus the existing relative-time text.
- Metadata row wraps with `flex-wrap gap-x-3 gap-y-1` instead of inline gap, so it wraps cleanly when too wide.
- Card padding tightened to `px-4 py-3` to match shadcn-card defaults.

- [ ] **Step 2: Run typecheck and tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test
```

Expected: typecheck clean, all 34 tests pass. (Tests don't cover this page; smoke test will exercise it.)

- [ ] **Step 3: Run the existing Playwright smoke to verify the apps list still works end-to-end**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: existing smoke passes. The smoke creates an app and lands on `/apps/hello` — it touches `/apps` along the way.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: apps list — StatusDot + responsive flex + EmptyState primitive"
```

---

## Task 4: App detail tab strip overflow

**File:** `apps/web/src/app/(dashboard)/apps/[slug]/layout.tsx`

The tab strip has 7 tabs (Overview, Deployments, Env, Domains, Volumes, Shell, Settings). At 375px width with `text-sm` they overflow horizontally and wrap, breaking the visual line. We make the strip horizontally scrollable with snap points.

- [ ] **Step 1: Replace the layout file contents**

Replace the entire contents of `apps/web/src/app/(dashboard)/apps/[slug]/layout.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getApp } from "@/actions/apps";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "deployments", label: "Deployments" },
  { slug: "env", label: "Env" },
  { slug: "domains", label: "Domains" },
  { slug: "volumes", label: "Volumes" },
  { slug: "shell", label: "Shell" },
  { slug: "settings", label: "Settings" },
];

type Params = Promise<{ slug: string }>;

export default async function AppLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold truncate">{app.slug}</h1>
        <div className="text-sm text-muted-foreground truncate">{app.githubRepoFullName}</div>
      </div>
      <nav className="border-b -mx-4 md:mx-0 overflow-x-auto">
        <div className="flex gap-1 px-4 md:px-0 snap-x snap-mandatory min-w-max">
          {TABS.map((t) => {
            const href = t.slug ? `/apps/${app.slug}/${t.slug}` : `/apps/${app.slug}`;
            return (
              <Link
                key={t.label}
                href={href}
                className="snap-start whitespace-nowrap px-3 py-2 text-sm border-b-2 border-transparent hover:border-foreground/40 data-[active]:border-foreground"
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div>{children}</div>
    </div>
  );
}
```

Key changes:
- Title block gets `min-w-0` + `truncate` so a long slug doesn't push other content off-screen.
- Nav becomes `overflow-x-auto`. The negative margin `-mx-4 md:mx-0` extends the scrollable strip to the edge of the screen on mobile (so the scrollbar isn't trapped inside the page padding), reset at `≥md`.
- Inner flex container is `min-w-max` so it can grow wider than the parent, enabling the overflow.
- `snap-x snap-mandatory` on the container + `snap-start` on each tab gives a tactile swipe experience.
- `whitespace-nowrap` keeps each tab label on one line.

- [ ] **Step 2: Run typecheck and tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test
```

Expected: typecheck clean, all 34 tests pass.

- [ ] **Step 3: Run the existing Playwright smoke**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: existing smoke still passes — it lands on the app detail page after create.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/layout.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: app detail tabs — horizontal scroll on <md, snap points"
```

---

## Task 5: App detail overview retrofit

**File:** `apps/web/src/app/(dashboard)/apps/[slug]/page.tsx`

Replace the current grid with a responsive stack on `<md`, add `StatusDot` next to the deployment status, and surface `CopyButton`s for the values consumers want to grab: the internal port, the image tag, and the last commit SHA. Replace the Domains card's Badge list with a wrapped flex of badges that handles long hostnames.

**Scope note:** The spec (section 4.3) aspirationally asks for CopyButtons on the webhook URL and public app URL as well. Neither is currently exposed on this page: the webhook URL belongs to the GitHub App (not per-app), and the public app URL depends on the first attached custom domain (no automatic default). These will be added if and when the underlying API surfaces them. Plan 2 ships CopyButtons for what's currently displayable.

- [ ] **Step 1: Replace the page file contents**

Replace the entire contents of `apps/web/src/app/(dashboard)/apps/[slug]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { listDomains } from "@/actions/domains";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeployButton } from "@/components/apps/deploy-button";
import { formatDistanceToNow } from "date-fns";
import { StatusDot, type DotStatus } from "@/components/common/status-dot";
import { CopyButton } from "@/components/common/copy-button";
import { HelpHint } from "@/components/common/help-hint";

type Params = Promise<{ slug: string }>;

function statusToDot(status: string | undefined): DotStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "running" || status === "deploying" || status === "queued") return status;
  return "stopped";
}

export default async function AppOverviewPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const [deployments, domains] = await Promise.all([
    listDeployments(app.id).catch(() => []),
    listDomains(app.id).catch(() => []),
  ]);
  const lastSucceeded = deployments.find((d) => d.status === "succeeded");
  const lastDeploy = deployments[0];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="px-4 py-4 gap-3">
        <div className="text-sm font-medium">Latest deployment</div>
        {lastDeploy ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusDot status={statusToDot(lastDeploy.status)} label={lastDeploy.status} />
              <span>{lastDeploy.status}</span>
              <CopyButton value={lastDeploy.commitSha} label="commit SHA" />
            </div>
            {lastDeploy.commitAuthor && <div className="text-muted-foreground">by {lastDeploy.commitAuthor}</div>}
            {lastDeploy.finishedAt && (
              <div className="text-muted-foreground">{formatDistanceToNow(new Date(lastDeploy.finishedAt), { addSuffix: true })}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No deployments yet.</div>
        )}
        <DeployButton appId={app.id} />
      </Card>

      <Card className="px-4 py-4 gap-3">
        <div className="text-sm font-medium">Container</div>
        <div className="space-y-2 text-sm">
          {lastSucceeded?.imageTag ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Image tag</div>
              <CopyButton value={lastSucceeded.imageTag} label="image tag" variant="block" />
            </div>
          ) : (
            <div className="text-muted-foreground">No running container yet.</div>
          )}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              Bound port
              <HelpHint>
                The internal port the container listens on. nginx routes the public domain to this port on the host.
              </HelpHint>
            </div>
            <CopyButton value={String(app.internalPort)} label="port" />
          </div>
          <div className="text-muted-foreground">Resources: {app.memLimitMb}MB / {app.cpuLimit} CPU</div>
        </div>
      </Card>

      <Card className="px-4 py-4 gap-3 md:col-span-2">
        <div className="text-sm font-medium">Domains</div>
        {domains.length === 0 ? (
          <div className="text-sm text-muted-foreground">No domains attached.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <Badge
                key={d.id}
                variant={d.certStatus === "active" ? "default" : d.certStatus === "failed" ? "destructive" : "secondary"}
                className="max-w-full truncate"
              >
                {d.hostname} · {d.certStatus}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
```

Key changes:
- Card padding tightened to `px-4 py-4 gap-3` (matches shadcn-card-sm without the size prop).
- Latest deployment card uses `StatusDot` + status text + `CopyButton` for the commit SHA (replacing the inline `<span>` 8-char hash).
- Container card uses `CopyButton variant="block"` for the image tag (long, monospace, primary copy target). Bound port uses inline `CopyButton`. A `HelpHint` explains what "Bound port" means.
- The inner `flex items-center gap-2 flex-wrap` on the status row prevents the CopyButton from wrapping awkwardly when the status text + commit SHA exceed card width.
- Domain badges get `max-w-full truncate` so a long hostname doesn't blow out the badge.

- [ ] **Step 2: Run typecheck and tests**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run typecheck && npm test
```

Expected: typecheck clean, all 34 tests pass.

- [ ] **Step 3: Run the existing Playwright smoke**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: existing smoke still passes — it asserts the "hello" heading and the "Deploy latest" button on the overview page, both of which we preserved. The smoke also asserts the post-deploy "building" status text appears, which is still present via `<span>{lastDeploy.status}</span>`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add "apps/web/src/app/(dashboard)/apps/[slug]/page.tsx"
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: app overview — responsive cards + CopyButtons + StatusDot + HelpHint"
```

---

## Task 6: Playwright mobile smoke

**File:** Create `apps/web/tests/e2e/mobile-smoke.spec.ts`

A new Playwright test at viewport 375×800 that logs in, asserts no horizontal scroll on `/apps`, navigates to `/apps/new` and asserts no horizontal scroll, then creates an app and asserts no horizontal scroll on `/apps/${slug}`.

The mock-api is reset on each `next dev` restart but persists across tests in one Playwright run. To keep the new smoke independent of the existing one, we use a distinct slug ("mobile") so we don't collide with "hello".

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/e2e/mobile-smoke.spec.ts`:

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

test("mobile (375px): /apps, /apps/new, /apps/${slug} have no horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Password + TOTP" }).click();
  const passwordTab = page.getByRole("tabpanel", { name: "Password + TOTP" });
  await passwordTab.locator("#email").fill("smoke@a.com");
  await passwordTab.locator("#password").fill("hunter2");
  await passwordTab.locator("#totp").fill("123456");
  await passwordTab.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "Apps" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/apps");

  // Navigate to /apps/new via the empty-state CTA or the header New app button.
  await page.getByRole("link", { name: /create your first app|new app/i }).first().click();
  await expect(page).toHaveURL(/\/apps\/new$/);
  await assertNoHorizontalScroll(page, "/apps/new");

  // Create a fresh "mobile" app so the test is independent.
  const triggers = page.getByRole("combobox");
  await triggers.nth(0).click();
  await page.getByRole("option", { name: "smoke-org" }).click();
  await triggers.nth(1).click();
  await page.getByRole("option", { name: "smoke-org/hello" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Override the auto-derived "hello" slug to "mobile" so a second run doesn't collide.
  await page.locator("#slug").fill("mobile");
  await page.getByRole("button", { name: "Create app" }).click();

  await expect(page).toHaveURL(/\/apps\/mobile$/);
  await expect(page.getByRole("heading", { name: "mobile" })).toBeVisible();
  await assertNoHorizontalScroll(page, "/apps/${slug}");
});
```

- [ ] **Step 2: Run the new test to verify it passes**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npx playwright test tests/e2e/mobile-smoke.spec.ts
```

Expected: 1 passed.

If `assertNoHorizontalScroll` fires on any of the three routes, the test will fail with a clear "horizontal scroll on /apps (X > Y)" message. Fix the responsive layout for that surface and re-run. The most likely culprit is unmodified inline metadata that doesn't wrap.

- [ ] **Step 3: Run the FULL Playwright suite to verify both smokes pass**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run e2e
```

Expected: 2 passed (existing smoke + new mobile smoke).

Note: both tests share the in-memory mock-api state. The existing smoke creates "hello"; the mobile smoke creates "mobile". They coexist within one Playwright run.

- [ ] **Step 4: Commit**

```bash
git -C /Users/Anton/Desktop/Projects/projectMng add apps/web/tests/e2e/mobile-smoke.spec.ts
git -C /Users/Anton/Desktop/Projects/projectMng commit -m "web: Playwright mobile smoke at 375px for /apps + /apps/new + /apps/\${slug}"
```

---

## Task 7: Plan-wide verification

**Files:** none.

Run the full local CI suite to ensure no regressions, and do a manual visual check across the retrofitted surfaces at both desktop and mobile widths.

- [ ] **Step 1: Run lint, typecheck, vitest, build, playwright in sequence**

```bash
cd /Users/Anton/Desktop/Projects/projectMng/apps/web && npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Expected:
- lint: matches the 4-error baseline (no new errors from Plan 2)
- typecheck: clean
- vitest: 34 passed across 9 files (unchanged from Plan 1)
- build: clean
- playwright: 2 passed

- [ ] **Step 2: Manual visual check (desktop)**

Start `npm run dev`. Open `http://localhost:3000` (or 3001 if 3000 in use) → login → `/apps`. Verify at a desktop viewport (≥1024px):

- Sidebar visible on the left.
- Header shows email + "Sign out" button on the right.
- Apps list cards lay out left (slug + repo) and right (status + timestamp + port) in a single row.
- Click any app → app detail page. Tab strip shows all 7 tabs in a single line. No horizontal scrollbar visible.
- Overview cards in a 2-column grid. CopyButtons render for image tag, port, commit SHA. Click the port CopyButton → toast appears, value in clipboard.

- [ ] **Step 3: Manual visual check (mobile)**

Resize the browser to 375px (or use DevTools mobile emulation, or open `http://192.168.0.110:3000` on a phone).

- Header: hamburger button at left, projectMng wordmark next to it, email truncated to ~12 chars, sign-out as an icon-only button.
- Tap hamburger → drawer slides in from left with all 4 nav links. Tap a link → drawer closes immediately, navigation happens.
- `/apps`: cards stack metadata vertically below the slug/repo. StatusDot is visible.
- Tap an app → app detail. Tab strip is horizontally scrollable; swipe sideways to see all tabs.
- Overview: cards stack single-column. CopyButtons remain tappable. Tap a HelpHint "?" icon → popover opens. Tap outside → closes.

If anything looks broken at either width, fix and re-commit. If all clear, this plan is done.

- [ ] **Step 4: Final commit (if any cleanup happened)**

If steps 1-3 surfaced no issues and no further edits were made, skip. Otherwise:

```bash
git -C /Users/Anton/Desktop/Projects/projectMng status --short
# stage any cleanup edits explicitly and commit
```

---

## Definition of done

- [ ] All 7 tasks above marked complete.
- [ ] `git log --oneline a043061..HEAD` shows a contiguous run of small, focused commits — one per task (or per sub-task).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e` all pass.
- [ ] Existing Playwright smoke still passes; new mobile smoke passes.
- [ ] Manual visual check at desktop and 375px confirms no horizontal scroll, hamburger drawer works, CopyButtons copy, HelpHints open on tap.
- [ ] No new lint errors introduced beyond the 4-error baseline.
