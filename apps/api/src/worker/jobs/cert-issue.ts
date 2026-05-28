import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { HelperClient } from "../../clients/helper.js";
import { domains } from "../../db/schema.js";
import { renderManagedSite } from "../../lib/nginx-template.js";

export type CertIssueDeps = {
  db: Database;
  helper: HelperClient;
  cfg: { acmeEmail: string };
};

export async function runCertIssue(data: { domainId: string }, deps: CertIssueDeps): Promise<void> {
  const [d] = await deps.db.select().from(domains).where(eq(domains.id, data.domainId));
  if (!d) return;
  try {
    const httpConf = renderManagedSite({
      hostname: d.hostname,
      certActive: false,
      upstreamPort: 1,
      acmeWebroot: "/var/www/_acme",
    });
    await deps.helper.nginxWriteConfig(`acme-${d.hostname.replace(/\./g, "-")}`, httpConf);
    await deps.helper.nginxReload();
    await deps.helper.certbotIssue(d.hostname, deps.cfg.acmeEmail);
    await deps.db.update(domains).set({
      certStatus: "active",
      certIssuedAt: new Date(),
      certExpiresAt: new Date(Date.now() + 90 * 86_400_000),
      lastError: null,
      updatedAt: new Date(),
    }).where(eq(domains.id, d.id));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await deps.db.update(domains).set({
      certStatus: "failed",
      lastError: msg.slice(0, 1000),
      updatedAt: new Date(),
    }).where(eq(domains.id, d.id));
    throw e;
  }
}
