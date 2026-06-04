import * as React from "react";
import { cn } from "@/lib/utils";

export type DotStatus =
  | "running"
  | "deploying"
  | "queued"
  | "failed"
  | "stopped"
  | "succeeded";

const COLOR: Record<DotStatus, string> = {
  running: "bg-emerald-500",
  succeeded: "bg-emerald-500",
  deploying: "bg-amber-500",
  queued: "bg-amber-500",
  failed: "bg-red-500",
  stopped: "bg-muted-foreground/40",
};

const PULSE: Record<DotStatus, boolean> = {
  running: false,
  succeeded: false,
  deploying: true,
  queued: true,
  failed: false,
  stopped: false,
};

type StatusDotProps = {
  status: DotStatus;
  className?: string;
  label?: string;
};

export function StatusDot({ status, className, label }: StatusDotProps) {
  return (
    <span
      data-status={status}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn(
        "inline-block size-2 rounded-full",
        COLOR[status],
        PULSE[status] && "animate-pulse",
        className,
      )}
    />
  );
}
