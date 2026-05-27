import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken, constantTimeEqual } from "./tokens.js";

describe("tokens", () => {
  it("generates a base64url token of the requested entropy", () => {
    const t = generateOpaqueToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(40);
  });

  it("hashes deterministically", () => {
    const h1 = hashToken("abc");
    const h2 = hashToken("abc");
    expect(Buffer.from(h1).equals(Buffer.from(h2))).toBe(true);
    expect(h1.length).toBe(32);
  });

  it("constant-time equality matches and rejects", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
