"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { revalidatePath } from "next/cache";

export type Domain = {
  id: string;
  appId: string;
  hostname: string;
  certStatus: string;
  certIssuedAt: string | null;
  certExpiresAt: string | null;
  lastError: string | null;
};

export async function listDomains(appId: string): Promise<Domain[]> {
  const cookie = await serverCookieHeader();
  const res = await apiFetch<{ domains: Domain[] }>(`/api/apps/${appId}/domains`, { cookie });
  return res.domains;
}

export async function addDomainAction(appId: string, hostname: string): Promise<{ error?: string; id?: string }> {
  const cookie = await serverCookieHeader();
  try {
    const res = await apiFetch<{ domain: Domain }>(`/api/apps/${appId}/domains`, {
      cookie,
      method: "POST",
      body: JSON.stringify({ hostname }),
    });
    revalidatePath(`/apps`);
    return { id: res.domain.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkDnsAction(domainId: string, expectedIp?: string): Promise<{ status: string; resolved: string[] }> {
  const cookie = await serverCookieHeader();
  return apiFetch(`/api/domains/${domainId}/check-dns`, {
    cookie,
    method: "POST",
    body: JSON.stringify(expectedIp ? { expectedIp } : {}),
  });
}

export async function removeDomainAction(domainId: string): Promise<void> {
  const cookie = await serverCookieHeader();
  await apiFetch(`/api/domains/${domainId}`, { cookie, method: "DELETE" });
  revalidatePath(`/apps`);
}
