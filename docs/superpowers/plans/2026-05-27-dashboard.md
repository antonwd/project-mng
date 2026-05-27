# Dashboard (pm-web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pm-web`, a Next.js 15 App Router dashboard that drives the Plan 2 REST + WebSocket API. Auth (passkeys + password/TOTP), app CRUD, env vars, domains, deployments with live log streaming, browser shell, audit log viewer, user management. Server components + server actions; no client state library.

**Architecture:** Next.js App Router runs as a container alongside `pm-api`. The browser never talks to `pm-api` directly except for WebSockets — all reads/mutations go through Next.js server components / server actions which forward to `pm-api` over the internal Docker network (`PM_API_URL=http://pm-api:3000`). Cookies (session + CSRF) live on the `pm.<domain>` origin so both Next.js and pm-api see them. Tailwind + shadcn/ui + Lucide icons. `@simplewebauthn/browser` for the WebAuthn ceremony. xterm.js for the browser shell.

**Tech Stack:** Next.js 15 (App Router, RSC, server actions), React 19, TypeScript, Tailwind v4, shadcn/ui, `@simplewebauthn/browser`, `xterm`, `zod`, `vitest` + `@testing-library/react` for component tests, Playwright for one cross-cutting smoke at the end.

**Repo layout (added on top of Plans 1 + 2):**

```
apps/
└── web/
    ├── .gitignore
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── vitest.config.ts
    ├── components.json                  (shadcn config)
    ├── playwright.config.ts
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx               (RootLayout: fonts, theme, ToastProvider)
    │   │   ├── globals.css              (tailwind + shadcn tokens)
    │   │   ├── page.tsx                 (redirects to /apps or /login)
    │   │   ├── login/
    │   │   │   └── page.tsx
    │   │   ├── enroll/
    │   │   │   └── [token]/page.tsx
    │   │   ├── (dashboard)/
    │   │   │   ├── layout.tsx           (sidebar, requires session)
    │   │   │   ├── apps/
    │   │   │   │   ├── page.tsx         (list)
    │   │   │   │   ├── new/page.tsx     (wizard)
    │   │   │   │   └── [slug]/
    │   │   │   │       ├── layout.tsx
    │   │   │   │       ├── page.tsx     (overview + deploy button)
    │   │   │   │       ├── deployments/
    │   │   │   │       │   ├── page.tsx
    │   │   │   │       │   └── [id]/page.tsx  (live logs)
    │   │   │   │       ├── env/page.tsx
    │   │   │   │       ├── domains/page.tsx
    │   │   │   │       ├── volumes/page.tsx
    │   │   │   │       ├── settings/page.tsx
    │   │   │   │       └── shell/page.tsx
    │   │   │   ├── users/page.tsx
    │   │   │   ├── audit/page.tsx
    │   │   │   └── account/page.tsx     (passkeys + password+TOTP setup)
    │   ├── lib/
    │   │   ├── api.ts                   (typed fetch wrapper for pm-api)
    │   │   ├── auth.ts                  (cookie helpers, require-auth guards)
    │   │   ├── env.ts                   (server-side env loader)
    │   │   ├── format.ts                (date/relative-time)
    │   │   └── webauthn-browser.ts      (thin wrapper)
    │   ├── components/
    │   │   ├── ui/                      (shadcn-generated: Button, Card, etc.)
    │   │   ├── nav/
    │   │   │   ├── sidebar.tsx
    │   │   │   └── header.tsx
    │   │   ├── apps/
    │   │   │   ├── app-list.tsx
    │   │   │   ├── new-app-wizard.tsx
    │   │   │   ├── deploy-button.tsx
    │   │   │   ├── env-var-form.tsx
    │   │   │   ├── domain-attach-form.tsx
    │   │   │   ├── deployment-row.tsx
    │   │   │   └── deployment-logs.tsx  (client; WebSocket)
    │   │   ├── auth/
    │   │   │   ├── login-form.tsx
    │   │   │   └── enroll-form.tsx
    │   │   ├── shell/
    │   │   │   └── xterm-shell.tsx      (client)
    │   │   └── audit/
    │   │       └── audit-row.tsx
    │   └── actions/                     (server actions)
    │       ├── auth.ts
    │       ├── apps.ts
    │       ├── env-vars.ts
    │       ├── domains.ts
    │       ├── volumes.ts
    │       ├── deployments.ts
    │       ├── invites.ts
    │       └── users.ts
    └── tests/
        └── e2e/
            └── smoke.spec.ts
```

