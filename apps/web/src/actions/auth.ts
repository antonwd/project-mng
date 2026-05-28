"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

// Forward the browser's pm_session + any webauthn challenge cookies through to pm-api
// and copy any Set-Cookie pm-api emits back onto the response.
async function pmFetch(path: string, init: RequestInit & { forwardSetCookie?: boolean } = {}): Promise<Response> {
  const c = await cookies();
  const cookieHeader = c.getAll().map((x) => `${x.name}=${x.value}`).join("; ");
  const reqHeaders = new Headers(init.headers);
  if (cookieHeader) reqHeaders.set("cookie", cookieHeader);
  if (init.body && !reqHeaders.has("content-type")) reqHeaders.set("content-type", "application/json");
  reqHeaders.set("accept", "application/json");
  const forwardedFor = (await headers()).get("x-forwarded-for");
  if (forwardedFor) reqHeaders.set("x-forwarded-for", forwardedFor);
  const res = await fetch(`${env.PM_API_URL}${path}`, { ...init, headers: reqHeaders, cache: "no-store" });
  if (init.forwardSetCookie) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const parts = sc.split(";").map((s) => s.trim());
      const [head, ...rest] = parts;
      const eq = head.indexOf("=");
      if (eq <= 0) continue;
      const name = head.slice(0, eq);
      const value = head.slice(eq + 1);
      const opts: Parameters<typeof c.set>[2] = { path: "/" };
      for (const part of rest) {
        const [k, v] = part.split("=");
        const key = k?.toLowerCase();
        if (key === "max-age" && v) opts.maxAge = Number(v);
        else if (key === "path") opts.path = v ?? "/";
        else if (key === "secure") opts.secure = true;
        else if (key === "httponly") opts.httpOnly = true;
        else if (key === "samesite" && v) opts.sameSite = v.toLowerCase() as typeof opts.sameSite;
        else if (key === "expires" && v) opts.expires = new Date(v);
      }
      c.set(name, value, opts);
    }
  }
  return res;
}

const PasswordLoginInput = z.object({
  email: z.email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/),
});

export type ActionState = { error?: string } | undefined;

export async function passwordLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PasswordLoginInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid input" };
  const res = await pmFetch("/api/auth/password/login", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    forwardSetCookie: true,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `login failed (${res.status})` };
  }
  redirect("/apps");
}

export async function logoutAction() {
  const res = await pmFetch("/api/auth/logout", { method: "POST", forwardSetCookie: true });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "logout_failed", `logout failed (${res.status})`);
  }
  revalidatePath("/");
  redirect("/login");
}

const PasswordSetupInput = z.object({
  password: z.string().min(8),
  totpSecret: z.string().min(16),
  totpToken: z.string().regex(/^\d{6}$/),
});

export async function passwordSetupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = PasswordSetupInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "invalid input" };
  const res = await pmFetch("/api/auth/password/setup", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `setup failed (${res.status})` };
  }
  revalidatePath("/account");
  return undefined;
}

export async function startWebauthnRegistrationAction(inviteToken: string | undefined): Promise<{ options: unknown } | { error: string }> {
  const res = await pmFetch("/api/auth/webauthn/registration/start", {
    method: "POST",
    body: JSON.stringify({ inviteToken: inviteToken ?? undefined }),
    forwardSetCookie: true,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `registration start failed (${res.status})` };
  }
  return res.json();
}

export async function finishWebauthnRegistrationAction(input: { response: unknown; email: string; nickname: string; inviteToken?: string }): Promise<ActionState> {
  const res = await pmFetch("/api/auth/webauthn/registration/finish", {
    method: "POST",
    body: JSON.stringify(input),
    forwardSetCookie: true,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `registration failed (${res.status})` };
  }
  revalidatePath("/");
  redirect("/apps");
}

export async function startWebauthnLoginAction(email: string): Promise<{ options: unknown } | { error: string }> {
  const res = await pmFetch("/api/auth/webauthn/login/start", {
    method: "POST",
    body: JSON.stringify({ email }),
    forwardSetCookie: true,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `login start failed (${res.status})` };
  }
  return res.json();
}

export async function finishWebauthnLoginAction(response: unknown): Promise<ActionState> {
  const res = await pmFetch("/api/auth/webauthn/login/finish", {
    method: "POST",
    body: JSON.stringify({ response }),
    forwardSetCookie: true,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { error: body?.error?.message ?? `login failed (${res.status})` };
  }
  redirect("/apps");
}
