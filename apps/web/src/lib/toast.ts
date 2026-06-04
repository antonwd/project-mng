import { toast } from "sonner";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type ToastMessages = {
  success: string;
  errorPrefix: string;
};

export function toastResult(result: ActionResult, messages: ToastMessages): void {
  if (result.ok) {
    toast.success(messages.success);
  } else {
    toast.error(`${messages.errorPrefix}: ${result.error}`);
  }
}
