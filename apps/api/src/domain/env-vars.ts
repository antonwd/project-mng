import { eq, and } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { appEnvVars } from "../db/schema.js";
import { encryptSecret, decryptSecret } from "../crypto/secrets.js";

export class EnvVarsService {
  constructor(private db: Database, private masterKey: Uint8Array) {}

  async upsert(appId: string, key: string, value: string, isSecret: boolean): Promise<void> {
    const { ciphertext, nonce } = encryptSecret(this.masterKey, value);
    await this.db
      .insert(appEnvVars)
      .values({ appId, key, valueEnc: ciphertext, valueNonce: nonce, isSecret })
      .onConflictDoUpdate({
        target: [appEnvVars.appId, appEnvVars.key],
        set: { valueEnc: ciphertext, valueNonce: nonce, isSecret, updatedAt: new Date() },
      });
  }

  async listForUi(appId: string): Promise<Array<{ key: string; value: string | null; isSecret: boolean }>> {
    const rows = await this.db.select().from(appEnvVars).where(eq(appEnvVars.appId, appId));
    return rows.map((r) => ({
      key: r.key,
      value: r.isSecret ? null : decryptSecret(this.masterKey, r.valueEnc, r.valueNonce),
      isSecret: r.isSecret,
    }));
  }

  async resolveForRuntime(appId: string): Promise<Record<string, string>> {
    const rows = await this.db.select().from(appEnvVars).where(eq(appEnvVars.appId, appId));
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = decryptSecret(this.masterKey, r.valueEnc, r.valueNonce);
    return out;
  }

  async delete(appId: string, key: string): Promise<void> {
    await this.db.delete(appEnvVars).where(and(eq(appEnvVars.appId, appId), eq(appEnvVars.key, key)));
  }
}
