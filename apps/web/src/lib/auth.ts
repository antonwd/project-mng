import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "./api";

export async function serverCookieHeader(): Promise<string> {
  const c = await cookies();
  return c.getAll().map((x) => `${x.name}=${x.value}`).join("; ");
}

export type Me = { id: string; email: string; totpEnabled: boolean };

export async function requireSession(): Promise<Me> {
  const cookie = await serverCookieHeader();
  try {
    return await apiFetch<Me>("/api/me", { cookie });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    throw e;
  }
}

export async function maybeSession(): Promise<Me | null> {
  const cookie = await serverCookieHeader();
  try {
    return await apiFetch<Me>("/api/me", { cookie });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
