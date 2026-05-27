import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
};

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function encryptSecret(key: Uint8Array, plaintext: string): EncryptedSecret {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = new Uint8Array(enc.length + tag.length);
  out.set(enc, 0);
  out.set(tag, enc.length);
  return { ciphertext: out, nonce: new Uint8Array(nonce) };
}

export function decryptSecret(key: Uint8Array, ciphertextWithTag: Uint8Array, nonce: Uint8Array): string {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  if (nonce.length !== NONCE_BYTES) throw new Error("nonce must be 12 bytes");
  if (ciphertextWithTag.length < TAG_BYTES) throw new Error("ciphertext too short");
  const enc = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_BYTES);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}
