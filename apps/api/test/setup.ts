import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let containerPromise: Promise<StartedPostgreSqlContainer> | null = null;

export async function startTestPostgres(): Promise<string> {
  if (!containerPromise) {
    containerPromise = new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("projectmng_test")
      .withUsername("test")
      .withPassword("test")
      .start();
  }
  const c = await containerPromise;
  return c.getConnectionUri();
}

export async function stopTestPostgres(): Promise<void> {
  if (!containerPromise) return;
  const c = await containerPromise;
  await c.stop({ remove: true });
  containerPromise = null;
}
