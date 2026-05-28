"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type Deployment = {
  id: string;
  appId: string;
  commitSha: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  trigger: string;
  triggeredBy: string | null;
  status: string;
  imageTag: string | null;
  containerId: string | null;
  boundPort: number | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
};

export type DeploymentLog = { id: string; ts: string; stream: string; line: string };

export async function listDeployments(appId: string): Promise<Deployment[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ deployments: Deployment[] }>(`/api/apps/${appId}/deployments`, { cookie });
  return res.deployments;
}

export async function getDeployment(id: string): Promise<{ deployment: Deployment; logs: DeploymentLog[] }> {
  const cookie = await serverCookieHeader();
  return apiFetch(`/api/deployments/${id}`, { cookie });
}

export async function enqueueDeployAction(appId: string, commitSha?: string): Promise<{ error?: string; id?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ deployment: Deployment }>(`/api/apps/${appId}/deployments`, {
      cookie,
      method: "POST",
      body: JSON.stringify(commitSha ? { commitSha } : {}),
    });
    revalidatePath(`/apps`);
    return { id: res.deployment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function redeployAction(deploymentId: string): Promise<{ error?: string; id?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ deployment: Deployment }>(`/api/deployments/${deploymentId}/redeploy`, {
      cookie,
      method: "POST",
    });
    return { id: res.deployment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rollbackAction(deploymentId: string): Promise<{ error?: string; id?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ deployment: Deployment }>(`/api/deployments/${deploymentId}/rollback`, {
      cookie,
      method: "POST",
    });
    return { id: res.deployment.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
