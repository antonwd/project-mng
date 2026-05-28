"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteEnvVarAction, type EnvVar } from "@/actions/env-vars";

export function EnvVarsTable({ appId, envVars }: { appId: string; envVars: EnvVar[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  if (envVars.length === 0) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">No env vars set.</Card>;
  }
  return (
    <Card className="divide-y">
      {envVars.map((v) => (
        <div key={v.key} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm truncate">{v.key}</div>
            <div className="text-xs text-muted-foreground truncate">
              {v.isSecret ? "********" : v.value}
            </div>
          </div>
          {v.isSecret && <Badge variant="secondary">secret</Badge>}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete ${v.key}?`)) return;
              startTransition(async () => {
                await deleteEnvVarAction(appId, v.key);
                router.refresh();
              });
            }}
          >
            Delete
          </Button>
        </div>
      ))}
    </Card>
  );
}
