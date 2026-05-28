import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listVolumes } from "@/actions/volumes";
import { VolumesPanel } from "@/components/apps/volumes-panel";

type Params = Promise<{ slug: string }>;

export default async function VolumesPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const volumes = await listVolumes(app.id);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Volumes</h2>
      <VolumesPanel appId={app.id} volumes={volumes} />
    </div>
  );
}