**Conventions:**
- Server components by default. Mark client components with `"use client"` only when needed (forms with WebAuthn ceremonies, live log tail, terminal, anything with `useState`/`useEffect`).
- All mutations go through `actions/*.ts` server actions. No client-side fetches except WebSocket connections.
- Forms use zod schemas re-exported from `apps/web/src/actions/*` for parse-on-submit.
- Every action that mutates calls `revalidatePath` after success.
- shadcn components installed on demand via `npx shadcn@latest add <component>`. The `components.json` is committed.
- Tailwind v4 with the `@theme` directive; design tokens defined in `globals.css`.
- Commits use Conventional Commits with the `web:` scope and the project's co-author trailer.

---

## Task 1: Project bootstrap (Next.js + Tailwind + shadcn)

**Files:** new subtree at `apps/web/`.

- [ ] **Step 1: Scaffold**

```bash
cd apps
npx create-next-app@latest web --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint --turbopack
cd web
npx shadcn@latest init -d   # accept defaults; theme "neutral", base color "neutral"
npx shadcn@latest add button card input label dialog dropdown-menu form table tabs toast badge avatar sheet separator skeleton textarea select switch
```

- [ ] **Step 2: Add the additional deps**

```bash
npm install @simplewebauthn/browser xterm xterm-addon-fit zod lucide-react clsx tailwind-merge date-fns
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react vitest jsdom @playwright/test
```

- [ ] **Step 3: Configure Vitest**

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: { alias: { "@": "/src" } },
});
```

`apps/web/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest", "e2e": "playwright test"`.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "web: bootstrap Next.js 15 (App Router) + Tailwind v4 + shadcn/ui

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Env loader + typed API client

**Files:** Create `apps/web/src/lib/env.ts`, `apps/web/src/lib/api.ts`, `api.test.ts`.

- [ ] **Step 1: `src/lib/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  PM_API_URL: z.string().url(),
  NEXT_PUBLIC_WEBAUTHN_RP_ID: z.string().min(1),
});

export const env = (() => {
  const parsed = schema.safeParse({
    PM_API_URL: process.env.PM_API_URL,
    NEXT_PUBLIC_WEBAUTHN_RP_ID: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID,
  });
  if (!parsed.success) throw new Error("invalid web env: " + parsed.error.message);
  return parsed.data;
})();
```

- [ ] **Step 2: Test for API wrapper**

`apps/web/src/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "./api.js";

describe("apiFetch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prefixes PM_API_URL and forwards cookie header", async () => {
    process.env.PM_API_URL = "http://pm-api:3000";
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID = "pm.example.com";
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } })));
    const r = await apiFetch("/api/apps", { cookie: "pm_session=abc" });
    expect(r).toEqual({ ok: true });
    expect((globalThis.fetch as any)).toHaveBeenCalledWith("http://pm-api:3000/api/apps", expect.objectContaining({ headers: expect.objectContaining({ cookie: "pm_session=abc" }) }));
  });

  it("throws on non-2xx with error code", async () => {
    process.env.PM_API_URL = "http://pm-api:3000";
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID = "pm.example.com";
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":"forbidden","message":"nope"}}', { status: 403, headers: { "content-type": "application/json" } })));
    await expect(apiFetch("/api/apps")).rejects.toThrow(/forbidden/);
  });
});
```

- [ ] **Step 3: Implement `src/lib/api.ts`**

```ts
import { env } from "./env.js";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(`${code}: ${message}`); this.name = "ApiError"; }
}

export type ApiOptions = RequestInit & { cookie?: string };

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("accept", "application/json");
  if (opts.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const res = await fetch(`${env.PM_API_URL}${path}`, { ...opts, headers, cache: "no-store" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = data?.error ?? { code: "unknown", message: text };
    throw new ApiError(res.status, err.code, err.message);
  }
  return data as T;
}
```

