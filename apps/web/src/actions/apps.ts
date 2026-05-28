"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type AppSummary = {
  id: string;
  slug: string;
  githubRepoFullName: string;
  githubInstallationId: string;
  defaultBranch: string;
  buildRoot: string;
  autoDeploy: boolean;
  internalPort: number;
  memLimitMb: number;
  cpuLimit: string;
  healthCheckPath: string;
  healthCheckStatus: number;
  healthCheckTimeoutS: number;
  restartPolicy: string;
  createdAt: string;
  domainCount?: number;
  lastDeploy?: {
    id: string;
    status: string;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    commitSha: string;
  } | null;
};

export async function listApps(): Promise<AppSummary[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ apps: AppSummary[] }>("/api/apps?include=summary", { cookie });
  return res.apps;
}

export async function getApp(idOrSlug: string): Promise<AppSummary | null> {
  const cookie = await serverCookieHeader();
  // Caller passes the id; slug-based lookup is a future enhancement.
  try {
    const res = await apiFetch<{ app: AppSummary }>(`/api/apps/${idOrSlug}`, { cookie });
    return res.app;
  } catch {
    // Fall back: scan the list for a slug match.
    const all = await listApps();
    return all.find((a) => a.slug === idOrSlug || a.id === idOrSlug) ?? null;
  }
}

export type CreateAppInput = {
  slug: string;
  githubInstallationId: string;
  githubRepoFullName: string;
  defaultBranch: string;
  buildRoot?: string;
  autoDeploy?: boolean;
};

export async function createAppAction(input: CreateAppInput): Promise<{ error?: string; slug?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ app: AppSummary }>("/api/apps", {
      cookie,
      method: "POST",
      body: JSON.stringify(input),
    });
    revalidatePath("/apps");
    return { slug: res.app.slug };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteAppAction(id: string): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/apps/${id}`, { cookie, method: "DELETE" });
  revalidatePath("/apps");
  redirect("/apps");
}

export async function updateAppAction(id: string, patch: { defaultBranch?: string; buildRoot?: string; autoDeploy?: boolean }): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/apps/${id}`, { cookie, method: "PATCH", body: JSON.stringify(patch) });
  revalidatePath(`/apps/${id}`);
}
