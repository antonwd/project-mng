"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type EnvVar = { key: string; value: string | null; isSecret: boolean };

export async function listEnvVars(appId: string): Promise<EnvVar[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ envVars: EnvVar[] }>(`/api/apps/${appId}/env-vars`, { cookie });
  return res.envVars;
}

export async function upsertEnvVarAction(appId: string, formData: FormData): Promise<{ error?: string }> {
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");
  const isSecret = formData.get("isSecret") === "on" || formData.get("isSecret") === "true";
  const cookie = await serverCookieHeader();
  try {
    await apiFetch(`/api/apps/${appId}/env-vars`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ key, value, isSecret }),
    });
    revalidatePath(`/apps`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteEnvVarAction(appId: string, key: string): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/apps/${appId}/env-vars/${key}`, { cookie, method: "DELETE" });
  revalidatePath(`/apps`);
}