- [ ] **Step 4: Auth helper for server components**

`apps/web/src/lib/auth.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "./api.js";

export async function serverCookieHeader(): Promise<string> {
  const c = await cookies();
  return c.getAll().map((x) => `${x.name}=${x.value}`).join("; ");
}

export async function requireSession() {
  const cookie = await serverCookieHeader();
  try {
    return await apiFetch<{ id: string; email: string }>("/api/me", { cookie });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    throw e;
  }
}
```

(The `/api/me` route is implemented as a small added route in Plan 2 Task 20 / users routes.)

- [ ] **Step 5: Test + commit**

```bash
npm test -- lib/api.test
git add apps/web/src/lib
git commit -m "web: add typed apiFetch wrapper + server-side auth helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Root layout, theme, sidebar shell

**Files:** Modify `apps/web/src/app/layout.tsx`, create `(dashboard)/layout.tsx`, `components/nav/sidebar.tsx`, `components/nav/header.tsx`.

**Visual baseline (set design tokens once, use everywhere):**
- Font: Geist Sans (default Next.js); mono: Geist Mono.
- Theme: light + dark; toggle in header. shadcn defaults are fine.
- Sidebar: fixed left, 240px, sections "Apps", "Users", "Audit log", "Account". Active item highlighted.
- Header: app slug crumb on app pages, user avatar dropdown on the right (Account / Logout).

- [ ] **Step 1: Update `app/globals.css`** with shadcn variables (already present from `init` step); add nothing extra.

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = { title: "projectMng" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Implement the dashboard layout**

`apps/web/src/app/(dashboard)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { Sidebar } from "@/components/nav/sidebar";
import { Header } from "@/components/nav/header";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen">
      <Sidebar />
      <div className="flex flex-col">
        <Header email={me.email} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `Sidebar` and `Header`**

`apps/web/src/components/nav/sidebar.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Users, ScrollText, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/apps", label: "Apps", icon: Boxes },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/account", label: "Account", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-r bg-muted/30 p-4 space-y-1">
      <div className="font-semibold px-2 py-3 text-lg">projectMng</div>
      {items.map((it) => {
        const active = pathname?.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
              active && "bg-muted font-medium",
            )}
          >
            <it.icon className="size-4" />
            {it.label}
          </Link>
        );
      })}
    </aside>
  );
}
```

`apps/web/src/components/nav/header.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";

export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="text-sm text-muted-foreground">{email}</div>
      <form action={logoutAction}>
        <Button variant="ghost" size="sm" type="submit">Sign out</Button>
      </form>
    </header>
  );
}
```

(`logoutAction` is added in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app apps/web/src/components/nav
git commit -m "web: add root + dashboard layouts with sidebar and header

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Auth — login + logout + WebAuthn

**Files:** `apps/web/src/app/login/page.tsx`, `components/auth/login-form.tsx`, `actions/auth.ts`, `lib/webauthn-browser.ts`.

- [ ] **Step 1: Server actions**

`apps/web/src/actions/auth.ts`:

```ts
"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { z } from "zod";

const PasswordLoginInput = z.object({ email: z.string().email(), password: z.string().min(1), totp: z.string().regex(/^\d{6}$/) });

export async function passwordLoginAction(prev: any, formData: FormData) {
  const parsed = PasswordLoginInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid input" };
  try {
    const res = await fetch(`${process.env.PM_API_URL}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) return { error: "invalid credentials" };
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const c = await cookies();
      // forward the Set-Cookie back to the browser
      for (const piece of setCookie.split(/,(?=[^ ;]+=)/)) {
        const [pair, ...attrs] = piece.split(";");
        const [name, value] = (pair ?? "").trim().split("=");
        if (!name || value === undefined) continue;
        c.set({ name, value, httpOnly: /httponly/i.test(piece), secure: /secure/i.test(piece), sameSite: "strict", path: "/" });
      }
    }
  } catch {
    return { error: "network error" };
  }
  redirect("/apps");
}

