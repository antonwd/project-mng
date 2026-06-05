"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-r bg-muted/30 p-4 space-y-1">
      <div className="font-semibold px-2 py-3 text-lg">projectMng</div>
      {NAV_ITEMS.map((it) => {
        const active = pathname?.startsWith(it.href) ?? false;
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            data-active={active || undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
              active && "bg-muted font-medium",
            )}
          >
            <Icon className="size-4" />
            {it.label}
          </Link>
        );
      })}
    </aside>
  );
}
