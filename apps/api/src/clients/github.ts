import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export function verifyGithubSignature(secret: string, body: string, header: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type GithubClientOptions = {
  appId: string;
  privateKeyPath: string;
};

export class GithubClient {
  private auth: ReturnType<typeof createAppAuth>;
  private appId: string;
  private privateKey: string;

  constructor(opts: GithubClientOptions) {
    this.appId = opts.appId;
    this.privateKey = readFileSync(opts.privateKeyPath, "utf8");
    this.auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
  }

  private appOctokit(): Octokit {
    return new Octokit({ authStrategy: createAppAuth, auth: { appId: this.appId, privateKey: this.privateKey } });
  }

  async installationToken(installationId: bigint | number): Promise<string> {
    const r = await this.auth({ type: "installation", installationId: Number(installationId) });
    return r.token;
  }

  async forInstallation(installationId: bigint | number): Promise<Octokit> {
    return new Octokit({ auth: await this.installationToken(installationId) });
  }

  async listInstallations() {
    const r = await this.appOctokit().apps.listInstallations({ per_page: 100 });
    return r.data.map((i) => {
      const account = i.account as { login?: string; name?: string } | null | undefined;
      return { id: i.id, account: account?.login ?? account?.name ?? "?" };
    });
  }

  async listInstallationRepos(installationId: bigint | number) {
    const r = await (await this.forInstallation(installationId)).apps.listReposAccessibleToInstallation({ per_page: 100 });
    return r.data.repositories.map((repo) => ({ id: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch }));
  }
}
