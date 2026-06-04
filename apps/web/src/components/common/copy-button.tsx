"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label: string;
  variant?: "inline" | "block";
  className?: string;
};

export function CopyButton({ value, label, variant = "inline", className }: CopyButtonProps) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label}`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs font-mono text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        variant === "block" && "w-full justify-between",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Copy className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}
