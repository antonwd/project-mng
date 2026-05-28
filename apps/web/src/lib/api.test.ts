import { describe, it, expect, vi, beforeEach } from "vitest";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PM_API_URL = "http://pm-api:3000";
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID = "pm.example.com";
  });

  it("prefixes PM_API_URL and forwards cookie header", async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("./api");
    const r = await apiFetch("/api/apps", { cookie: "pm_session=abc" });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://pm-api:3000/api/apps",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const callHeaders = fetchMock.mock.calls[0]![1]!.headers as Headers;
    expect(callHeaders.get("cookie")).toBe("pm_session=abc");
    vi.unstubAllGlobals();
  });

  it("throws on non-2xx with error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"code":"forbidden","message":"nope"}}', { status: 403, headers: { "content-type": "application/json" } })));
    const { apiFetch, ApiError } = await import("./api");
    await expect(apiFetch("/api/apps")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/api/apps")).rejects.toThrow(/forbidden/);
    vi.unstubAllGlobals();
  });
});