export async function logoutAction() {
  const c = await cookies();
  const cookieHeader = c.getAll().map((x) => `${x.name}=${x.value}`).join("; ");
  await apiFetch("/api/auth/logout", { method: "POST", cookie: cookieHeader }).catch(() => {});
  c.delete("pm_session");
  redirect("/login");
}
```

- [ ] **Step 2: Login page (Server Component shell)**

`apps/web/src/app/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 3: Login form (Client) with Passkey + Password tabs**

`apps/web/src/components/auth/login-form.tsx`:

```tsx
"use client";
import { useActionState, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { passwordLoginAction } from "@/actions/auth";

export function LoginForm() {
  const [pwState, pwAction] = useActionState(passwordLoginAction, null);
  const [pkEmail, setPkEmail] = useState("");
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function startPasskey() {
    setPkError(null); setPkBusy(true);
    try {
      const opts = await (await fetch(`/api/proxy/auth/webauthn/login/start`, { method: "POST", body: JSON.stringify({ email: pkEmail }), headers: { "content-type": "application/json" } })).json();
      const assertion = await startAuthentication({ optionsJSON: opts.options });
      const finish = await fetch(`/api/proxy/auth/webauthn/login/finish`, { method: "POST", body: JSON.stringify({ response: assertion }), headers: { "content-type": "application/json" } });
      if (!finish.ok) throw new Error("login failed");
      location.href = "/apps";
    } catch (e: any) { setPkError(e.message); } finally { setPkBusy(false); }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Sign in to projectMng</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="passkey">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="passkey">Passkey</TabsTrigger>
            <TabsTrigger value="password">Password + TOTP</TabsTrigger>
          </TabsList>

          <TabsContent value="passkey" className="space-y-3 mt-4">
            <Label htmlFor="pk-email">Email</Label>
            <Input id="pk-email" type="email" value={pkEmail} onChange={(e) => setPkEmail(e.target.value)} />
            <Button onClick={startPasskey} disabled={!pkEmail || pkBusy} className="w-full">{pkBusy ? "Waiting for passkey…" : "Continue"}</Button>
            {pkError && <p className="text-sm text-destructive">{pkError}</p>}
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <form action={pwAction} className="space-y-3">
              <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
              <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required /></div>
              <div><Label htmlFor="totp">TOTP</Label><Input id="totp" name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} required /></div>
              <Button type="submit" className="w-full">Sign in</Button>
              {pwState?.error && <p className="text-sm text-destructive">{pwState.error}</p>}
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Tiny proxy route for browser → pm-api**

The browser cannot reach `pm-api` directly (it's on the internal network). Add Next.js route handlers that forward to pm-api with the user's cookies.

`apps/web/src/app/api/proxy/[...path]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = `${env.PM_API_URL}/api/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const res = await fetch(url, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
    redirect: "manual",
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
```

(This is the simplest cookie-forwarding proxy. WebSocket upgrades from the browser still go to pm-api directly using its public hostname behind nginx; the WS subpath in pm-api is `/api/...` so nginx can route by path.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/login apps/web/src/app/api/proxy apps/web/src/components/auth apps/web/src/actions/auth.ts
git commit -m "web: add login (passkey + password+TOTP) and pm-api proxy route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Enrollment flow (bootstrap + invites)

**Files:** `apps/web/src/app/enroll/[token]/page.tsx`, `components/auth/enroll-form.tsx`, actions extension.

UI mirrors the login form's two-tab pattern, but for *registration*: tab 1 registers a passkey (calls `/api/proxy/auth/webauthn/registration/start` then `/finish`), tab 2 sets password + scans a QR for TOTP. Form fields: `email`, `nickname` (for the passkey), and on tab 2 a TOTP secret displayed + an `otpauth://` QR plus a verify field.

For the QR, use a lightweight library (`qrcode` npm package) on the server and render an inline SVG.

Commit: `web: add enrollment page with passkey and password+TOTP options`.

---

## Task 6: Apps list page

**Files:** `apps/web/src/app/(dashboard)/apps/page.tsx`, `components/apps/app-list.tsx`, `actions/apps.ts`.

Server-rendered list of apps. Empty state has a primary "New app" CTA. Each row: slug, repo, last deploy status (badge: queued/building/succeeded/failed), last deploy time (relative), domain count, internal port. Click → `/apps/[slug]`.

- [ ] **Step 1: Action**

```ts
"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export async function listApps() {
  return apiFetch<Array<{ id: string; slug: string; githubRepoFullName: string; internalPort: number; lastDeploy: { status: string; finishedAt: string | null } | null; domainCount: number }>>("/api/apps", { cookie: await serverCookieHeader() });
}
```

(The `domainCount` and `lastDeploy` enrichment is a small `/api/apps?include=summary` Plan 2 extension — add a follow-up task to Plan 2 Task 25 to support `?include=summary`.)

- [ ] **Step 2: Page**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listApps } from "@/actions/apps";
import { formatDistanceToNow } from "date-fns";

