"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type User = { id: string; email: string; totpEnabled: boolean; createdAt: string };
export type Credential = { id: string; nickname: string; createdAt: string; lastUsedAt: string | null };

export async function listUsers(): Promise<User[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ users: User[] }>("/api/users", { cookie });
  return res.users;
}

export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  const cookie = await serverCookieHeader();
  try {
    await apiFetch(`/api/users/${id}`, { cookie, method: "DELETE" });
    revalidatePath("/users");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listCredentials(): Promise<Credential[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ credentials: Credential[] }>("/api/me/credentials", { cookie });
  return res.credentials;
}

export async function removeCredentialAction(id: string): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/me/credentials/${id}`, { cookie, method: "DELETE" });
  revalidatePath("/account");
}
