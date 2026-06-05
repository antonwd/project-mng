"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { KeyRound } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromMaybeError, fromThrowing } from "@/lib/action-result";
import { upsertEnvVarAction, deleteEnvVarAction, type EnvVar } from "@/actions/env-vars";

export function EnvVarsTable({ appId, envVars }: { appId: string; envVars: EnvVar[] }) {
  const { items, remove, pending } = useOptimisticAction<EnvVar, string>({
    initial: envVars,
    keyFn: (v) => v.key,
    addAction: (v) =>
      fromMaybeError(async () => {
        const fd = new FormData();
        fd.set("key", v.key);
        fd.set("value", v.value ?? "");
        fd.set("isSecret", v.isSecret ? "true" : "false");
        return upsertEnvVarAction(appId, fd);
      }),
    removeAction: (key) => fromThrowing(() => deleteEnvVarAction(appId, key)),
    toastMessages: {
      addSuccess: "Env var saved",
      addErrorPrefix: "Save failed",
      removeSuccess: "Env var deleted",
      removeErrorPrefix: "Delete failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={KeyRound} title="No env vars set">
        Add a variable above. Changes take effect on the next deploy.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y">
      {items.map((v) => (
        <div key={v.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm truncate">{v.key}</div>
            <div className="text-xs text-muted-foreground truncate">
              {v.isSecret ? "********" : v.value}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {v.isSecret && <Badge variant="secondary">secret</Badge>}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Delete ${v.key}?`)) return;
                remove(v.key);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