export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Apps</h1>
        <Link href="/apps/new"><Button>New app</Button></Link>
      </div>
      {apps.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p className="mb-4">No apps yet.</p>
          <Link href="/apps/new"><Button>Create your first app</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {apps.map((a) => (
            <Link href={`/apps/${a.slug}`} key={a.id}>
              <Card className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.slug}</div>
                  <div className="text-sm text-muted-foreground">{a.githubRepoFullName}</div>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {a.lastDeploy && (
                    <>
                      <Badge variant={a.lastDeploy.status === "succeeded" ? "default" : a.lastDeploy.status === "failed" ? "destructive" : "secondary"}>{a.lastDeploy.status}</Badge>
                      {a.lastDeploy.finishedAt && <span>{formatDistanceToNow(new Date(a.lastDeploy.finishedAt), { addSuffix: true })}</span>}
                    </>
                  )}
                  <span>:{a.internalPort}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

Commit: `web: add apps list page with status badges`.

---

## Task 7: New-app wizard

**Files:** `apps/web/src/app/(dashboard)/apps/new/page.tsx`, `components/apps/new-app-wizard.tsx`, extend `actions/apps.ts`.

Wizard with three steps:
1. **Pick GitHub installation + repo.** Server-rendered select populated from `/api/github/installations` + `/api/github/installations/:id/repos`.
2. **Configure.** Slug (auto-derived from repo name, editable), default branch (pre-filled), build root (default `.`), auto-deploy toggle.
3. **Create.** Server action `createApp({ slug, githubInstallationId, githubRepoFullName, defaultBranch, buildRoot, autoDeploy })`. On success, redirect to `/apps/[slug]`.

Commit: `web: add new-app wizard (GitHub repo picker + configure)`.

---

## Task 8: App detail layout + overview

**Files:** `apps/web/src/app/(dashboard)/apps/[slug]/layout.tsx`, `page.tsx`.

Layout adds a secondary tab bar: Overview · Deployments · Env · Domains · Volumes · Shell · Settings. The Overview page shows: latest succeeded deployment (commit short SHA + author + time), running container info (status, image tag, bound port), domain badges with cert state, and a primary "Deploy latest" button.

Commit: `web: add app detail layout with tabs and overview page`.

---

## Task 9: Deployments tab + live log streaming

**Files:** `apps/web/src/app/(dashboard)/apps/[slug]/deployments/page.tsx`, `[id]/page.tsx`, `components/apps/deployment-logs.tsx`.

Deployments page: list with status, commit, trigger, started/finished, duration. Click → deployment detail with live log tail.

- [ ] **Step 1: Implement `deployment-logs.tsx` (client, WebSocket)**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

export function DeploymentLogs({ deploymentId, initialLines }: { deploymentId: string; initialLines: string[] }) {
  const [lines, setLines] = useState<string[]>(initialLines);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/deployments/${deploymentId}/logs/ws`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLines((prev) => [...prev, `[${data.stream}] ${data.line}`]);
      } catch { setLines((prev) => [...prev, e.data]); }
    };
    return () => ws.close();
  }, [deploymentId]);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);

  return (
    <div ref={ref} className="font-mono text-xs bg-zinc-950 text-zinc-100 rounded-md p-4 h-[60vh] overflow-y-auto">
      {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

`web: add deployments list and live log tail (WebSocket)`.

---

## Task 10: Env vars tab

**Files:** `apps/web/src/app/(dashboard)/apps/[slug]/env/page.tsx`, `components/apps/env-var-form.tsx`, `actions/env-vars.ts`.

Table of env vars: key, masked value if `is_secret` else value, toggle, edit, delete. Form to add/update. Banner: "App has X unsaved env var changes — redeploy to apply" when env vars have been updated after last successful deployment.

Commit: `web: add env vars tab (encrypted secrets, redeploy banner)`.

---

## Task 11: Domains tab

**Files:** `apps/web/src/app/(dashboard)/apps/[slug]/domains/page.tsx`, `components/apps/domain-attach-form.tsx`, `actions/domains.ts`.

Form to add a hostname. After submit: progress UI shows the state machine (`pending_dns` → "Set this A record: x.x.x.x" → `pending_cert` → "Issuing certificate…" → `active`). Polls (or subscribes to a tiny WS endpoint if added in Plan 2). Each row shows hostname, cert state, days until expiry.

Commit: `web: add domains tab with DNS check + cert progress`.

---

## Task 12: Volumes tab + Settings tab

**Files:** corresponding pages + components + actions.

Volumes: list, add (mount path), remove (with confirmation modal). Settings: resource limits, health check path/status/timeout, restart policy, auto-deploy toggle, delete app (separate "Also delete volumes" checkbox).

Commit: `web: add volumes and settings tabs`.

---

## Task 13: Shell tab (xterm.js)

**Files:** `apps/web/src/app/(dashboard)/apps/[slug]/shell/page.tsx`, `components/shell/xterm-shell.tsx`.

- [ ] **Step 1: Component**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export function XtermShell({ appId }: { appId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({ fontFamily: "var(--font-mono)", fontSize: 13, theme: { background: "#09090b" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/apps/${appId}/shell`);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => { term.onData((d) => ws.send(d)); };
    ws.onmessage = (e) => { term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer)); };
    ws.onclose = () => term.write("\r\n[connection closed]\r\n");

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); ws.close(); term.dispose(); };
  }, [appId]);

  return <div ref={containerRef} className="h-[70vh] rounded-md overflow-hidden border" />;
}
```

- [ ] **Step 2: Commit**

`web: add browser shell tab (xterm + WebSocket bridge)`.

---

## Task 14: Users + Audit log + Account pages

**Files:** Corresponding page + components + actions.

- **Users page:** list (email, created), invite button (modal that calls `createInvite`, shows the one-time URL with copy-to-clipboard), delete user (confirmation).
- **Audit log page:** table with filters (action prefix, actor, date range). Server-paginated.
- **Account page:** list of registered passkeys (nickname, last used, remove); section to set up password + TOTP if not yet enabled; section to add another passkey.

Commit: `web: add users, audit log, and account pages`.

---

## Task 15: Smoke E2E (Playwright)

**Files:** `apps/web/playwright.config.ts`, `apps/web/tests/e2e/smoke.spec.ts`.

One end-to-end test that:
1. Boots Next.js dev server pointed at a mock pm-api (Mock Service Worker, or a tiny in-process Node http server returning canned responses).
2. Walks the login flow (password+TOTP path), sees the apps page, clicks "New app", picks the mocked repo, configures, creates, sees the new app on the list, clicks into it, clicks "Deploy latest", sees a "Building" badge.

This is a smoke — not a coverage net. It's our canary that the wiring across pages, server actions, and the proxy is intact.

Commit: `web: add Playwright smoke test (login → create app → deploy)`.

---

## Done — what you have at the end of Plan 3

- A polished Next.js dashboard at `pm.<your-domain>` that drives every Plan 2 endpoint.
- Working auth (passkeys + password+TOTP), with the bootstrap + invite enrollment flow.
- Apps CRUD, env vars (encrypted, masked), domains with cert progress, volumes, settings.
- Live deployment logs streamed over WebSocket.
- Browser shell via xterm.js + WebSocket.
- Users, audit log, and account pages.
- A Playwright smoke that exercises the critical path.

Plan 4 packages all three apps (helper, api, web) into a single one-shot install on a fresh Debian VPS.
