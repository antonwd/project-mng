import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { apps } from "../db/schema.js";
import { Conflict } from "../lib/errors.js";

export type CreateAppInput = {
  slug: string;
  githubInstallationId: bigint;
  githubRepoFullName: string;
  defaultBranch: string;
  buildRoot?: string;
  autoDeploy?: boolean;
  createdBy: string;
};

export class AppsService {
  constructor(private db: Database, private opts: { portMin: number; portMax: number }) {}

  async create(input: CreateAppInput) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const port = await this.allocPort();
      try {
        const inserted = await this.db.insert(apps).values({
          slug: input.slug,
          githubInstallationId: input.githubInstallationId,
          githubRepoFullName: input.githubRepoFullName,
          defaultBranch: input.defaultBranch,
          buildRoot: input.buildRoot ?? ".",
          autoDeploy: input.autoDeploy ?? false,
          internalPort: port,
          createdBy: input.createdBy,
        }).returning();
        const row = inserted[0];
        if (!row) throw new Error("insert returned no row");
        return row;
      } catch (e: any) {
        if (e.code === "23505" && /internal_port/.test(e.detail ?? "")) continue;
        if (e.code === "23505") throw Conflict(`slug already exists: ${input.slug}`);
        throw e;
      }
    }
    throw new Error("could not allocate port after 10 attempts");
  }

  private async allocPort(): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT g.n AS port
      FROM generate_series(${this.opts.portMin}::int, ${this.opts.portMax}::int) AS g(n)
      WHERE NOT EXISTS (SELECT 1 FROM apps WHERE apps.internal_port = g.n)
      ORDER BY random()
      LIMIT 1
    `);
    const rows = (result as unknown as { rows: Array<{ port: number }> }).rows;
    const port = rows[0]?.port;
    if (port == null) throw new Error("no free ports in pool");
    return port;
  }

  async listActive() {
    return this.db.select().from(apps).where(isNull(apps.deletedAt));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(apps).where(and(eq(apps.id, id), isNull(apps.deletedAt)));
    return row ?? null;
  }

  async getBySlug(slug: string) {
    const [row] = await this.db.select().from(apps).where(and(eq(apps.slug, slug), isNull(apps.deletedAt)));
    return row ?? null;
  }

  async getByRepo(repoFullName: string) {
    const [row] = await this.db.select().from(apps).where(
      and(eq(apps.githubRepoFullName, repoFullName), isNull(apps.deletedAt)),
    );
    return row ?? null;
  }

  async softDelete(id: string) {
    await this.db.update(apps).set({ deletedAt: new Date() }).where(eq(apps.id, id));
  }
}
