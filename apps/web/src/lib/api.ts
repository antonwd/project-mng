import { env } from "./env";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ApiError";
  }
}

export type ApiOptions = RequestInit & { cookie?: string };

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("accept", "application/json");
  if (opts.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (opts.cookie) headers.set("cookie", opts.cookie);
  const res = await fetch(`${env.PM_API_URL}${path}`, { ...opts, headers, cache: "no-store" });
  const text = await res.text();
  const data = text ? safeParseJson(text) : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error ?? { code: "unknown", message: text };
    throw new ApiError(res.status, err.code ?? "unknown", err.message ?? "request failed");
  }
  return data as T;
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}
