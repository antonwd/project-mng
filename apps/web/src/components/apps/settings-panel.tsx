"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/common/help-hint";
import { updateAppAction, deleteAppAction, type AppSummary } from "@/actions/apps";

export function SettingsPanel({ app }: { app: AppSummary }) {
  const router = useRouter();
  const [defaultBranch, setDefaultBranch] = useState(app.defaultBranch);
  const [buildRoot, setBuildRoot] = useState(app.buildRoot);
  const [autoDeploy, setAutoDeploy] = useState(app.autoDeploy);
  const [busy, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function save() {
    startTransition(async () => {
      await updateAppAction(app.id, { defaultBranch, buildRoot, autoDeploy });
      setSavedAt(new Date());
      router.refresh();
    });
  }

  function destroy() {
    if (!confirm(`Permanently delete ${app.slug}? Container will be removed; volume data is retained on the host.`)) return;
    startTransition(async () => {
      await deleteAppAction(app.id);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label htmlFor="branch" className="flex items-center gap-1">
            Default branch
            <HelpHint>
              The branch that <strong>Deploy latest</strong> and auto-deploy (when enabled) build from.
            </HelpHint>
          </Label>
          <Input id="branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="buildRoot" className="flex items-center gap-1">
            Build root
            <HelpHint>
              Directory inside the repo where the Dockerfile or Nixpacks build runs. <code className="font-mono">.</code> = repo root.
            </HelpHint>
          </Label>
          <Input id="buildRoot" value={buildRoot} onChange={(e) => setBuildRoot(e.target.value)} />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <Label htmlFor="autoDeploy" className="flex items-center gap-1">
              Auto-deploy on push
              <HelpHint>
                When on, every push to the default branch triggers a deploy. Off by default for predictability.
              </HelpHint>
            </Label>
          </div>
          <Switch id="autoDeploy" checked={autoDeploy} onCheckedChange={setAutoDeploy} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          {savedAt && <span className="text-xs text-muted-foreground">Saved {savedAt.toLocaleTimeString()}</span>}
        </div>
      </Card>

      <Card className="p-4 space-y-3 border-destructive/40">
        <div className="text-sm font-medium text-destructive flex items-center gap-1">
          Danger zone
          <HelpHint>
            Soft-deletes the app: the running container is stopped and removed. Docker volumes remain on the host so they can be reattached to a fresh app with the same slug later.
          </HelpHint>
        </div>
        <p className="text-sm text-muted-foreground">
          Soft-deletes the app. Container is stopped and removed; Docker volumes remain on the host
          so they can be reattached to a fresh app.
        </p>
        <Button variant="destructive" onClick={destroy} disabled={busy}>Delete app</Button>
      </Card>
    </div>
  );
}
