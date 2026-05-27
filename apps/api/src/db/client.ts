import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string): { pool: Pool; db: Database } {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
