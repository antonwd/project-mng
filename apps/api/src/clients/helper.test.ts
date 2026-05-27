import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:net";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HelperClient } from "./helper.js";

function readFrame(buf: Buffer): { len: number; payload: Buffer } | null {
  if (buf.length < 4) return null;
  const len = buf.readUInt32BE(0);
  if (buf.length < 4 + len) return null;
  return { len, payload: buf.subarray(4, 4 + len) };
}

function frame(payload: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  return Buffer.concat([len, payload]);
}

let server: Server;
let socketPath: string;
let lastRequest: any = null;
let nextResponse: any = { ok: true, data: { reloaded: true, validated: true } };

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "helper-test-"));
  socketPath = join(dir, "h.sock");
  server = createServer((conn) => {
    let buf = Buffer.alloc(0);
    conn.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const f = readFrame(buf);
      if (!f) return;
      lastRequest = JSON.parse(f.payload.toString("utf8"));
      const out = frame(Buffer.from(JSON.stringify(nextResponse), "utf8"));
      conn.end(out);
    });
  });
  await new Promise<void>((res) => server.listen(socketPath, res));
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe("HelperClient", () => {
  it("calls nginx.reload and parses success", async () => {
    nextResponse = { ok: true, data: { reloaded: true, validated: true } };
    const client = new HelperClient(socketPath);
    const r = await client.nginxReload();
    expect(r).toEqual({ reloaded: true, validated: true });
    expect(lastRequest).toEqual({ command: "nginx.reload" });
  });

  it("calls nginx.write_config with params", async () => {
    nextResponse = { ok: true, data: { path: "/etc/nginx/managed/x.conf", bytes: 9 } };
    const client = new HelperClient(socketPath);
    const r = await client.nginxWriteConfig("x", "server {}");
    expect(r.path).toContain("x.conf");
    expect(lastRequest).toEqual({ command: "nginx.write_config", params: { name: "x", content: "server {}" } });
  });

  it("throws HelperError on ok:false", async () => {
    nextResponse = { ok: false, error: "nginx_test_failed", message: "bad config", stderr: "..." };
    const client = new HelperClient(socketPath);
    await expect(client.nginxReload()).rejects.toThrow(/nginx_test_failed/);
  });

  it("certbot.issue passes domain + email", async () => {
    nextResponse = { ok: true, data: { domain: "ex.com", issued: true } };
    const client = new HelperClient(socketPath);
    await client.certbotIssue("ex.com", "me@ex.com");
    expect(lastRequest.params).toEqual({ domain: "ex.com", email: "me@ex.com" });
  });
});
