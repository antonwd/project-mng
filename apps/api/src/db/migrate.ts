import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
import { loadConfig } from "../config.js";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  await pool.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
