"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export type Installation = { id: number; account: string };
export type Repo = { id: number; fullName: string; defaultBranch: string };

export async function listInstallations(): Promise<Installation[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ installations: Installation[] }>("/api/github/installations", { cookie });
  return res.installations;
}

export async function listInstallationRepos(installationId: string): Promise<Repo[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ repos: Repo[] }>(`/api/github/installations/${installationId}/repos`, { cookie });
  return res.repos;
}
