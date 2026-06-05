"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { Hint, HintTrigger, HintContent } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

type HelpHintProps = {
  children: React.ReactNode;
  className?: string;
  label?: string;
};

export function HelpHint({ children, className, label = "Help" }: HelpHintProps) {
  return (
    <Hint>
      <HintTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              className,
            )}
          />
        }
      >
        <HelpCircle className="size-3.5" />
      </HintTrigger>
      <HintContent>{children}</HintContent>
    </Hint>
  );
}
