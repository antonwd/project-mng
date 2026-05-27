import { describe, it, expect } from "vitest";
import { WebAuthnService } from "./webauthn.js";

const svc = new WebAuthnService({ rpId: "pm.example.com", rpName: "projectMng", origin: "https://pm.example.com" });

describe("WebAuthnService", () => {
  it("emits registration options with rpId/rpName", async () => {
    const o = await svc.startRegistration({ userId: "00000000-0000-0000-0000-000000000001", userName: "you@example.com" });
    expect(o.options.rp.id).toBe("pm.example.com");
    expect(o.options.rp.name).toBe("projectMng");
    expect(typeof o.challenge).toBe("string");
    expect(o.challenge.length).toBeGreaterThan(0);
  });

  it("emits authentication options", async () => {
    const o = await svc.startAuthentication({ allowCredentialIds: [] });
    expect(typeof o.challenge).toBe("string");
  });
});
