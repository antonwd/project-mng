"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type Invite = {
  createdBy: string;
  email: string | null;
  expiresAt: string;
  consumedAt: string | null;
};

export async function listInvites(): Promise<Invite[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ invites: Invite[] }>("/api/invites", { cookie });
  return res.invites;
}

export async function createInviteAction(email?: string): Promise<{ url?: string; token?: string; error?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ url: string; token: string }>("/api/invites", {
      cookie,
      method: "POST",
      body: JSON.stringify(email ? { email } : {}),
    });
    revalidatePath("/users");
    return res;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
