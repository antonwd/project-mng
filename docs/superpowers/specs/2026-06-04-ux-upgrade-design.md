# projectMng — UX Upgrade Pass Design Spec

**Date:** 2026-06-04
**Status:** Draft, pending implementation plans
**Target release:** v0.2.0
**Author:** Anton (with Claude)
**Scope marker:** `apps/web` only — no backend, no DB, no API, no worker changes

## 1. Purpose

projectMng v0.1.2 is live in production at https://anton.run. The dashboard is functional but desktop-only, lacks inline help, and shows few feedback signals when the user takes an action. This spec defines a UX upgrade pass that:

- Makes every dashboard flow usable on a 375px phone
- Adds inline help (tooltips) on technical fields and actions, discoverable on both desktop and touch
- Adds copy-to-clipboard widgets, optimistic UI, status pulses, an activity banner, and consistent empty/loading/error states across all data-fetching pages

The aesthetic — neutral shadcn palette, Geist typography, light/dark autodetect — is preserved. No visual redesign.

## 2. Goals & Non-Goals

### Goals

- Full mobile parity: every action achievable on desktop must be achievable at 375px.
- Discoverable help: a visible "?" icon next to every technical field, switch, and action with help content. Hover (desktop) and tap (mobile) both open the same content via Radix Tooltip.
- Consistent feedback: every server action either succeeds with a toast or fails with a toast; lists support optimistic add/remove.
- Visible state: in-flight deploys pulse in the apps list; recent activity surfaces at the top of `/apps` when present.
- Consistent state language: skeleton loaders during fetch, useful empty states, retry-able error states across all data-fetching pages.

### Non-Goals

- Deploy screenshots — separate phase; full-stack feature, scoped independently.
- Theme toggle, command palette (⌘K), log viewer rewrite, env var bulk paste, search/filter on long lists, deploy progress stepper, dashboard "/" landing route — all considered and explicitly out for this pass.
- Visual redesign — palette, type, radius, spacing scale all stay.
- Auth flow changes — login and enroll pages get responsive treatment only; passkey/TOTP logic untouched.

## 3. Key Decisions (locked in during brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Mobile nav = shadcn `Sheet` slide-in from left, hamburger trigger in header | Standard dashboard pattern; `Sheet` already installed; scales if nav grows. |
| 2 | Hint trigger = visible `HelpCircle` "?" icon at `size-3.5` `text-muted-foreground` | The only pattern that signals "help is here" on touch devices. Required by the full mobile parity goal. |
| 3 | Recent activity = banner band at top of `/apps`, hidden when empty | No new route, no new sidebar entry, no new endpoint — re-renders the existing audit data. |
| 4 | Activity feed content = deploys + admin events from the audit log, last 8 after filter | Audit log is already the source of truth; filtering is cheap. |
| 5 | Tests = Vitest on new shared components + one Playwright 375px no-horizontal-scroll smoke per route | Highest-ROI guard against mobile regression without a full multi-viewport e2e matrix. |
| 6 | Sequencing = primitives-first, then surface-by-surface | Atomic reviewable units; primitives tested in isolation; per-route migrations are mechanical. |
| 7 | Tailwind breakpoint regime = single `<md` / `≥md` split | Only two regimes needed; avoids overfitting tablet sizes. |
| 8 | Live status pulse = static, derived from `lastDeploy.status` on next server render — no new polling | Sufficient for the "I just kicked off a deploy" case; polling can be a later plan if needed. |

## 4. Architecture

### 4.1 Layout system

Two layout regimes:

```
<md (phone, 0–767px):
  Single-column content. Sticky top header with hamburger + projectMng wordmark + truncated email + sign-out icon button.
  Sidebar is not in the DOM until the Sheet opens. Main padding p-4.

≥md (tablet+desktop, 768px+):
  Current grid-cols-[240px_1fr] layout. Sidebar fixed visible (wordmark lives in the sidebar). Header shows email + "Sign out" button as today; the hamburger is hidden via md:hidden.
  Main padding p-8.
```

Tailwind breakpoints: `md` is the layout regime switch. `sm` is used for sub-component decisions (e.g., card metadata row stacking, sign-out icon-vs-label) and `lg` for occasional wider-than-desktop tweaks. The mobile-vs-desktop divide is `<md`/`≥md`; everything else is local polish.

### 4.2 Shared primitives (created in Plan 1)

