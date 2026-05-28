import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { XtermShell } from "@/components/shell/xterm-shell";

type Params = Promise<{ slug: string }>;

export default async function ShellPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Shell</h2>
        <p className="text-sm text-muted-foreground">
          Opens an interactive /bin/sh inside the running container. Sessions are audit-logged (open + close), content is never persisted.
        </p>
      </div>
      <XtermShell appId={app.id} />
    </div>
  );
}
