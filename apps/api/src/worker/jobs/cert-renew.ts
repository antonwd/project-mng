import type { HelperClient } from "../../clients/helper.js";

export type CertRenewDeps = { helper: HelperClient };

export async function runCertRenew(deps: CertRenewDeps): Promise<void> {
  await deps.helper.certbotRenew();
  await deps.helper.nginxReload();
}
