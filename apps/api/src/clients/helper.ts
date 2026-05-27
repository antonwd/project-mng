import { createConnection } from "node:net";

export class HelperError extends Error {
  constructor(public code: string, message: string, public stderr?: string) {
    super(`${code}: ${message}`);
    this.name = "HelperError";
  }
}

type Response = { ok: true; data: any } | { ok: false; error: string; message: string; stderr?: string };

export class HelperClient {
  constructor(private socketPath: string, private timeoutMs = 30_000) {}

  async nginxReload(): Promise<{ validated: boolean; reloaded: boolean }> {
    return (await this.call({ command: "nginx.reload" })) as any;
  }

  async nginxWriteConfig(name: string, content: string): Promise<{ path: string; bytes: number }> {
    return (await this.call({ command: "nginx.write_config", params: { name, content } })) as any;
  }

  async certbotIssue(domain: string, email: string): Promise<{ domain: string; issued: boolean }> {
    return (await this.call({ command: "certbot.issue", params: { domain, email } })) as any;
  }

  async certbotRenew(): Promise<{ renewed: boolean; stdout: string }> {
    return (await this.call({ command: "certbot.renew" })) as any;
  }

  private call(req: { command: string; params?: unknown }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const conn = createConnection(this.socketPath);
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        conn.destroy(new Error(`helper call timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      conn.on("connect", () => {
        const payload = Buffer.from(JSON.stringify(req), "utf8");
        const hdr = Buffer.alloc(4);
        hdr.writeUInt32BE(payload.length, 0);
        conn.write(Buffer.concat([hdr, payload]));
      });
      conn.on("data", (c) => chunks.push(c));
      conn.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      conn.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (buf.length < 4) return reject(new Error("short helper response"));
        const len = buf.readUInt32BE(0);
        const payload = buf.subarray(4, 4 + len);
        let resp: Response;
        try {
          resp = JSON.parse(payload.toString("utf8"));
        } catch (e) {
          return reject(e as Error);
        }
        if (resp.ok) resolve(resp.data);
        else reject(new HelperError(resp.error, resp.message, resp.stderr));
      });
    });
  }
}
