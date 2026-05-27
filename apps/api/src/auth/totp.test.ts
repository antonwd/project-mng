import { describe, it, expect } from "vitest";
import { generateTotpSecret, verifyTotp, otpauthUri } from "./totp.js";
import { authenticator } from "otplib";

describe("totp", () => {
  it("generates a base32 secret", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
  });
  it("verifies a token from otplib", () => {
    const s = generateTotpSecret();
    const t = authenticator.generate(s);
    expect(verifyTotp(s, t)).toBe(true);
    expect(verifyTotp(s, "000000")).toBe(false);
  });
  it("builds an otpauth URI", () => {
    const uri = otpauthUri("you@example.com", "ABCDEFGHIJK234567", "projectMng");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=projectMng");
  });
});
