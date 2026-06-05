import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getApp } from "@/actions/apps";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "deployments", label: "Deployments" },
  { slug: "env", label: "Env" },
  { slug: "domains", label: "Domains" },
  { slug: "volumes", label: "Volumes" },
  { slug: "shell", label: "Shell" },
  { slug: "settings", label: "Settings" },
];

type Params = Promise<{ slug: string }>;

export default async function AppLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold truncate">{app.slug}</h1>
        <div className="text-sm text-muted-foreground truncate">{app.githubRepoFullName}</div>
      </div>
      <nav className="border-b -mx-4 md:mx-0 overflow-x-auto">
        <div className="flex gap-1 px-4 md:px-0 snap-x snap-mandatory min-w-max">
          {TABS.map((t) => {
            const href = t.slug ? `/apps/${app.slug}/${t.slug}` : `/apps/${app.slug}`;
            return (
              <Link
                key={t.label}
                href={href}
                className="snap-start whitespace-nowrap px-3 py-2 text-sm border-b-2 border-transparent hover:border-foreground/40 data-[active]:border-foreground"
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div>{children}</div>
    </div>
  );
}
