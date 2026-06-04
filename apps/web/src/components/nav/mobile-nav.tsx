"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
            <Menu />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>projectMng</SheetTitle>
        </SheetHeader>
        <nav className="px-2 space-y-1">
          {NAV_ITEMS.map((it) => {
            const active = pathname?.startsWith(it.href) ?? false;
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                data-active={active}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted touch-target",
                  active && "bg-muted font-medium",
                )}
              >
                <Icon className="size-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