| Primitive | Location | Purpose |
|---|---|---|
| `Hint` (new wrapper around `@base-ui/react/popover`) | `components/ui/hint.tsx` | base-ui Popover configured `openOnHover` with `delay={200}` — hovers like a tooltip on desktop, opens on tap on touch. base-ui's `Tooltip` primitive is hover-only by design and not used here. |
| `HelpHint` | `components/common/help-hint.tsx` | `<HelpCircle size-3.5 text-muted-foreground />` wrapped in `Hint`. Children are the content; renders inline next to labels and actions. |
| `CopyButton` | `components/common/copy-button.tsx` | Truncated value display + copy icon → `navigator.clipboard.writeText` → success toast. `variant="inline"` and `variant="block"`. |
| `MobileNav` | `components/nav/mobile-nav.tsx` | Hamburger button + `Sheet` wrapper. Shares `nav-items.ts` with `Sidebar`. Closes on route change. |
| `StatusDot` | `components/common/status-dot.tsx` | Colored dot, pulse animation when in-flight. Colors: green (running), amber (deploying/queued), red (failed), gray (stopped). |
| `EmptyState`, `LoadingSkeleton`, `ErrorState` | `components/common/states.tsx` | Replace the ad-hoc `Card.p-12.text-center` and inline skeleton blocks. Skeleton variants: `table`, `card-list`, `form`. ErrorState has a retry button driven by callback. |
| `useOptimisticAction` | `hooks/use-optimistic-action.ts` | Wraps `useOptimistic` + `useTransition` + toast feedback. Used for env vars and domains add/remove. |
| `toastResult` | `lib/toast.ts` | `(result: { ok: true } \| { ok: false, error: string }, messages: { success: string, errorPrefix: string })` → fires the right toast. Reduces boilerplate. |
| `.touch-target` utility | `globals.css` | `min-h-9 min-w-9` applied to icon-only buttons in headers and list-row trailing buttons. |

`nav-items.ts` is a new file extracted from `nav/sidebar.tsx` containing the shared nav config consumed by both `Sidebar` and `MobileNav`.

### 4.3 Per-surface retrofit

Plan 2 retrofits the high-traffic surfaces (dashboard layout, apps list, app detail header). Plan 3 retrofits everything else. Per-surface changes:

