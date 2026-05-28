import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { BadRequest } from "../lib/errors.js";

describe("createServer", () => {
  it("returns JSON error for HTTPError", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    app.get("/boom", () => { throw BadRequest("nope"); });
    const r = await app.inject({ method: "GET", url: "/boom" });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body)).toEqual({ error: { code: "bad_request", message: "nope" } });
    await app.close();
  });

  it("returns 500 with no stack for unknown errors", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    app.get("/kaboom", () => { throw new Error("oops"); });
    const r = await app.inject({ method: "GET", url: "/kaboom" });
    expect(r.statusCode).toBe(500);
    const body = JSON.parse(r.body);
    expect(body.error.code).toBe("internal_error");
    expect(body).not.toHaveProperty("stack");
    await app.close();
  });
});
