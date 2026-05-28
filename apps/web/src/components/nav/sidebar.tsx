"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Users, ScrollText, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/apps", label: "Apps", icon: Boxes },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/account", label: "Account", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-r bg-muted/30 p-4 space-y-1">
      <div className="font-semibold px-2 py-3 text-lg">projectMng</div>
      {items.map((it) => {
        const active = pathname?.startsWith(it.href) ?? false;
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
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
