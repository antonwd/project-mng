import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("round-trips", async () => {
    const h = await hashPassword("hunter2");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "hunter2")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
});
