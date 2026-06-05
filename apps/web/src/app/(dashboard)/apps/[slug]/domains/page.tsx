import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDomains } from "@/actions/domains";
import { DomainAttachForm } from "@/components/apps/domain-attach-form";
import { DomainsList } from "@/components/apps/domains-list";

type Params = Promise<{ slug: string }>;

export default async function DomainsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const domains = await listDomains(app.id);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Domains</h2>
      <DomainAttachForm appId={app.id} />
      <DomainsList appId={app.id} domains={domains} />
    </div>
  );
}
