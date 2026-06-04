"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Hint({ ...props }: Popover.Root.Props) {
  return <Popover.Root data-slot="hint" {...props} />;
}

function HintTrigger({
  children,
  ...props
}: Popover.Trigger.Props) {
  return (
    <Popover.Trigger
      data-slot="hint-trigger"
      openOnHover
      delay={200}
      {...props}
    >
      {children}
    </Popover.Trigger>
  );
}

function HintContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: Popover.Popup.Props & { sideOffset?: number }) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={sideOffset}>
        <Popover.Popup
          data-slot="hint-content"
          className={cn(
            "z-50 max-w-xs rounded-md bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-md ring-1 ring-foreground/10",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

export { Hint, HintTrigger, HintContent };
