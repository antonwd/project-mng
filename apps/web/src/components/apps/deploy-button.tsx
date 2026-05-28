"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueDeployAction } from "@/actions/deployments";

export function DeployButton({ appId }: { appId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <Button
      disabled={busy}
      onClick={() => {
        startTransition(async () => {
          const res = await enqueueDeployAction(appId);
          if (!res.error) router.refresh();
        });
      }}
    >
      {busy ? "Queuing…" : "Deploy latest"}
    </Button>
  );
}
