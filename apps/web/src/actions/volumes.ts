"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type Volume = { id: string; appId: string; mountPath: string; dockerVolumeName: string };

export async function listVolumes(appId: string): Promise<Volume[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ volumes: Volume[] }>(`/api/apps/${appId}/volumes`, { cookie });
  return res.volumes;
}

export async function addVolumeAction(appId: string, mountPath: string): Promise<{ error?: string }> {
  const cookie = await serverCookieHeader();
  try {
    await apiFetch(`/api/apps/${appId}/volumes`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ mountPath }),
    });
    revalidatePath(`/apps`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeVolumeAction(appId: string, mountPath: string): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/apps/${appId}/volumes?mountPath=${encodeURIComponent(mountPath)}`, {
    cookie,
    method: "DELETE",
  });
  revalidatePath(`/apps`);
}
