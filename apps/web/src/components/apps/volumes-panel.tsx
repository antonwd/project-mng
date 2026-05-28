"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addVolumeAction, removeVolumeAction, type Volume } from "@/actions/volumes";

export function VolumesPanel({ appId, volumes }: { appId: string; volumes: Volume[] }) {
  const router = useRouter();
  const [mountPath, setMountPath] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await addVolumeAction(appId, mountPath);
      if (res.error) setError(res.error);
      else {
        setMountPath("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="mount">Mount path</Label>
          <Input id="mount" value={mountPath} onChange={(e) => setMountPath(e.target.value)} placeholder="/data" />
        </div>
        <Button onClick={add} disabled={busy || !mountPath}>{busy ? "Adding…" : "Add volume"}</Button>
      </Card>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {volumes.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">No volumes attached.</Card>
      ) : (
        <Card className="divide-y">
          {volumes.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-mono text-sm">{v.mountPath}</div>
                <div className="text-xs text-muted-foreground font-mono">{v.dockerVolumeName}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Remove ${v.mountPath}? Volume data is not deleted from the host.`)) return;
                  startTransition(async () => {
                    await removeVolumeAction(appId, v.mountPath);
                    router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
