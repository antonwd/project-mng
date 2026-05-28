import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { SettingsPanel } from "@/components/apps/settings-panel";

type Params = Promise<{ slug: string }>;

export default async function SettingsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Settings</h2>
      <SettingsPanel app={app} />
    </div>
  );
}
