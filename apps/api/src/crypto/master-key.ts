import { readFileSync, statSync } from "node:fs";

let cached: { path: string; key: Uint8Array } | null = null;

export function loadMasterKey(path: string): Uint8Array {
  if (cached && cached.path === path) return cached.key;
  const st = statSync(path);
  if (process.platform !== "win32") {
    const mode = st.mode & 0o777;
    if (mode & 0o077) {
      throw new Error(`master key file ${path} has too-broad permissions: 0${mode.toString(8)}`);
    }
  }
  const buf = readFileSync(path);
  if (buf.length !== 32) {
    throw new Error(`master key file ${path} must be exactly 32 bytes, got ${buf.length}`);
  }
  const key = new Uint8Array(buf);
  cached = { path, key };
  return key;
}

// Test-only.
export function _resetMasterKeyCacheForTests(): void {
  cached = null;
}
