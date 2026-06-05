import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getApp } from "@/actions/apps";
import { AppTabs } from "@/components/apps/app-tabs";

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
      <AppTabs slug={app.slug} />
      <div>{children}</div>
    </div>
  );
}