| Surface | Changes |
|---|---|
| `app/(dashboard)/layout.tsx` | Grid → `md:grid-cols-[240px_1fr]`, single column `<md`. `Sidebar` wrapped in `hidden md:block`. `MobileNav` rendered inside `Header` (which is `md:hidden` from MobileNav's perspective). |
| `components/nav/header.tsx` | Hamburger button (`md:hidden`); email truncated `<md`; sign out becomes icon-only `<sm`. |
| `components/nav/sidebar.tsx` | Consumes new `nav-items.ts`. Otherwise unchanged. |
| `app/(dashboard)/apps/page.tsx` | `RecentActivityBanner` above the apps grid (server-side render). `StatusDot` in each card. Card layout `flex-col gap-2 sm:flex-row sm:items-center` so the trailing metadata stacks on phone. |
| `components/apps/new-app-wizard.tsx` | `HelpHint` on Slug, Build root, Default branch, Auto-deploy. Step 1 and 2 Cards switch to full-width `<md`. |
| `app/(dashboard)/apps/[slug]/layout.tsx` | Tab strip → `overflow-x-auto snap-x scrollbar-thin` so all tabs reachable by swipe. `HelpHint` on action buttons in the header bar. |
| `app/(dashboard)/apps/[slug]/page.tsx` | Header card stacks vertically `<md`. `CopyButton` on webhook URL, public app URL, internal port, container name. |
| `app/(dashboard)/apps/[slug]/deployments/page.tsx` | Table → CardList on `<md`. `LoadingSkeleton variant="table"` + `EmptyState`. |
| `app/(dashboard)/apps/[slug]/deployments/[id]/page.tsx` | `DeploymentLogs` gets `min-h-[40vh]` and `overflow-x-auto`. `CopyButton` on deployment ID. |
| `app/(dashboard)/apps/[slug]/env/page.tsx` | `env-vars-table.tsx` consumes `useOptimisticAction`. CardList `<md`. `HelpHint` on the env var form's Key field explaining naming rules (uppercase, underscores) and on the Value field noting that secret values are encrypted at rest. |
| `app/(dashboard)/apps/[slug]/domains/page.tsx` | `domains-list.tsx` consumes `useOptimisticAction` for attach/detach. CardList `<md`. |
| `app/(dashboard)/apps/[slug]/volumes/page.tsx` | `LoadingSkeleton` + `EmptyState`. |
| `app/(dashboard)/apps/[slug]/settings/page.tsx` | `HelpHint` on advanced settings. |
| `app/(dashboard)/apps/[slug]/shell/page.tsx` | XTerm shell stays desktop-only. `<md` shows `ErrorState` titled "Shell needs a wider screen" with the message asking the user to open on desktop. |
| `app/(dashboard)/users/page.tsx`, `audit/page.tsx`, `account/page.tsx` | Tables → CardList on `<md`. `LoadingSkeleton` + `EmptyState`. `CopyButton` on invite links and any displayed IDs. |
| `app/login/page.tsx`, `app/enroll/[token]/page.tsx` | Wrap content in `max-w-md mx-auto p-4 md:p-8`. Authentication logic untouched. |

### 4.4 Recent activity banner

- New file: `components/dashboard/recent-activity.tsx`. Server component, fetched at render time in `apps/page.tsx`.
- Data source: existing `listAuditEntries({ limit: 20 })` server action from `src/actions/audit.ts`. The exact action names to filter against (e.g. `deployment.succeeded`) must be confirmed in Plan 4 by reading `actions/audit.ts` — the spec assumes the audit log already records the events listed below but does not bind the exact action-name strings.
- Filter set (assumed names; confirm in Plan 4): `deployment.succeeded`, `deployment.failed`, `deployment.started`, `app.created`, `domain.attached`, `user.invited`, `user.enrolled`.
- Takes the first 8 entries after the filter. If the filtered result is empty, the component returns `null` (banner hidden).
- Row format: `StatusDot · actor · action · target · relative time`. The target links to the corresponding app or user route.
- On `<md`, the band collapses to a single-line summary (`"12 events · last: …"`) with a "view all" link to `/audit`.

### 4.5 Live status pulse

- `actions/apps.ts:listApps` already returns `lastDeploy` on each app. Plan 4 confirms whether the returned `status` covers in-flight states (`queued`, `running`); if it does not, Plan 4 extends `listApps` to include the latest in-flight deploy (`select … from deployments where status in (queued, running) limit 1 per app`) and exposes it as `inflightDeploy` on the response.
- `StatusDot` consumes either the in-flight state or the terminal `lastDeploy.status` and animates the pulse via CSS (`animate-pulse` from `tw-animate-css`).
- No new polling. Server components re-render on navigation; the user who just kicked off a deploy lands back on `/apps` and sees the pulse.

### 4.6 Hint mechanics

- Hints are implemented as base-ui `Popover` with `openOnHover`, `delay={200}`. The Popover opens on hover (desktop) and on tap (touch) using a single primitive — no media query, no fork.
- No global provider needed (base-ui Popover is self-contained, unlike Radix Tooltip which needs a TooltipProvider).
- Hint content is plain text or rich children. The convention is one short sentence per `HelpHint`, plus optional `<code>` and `<a>` for technical references.

### 4.7 Empty / loading / error language

- All data-fetching server components render a `<Suspense fallback={<LoadingSkeleton variant=… />}>` boundary. (Where the existing page is a pure async server component without Suspense, Plan 3 wraps the data section in a Suspense child component and moves the data fetch into it.)
- All currently inline `text-center text-muted-foreground` "No X yet" blocks become `EmptyState` instances.
- Client components that surface errors (form submits, optimistic actions) toast on failure. Error boundaries from Next's `error.tsx` continue to handle server-side failures.

## 5. Testing strategy

### Unit tests (Vitest)

Created in Plan 1, one file per primitive:

- `help-hint.test.tsx` — renders the icon, opens the tooltip on click, asserts content present.
- `copy-button.test.tsx` — mocks `navigator.clipboard`, asserts correct value written, asserts toast fires.
- `mobile-nav.test.tsx` — closes on `usePathname` change, marks the active item.
- `status-dot.test.tsx` — renders the correct color class for each status; applies the pulse class for in-flight states.
- `states.test.tsx` — `EmptyState`, `LoadingSkeleton`, `ErrorState` each render the expected structure; `ErrorState`'s retry button invokes its callback.
- `use-optimistic-action.test.tsx` — adds optimistically, reverts on failure, fires success/error toasts.

### Mobile smoke (Playwright)

New file: `tests/mobile-smoke.spec.ts`. Sets `viewport = { width: 375, height: 800 }`. Uses the existing playwright auth + seed harness. For each route below, asserts no horizontal overflow:

```ts
await expect(
  await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
).toBe(true);
```

Routes: `/apps`, `/apps/new`, `/users`, `/audit`, `/account`, `/apps/${seededSlug}`, `/apps/${seededSlug}/deployments`, `/apps/${seededSlug}/env`, `/apps/${seededSlug}/domains`, `/apps/${seededSlug}/settings`.

The smoke landing point is Plan 2 (after layout + apps list + app detail header are migrated). It grows route-by-route as Plan 3 retrofits more pages.

### Manual acceptance

- At 375px, no route horizontal-scrolls (matches the smoke).
- Every tooltip surface opens on tap and closes on tap-outside.
- Every clipboard target copies under TLS at https://anton.run.
- A real deploy renders the in-flight pulse in `/apps` and produces a recent activity row.

## 6. Implementation plan boundaries

Plans live under `docs/superpowers/plans/`. Naming follows the existing `YYYY-MM-DD-<topic>.md` convention.

### Plan 1 — Primitives
- Create `Hint` (base-ui Popover wrapper with `openOnHover`).
- Create `HelpHint`, `CopyButton`, `StatusDot`, `MobileNav`, `EmptyState`, `LoadingSkeleton`, `ErrorState`, `useOptimisticAction`, `toastResult`, `.touch-target` utility, `nav-items.ts`.
- Add Vitest test file per primitive (six files listed above).
- No consumer code changes. No production user-visible diff.

### Plan 2 — Layout, apps list, app detail header
- Retrofit `(dashboard)/layout.tsx`, `header.tsx`, `sidebar.tsx`, `apps/page.tsx`, `apps/[slug]/layout.tsx`, `apps/[slug]/page.tsx`.
- Add the Playwright mobile smoke targeting only `/apps` and `/apps/${slug}` at this stage.

### Plan 3 — Sub-routes and forms
- Retrofit `new-app-wizard.tsx`, deployments list/detail, env, domains, volumes, settings, shell (with desktop-only error state `<md`), users, audit, account, login, enroll.
- Extend the Playwright mobile smoke to cover every route listed in section 5.

### Plan 4 — Recent activity + live status pulse
- Confirm audit action-name strings; build `RecentActivityBanner`.
- Confirm or extend `listApps` to surface in-flight deploys; wire the `StatusDot` pulse end-to-end.
- Tag `v0.2.0`.

## 7. Risks and open items

- **Audit action naming.** The recent activity filter assumes specific action strings (`deployment.succeeded` etc.). Plan 4 must read `actions/audit.ts` and the audit table directly before binding the filter list.
- **`listApps` in-flight coverage.** If `lastDeploy` does not already cover in-flight states, Plan 4 must extend the server action — purely additive change, no schema migration needed since the deployments table already records the state.
- **Next.js v16 idiom drift.** Per `apps/web/AGENTS.md`, Next.js v16 has breaking changes from training data. Each plan must consult `node_modules/next/dist/docs/` before introducing new patterns (Suspense usage, server-action result shapes, error.tsx conventions).
- **Hint touch behavior.** Resolved during Plan 1 prep: this project's shadcn `base-nova` style is backed by `@base-ui/react`, not Radix. base-ui's `Tooltip` is hover-only by design, so `Hint` wraps `@base-ui/react/popover` with `openOnHover={true}` and `delay={200}` — a single primitive that hovers on desktop and taps on touch. Plan 1 still includes a manual touch-device test as acceptance.
- **shadcn `form` v4.8.x no-op.** Already documented in the project memory; no `form` component is needed in this pass.
- **Per-app shell desktop-only fallback.** XTerm at narrow widths is unusable; rendering an `ErrorState` is correct UX but means a real feature is desktop-only. This is an explicit accepted limitation, called out in the help text.

## 8. Out of scope (and why)

| Item | Why deferred |
|---|---|
| Deploy screenshots | Full-stack feature (worker, API, DB); deserves its own phase. |
| Theme toggle | System-following dark mode already works; toggle is a polish addition, not core. |
| Command palette (⌘K) | Power-user feature; only worth building when nav grows. |
| Search/filter on long lists | Only useful at 3+ apps or many audit entries; revisit when needed. |
| Log viewer rewrite | Real engineering project; current `pre` block is functional. |
| Env var bulk paste | Convenience feature; one-at-a-time works today. |
| Deploy progress stepper | Requires worker telemetry; the static lastDeploy status + pulse is enough for now. |
| Dashboard "/" landing route | Adds a route + sidebar entry; the recent activity banner at top of `/apps` covers the same need without structural change. |
