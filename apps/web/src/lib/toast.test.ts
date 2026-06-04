import { vi } from "vitest";

const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: successMock, error: errorMock },
}));

describe("toastResult", () => {
  beforeEach(() => {
    successMock.mockClear();
    errorMock.mockClear();
  });

  it("fires a success toast when result is ok", async () => {
    const { toastResult } = await import("./toast");
    toastResult({ ok: true }, { success: "Saved", errorPrefix: "Save failed" });
    expect(successMock).toHaveBeenCalledWith("Saved");
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("fires an error toast with prefix + error message when not ok", async () => {
    const { toastResult } = await import("./toast");
    toastResult(
      { ok: false, error: "slug already in use" },
      { success: "Saved", errorPrefix: "Save failed" },
    );
    expect(errorMock).toHaveBeenCalledWith("Save failed: slug already in use");
    expect(successMock).not.toHaveBeenCalled();
  });
});
