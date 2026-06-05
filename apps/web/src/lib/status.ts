import type { DotStatus } from "@/components/common/status-dot";

export function statusToDot(status: string | undefined): DotStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "running" || status === "deploying" || status === "queued") return status;
  return "stopped";
}
