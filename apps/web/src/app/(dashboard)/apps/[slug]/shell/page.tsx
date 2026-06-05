import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { XtermShell } from "@/components/shell/xterm-shell";
import { ErrorState } from "@/components/common/states";

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
      <div className="md:hidden">
        <ErrorState title="Shell needs a wider screen">
          The terminal is desktop-only. Open this app on a screen at least 768px wide to use the shell.
        </ErrorState>
      </div>
      <div className="hidden md:block">
        <XtermShell appId={app.id} />
      </div>
    </div>
  );
}
