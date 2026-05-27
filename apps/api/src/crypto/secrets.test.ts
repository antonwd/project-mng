import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./secrets.js";

const key = new Uint8Array(32).map((_, i) => i);

describe("AES-256-GCM secrets", () => {
  it("round-trips a plaintext", () => {
    const { ciphertext, nonce } = encryptSecret(key, "hello world");
    expect(nonce.length).toBe(12);
    expect(ciphertext.length).toBeGreaterThan(0);
    const plain = decryptSecret(key, ciphertext, nonce);
    expect(plain).toBe("hello world");
  });

  it("uses a unique nonce per call", () => {
    const a = encryptSecret(key, "x");
    const b = encryptSecret(key, "x");
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
  });

  it("fails to decrypt with the wrong key", () => {
    const { ciphertext, nonce } = encryptSecret(key, "secret");
    const wrong = new Uint8Array(32).fill(9);
    expect(() => decryptSecret(wrong, ciphertext, nonce)).toThrow();
  });

  it("fails to decrypt a tampered ciphertext", () => {
    const { ciphertext, nonce } = encryptSecret(key, "secret");
    ciphertext[0] ^= 0xff;
    expect(() => decryptSecret(key, ciphertext, nonce)).toThrow();
  });
});
