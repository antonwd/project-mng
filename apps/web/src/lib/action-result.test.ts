import { describe, it, expect } from "vitest";
import { fromMaybeError, fromThrowing } from "./action-result";

describe("fromMaybeError", () => {
  it("returns ok when the action result has no error field", async () => {
    const res = await fromMaybeError(async () => ({}));
    expect(res).toEqual({ ok: true });
  });

  it("returns ok when error field is undefined", async () => {
    const res = await fromMaybeError(async () => ({ error: undefined }));
    expect(res).toEqual({ ok: true });
  });

  it("returns not-ok when error field is a string", async () => {
    const res = await fromMaybeError(async () => ({ error: "slug taken" }));
    expect(res).toEqual({ ok: false, error: "slug taken" });
  });

  it("catches thrown errors and returns not-ok", async () => {
    const res = await fromMaybeError(async () => {
      throw new Error("boom");
    });
    expect(res).toEqual({ ok: false, error: "boom" });
  });
});

describe("fromThrowing", () => {
  it("returns ok when the action resolves without throwing", async () => {
    const res = await fromThrowing(async () => undefined);
    expect(res).toEqual({ ok: true });
  });

  it("catches thrown errors and returns not-ok", async () => {
    const res = await fromThrowing(async () => {
      throw new Error("nope");
    });
    expect(res).toEqual({ ok: false, error: "nope" });
  });
});
