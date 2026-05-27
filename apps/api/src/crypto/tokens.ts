import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(raw: string | Uint8Array): Uint8Array {
  const hash = createHash("sha256");
  hash.update(typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw));
  return new Uint8Array(hash.digest());
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
