import { describe, it, expect, afterAll } from "vitest";
import { startTestPostgres, stopTestPostgres } from "./setup.js";

describe("test postgres harness", () => {
  afterAll(async () => {
    await stopTestPostgres();
  });

  it("starts a postgres container and returns a DATABASE_URL", async () => {
    const url = await startTestPostgres();
    expect(url).toMatch(/^postgres:\/\/.*@.*:\d+\/.*$/);
  });

  it("returns the same URL on the second call (singleton)", async () => {
    const a = await startTestPostgres();
    const b = await startTestPostgres();
    expect(a).toBe(b);
  });
});
