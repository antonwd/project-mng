"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDomainAction } from "@/actions/domains";

export function DomainAttachForm({ appId }: { appId: string }) {
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await addDomainAction(appId, hostname);
      if (res.error) setError(res.error);
      else {
        setHostname("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="hostname">Hostname</Label>
          <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value.toLowerCase())} placeholder="app.example.com" />
        </div>
        <Button onClick={submit} disabled={busy || !hostname}>{busy ? "Attaching…" : "Attach domain"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        After attaching, point the hostname's A record at your VPS, then click "Check DNS" on the row to advance the cert state.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
