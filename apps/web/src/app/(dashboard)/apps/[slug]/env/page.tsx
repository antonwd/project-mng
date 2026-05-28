import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { listEnvVars } from "@/actions/env-vars";
import { EnvVarForm } from "@/components/apps/env-var-form";
import { EnvVarsTable } from "@/components/apps/env-vars-table";

type Params = Promise<{ slug: string }>;

export default async function EnvPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const [envVars, deployments] = await Promise.all([
    listEnvVars(app.id),
    listDeployments(app.id).catch(() => []),
  ]);
  const lastSucceeded = deployments.find((d) => d.status === "succeeded");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Environment variables</h2>
      {envVars.length > 0 && lastSucceeded && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          Env var changes only take effect after the next deploy.
        </div>
      )}
      <EnvVarForm appId={app.id} />
      <EnvVarsTable appId={app.id} envVars={envVars} />
    </div>
  );
}
