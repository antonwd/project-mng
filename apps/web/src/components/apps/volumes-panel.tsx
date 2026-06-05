"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpHint } from "@/components/common/help-hint";
import { EmptyState } from "@/components/common/states";
import { HardDrive } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromMaybeError, fromThrowing } from "@/lib/action-result";
import { addVolumeAction, removeVolumeAction, type Volume } from "@/actions/volumes";

export function VolumesPanel({ appId, volumes }: { appId: string; volumes: Volume[] }) {
  const [mountPath, setMountPath] = useState("");

  const { items, add, remove, pending } = useOptimisticAction<Volume, string>({
    initial: volumes,
    keyFn: (v) => v.mountPath,
    addAction: (v) => fromMaybeError(() => addVolumeAction(appId, v.mountPath)),
    removeAction: (mp) => fromThrowing(() => removeVolumeAction(appId, mp)),
    toastMessages: {
      addSuccess: "Volume added",
      addErrorPrefix: "Add failed",
      removeSuccess: "Volume removed",
      removeErrorPrefix: "Remove failed",
    },
  });

  function submit() {
    if (!mountPath) return;
    add({ id: "pending", appId, mountPath, dockerVolumeName: "pending" } as Volume);
    setMountPath("");
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="mount" className="flex items-center gap-1">
            Mount path
            <HelpHint>
              Absolute path inside the container. A Docker named volume is created and mounted here. Data persists across container restarts.
            </HelpHint>
          </Label>
          <Input id="mount" value={mountPath} onChange={(e) => setMountPath(e.target.value)} placeholder="/data" />
        </div>
        <Button onClick={submit} disabled={pending || !mountPath}>{pending ? "Adding…" : "Add volume"}</Button>
      </Card>
      {items.length === 0 ? (
        <EmptyState icon={HardDrive} title="No volumes attached">
          Add a mount path above to persist data across container restarts.
        </EmptyState>
      ) : (
        <Card className="divide-y">
          {items.map((v) => (
            <div key={v.mountPath} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{v.mountPath}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{v.dockerVolumeName}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Remove ${v.mountPath}? Volume data is not deleted from the host.`)) return;
                  remove(v.mountPath);
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
