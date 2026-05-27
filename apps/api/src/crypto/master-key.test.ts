import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadMasterKey, _resetMasterKeyCacheForTests } from "./master-key.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mk-"));
  _resetMasterKeyCacheForTests();
});

describe("loadMasterKey", () => {
  it("loads a 32-byte key from a 0400 file", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o400);
    const key = loadMasterKey(p);
    expect(key.length).toBe(32);
  });

  it("rejects a file that is not exactly 32 bytes", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(16, 1));
    chmodSync(p, 0o400);
    expect(() => loadMasterKey(p)).toThrow(/32 bytes/);
  });

  it("rejects a world-readable file", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o644);
    expect(() => loadMasterKey(p)).toThrow(/permissions/);
  });

  it("caches: same instance on subsequent calls with same path", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o400);
    const a = loadMasterKey(p);
    const b = loadMasterKey(p);
    expect(a).toBe(b);
  });
});
