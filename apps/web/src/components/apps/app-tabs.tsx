"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "deployments", label: "Deployments" },
  { slug: "env", label: "Env" },
  { slug: "domains", label: "Domains" },
  { slug: "volumes", label: "Volumes" },
  { slug: "shell", label: "Shell" },
  { slug: "settings", label: "Settings" },
];

export function AppTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="border-b -mx-4 md:mx-0 overflow-x-auto">
      <div className="flex gap-1 px-4 md:px-0 snap-x snap-mandatory min-w-max">
        {TABS.map((t) => {
          const href = t.slug ? `/apps/${slug}/${t.slug}` : `/apps/${slug}`;
          const active = pathname === href;
          return (
            <Link
              key={t.label}
              href={href}
              data-active={active || undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "snap-start whitespace-nowrap px-3 py-2 text-sm border-b-2 transition-colors",
                active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
