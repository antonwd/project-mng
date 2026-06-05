import type { ActionResult } from "@/lib/toast";

/**
 * Adapt an action that returns `{ error?: string, ... }` (presence of error = failure)
 * to the canonical ActionResult shape.
 */
export async function fromMaybeError<T extends { error?: string }>(
  fn: () => Promise<T>,
): Promise<ActionResult> {
  try {
    const res = await fn();
    return res.error ? { ok: false, error: res.error } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Adapt an action that returns Promise<void> and throws on failure
 * to the canonical ActionResult shape.
 */
export async function fromThrowing(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
