import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { appVolumes, apps } from "../db/schema.js";
import { BadRequest, Conflict, NotFound } from "../lib/errors.js";

const MOUNT_RE = /^\/[A-Za-z0-9._\-/]+$/;

export class VolumesService {
  constructor(private db: Database) {}

  async add(appId: string, mountPath: string) {
    if (!MOUNT_RE.test(mountPath)) throw BadRequest("invalid mount path");
    const [app] = await this.db.select().from(apps).where(eq(apps.id, appId));
    if (!app) throw NotFound("app not found");
    const seqResult = await this.db.execute(sql`
      SELECT COUNT(*)::int AS n FROM app_volumes WHERE app_id = ${appId}
    `);
    const rows = (seqResult as unknown as { rows: Array<{ n: number }> }).rows;
    const seq = (rows[0]?.n ?? 0) + 1;
    const dockerVolumeName = `pm_app_${app.slug}_${seq}`;
    try {
      const inserted = await this.db.insert(appVolumes).values({ appId, mountPath, dockerVolumeName }).returning();
      const row = inserted[0];
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (e: any) {
      if (e.code === "23505") throw Conflict(`mount already exists: ${mountPath}`);
      throw e;
    }
  }

  async list(appId: string) {
    return this.db.select().from(appVolumes).where(eq(appVolumes.appId, appId));
  }

  async remove(appId: string, mountPath: string) {
    await this.db.delete(appVolumes).where(and(eq(appVolumes.appId, appId), eq(appVolumes.mountPath, mountPath)));
  }
}
