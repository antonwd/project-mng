import { describe, it, expect } from "vitest";
import { verifyGithubSignature } from "./github.js";
import { createHmac } from "node:crypto";

describe("verifyGithubSignature", () => {
  const secret = "whsec_topsecret";
  const body = '{"hello":"world"}';
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyGithubSignature(secret, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyGithubSignature(secret, body + " ", sig)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyGithubSignature(secret, body, "")).toBe(false);
    expect(verifyGithubSignature(secret, body, "sha1=abc")).toBe(false);
  });
});
