"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { upsertEnvVarAction } from "@/actions/env-vars";

export function EnvVarForm({ appId }: { appId: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(true);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("key", key);
      fd.set("value", value);
      fd.set("isSecret", isSecret ? "true" : "false");
      const res = await upsertEnvVarAction(appId, fd);
      if (res.error) setError(res.error);
      else {
        setKey("");
        setValue("");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <div>
          <Label htmlFor="env-key">Key</Label>
          <Input id="env-key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="DATABASE_URL" />
        </div>
        <div>
          <Label htmlFor="env-value">Value</Label>
          <Input id="env-value" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button onClick={submit} disabled={busy || !key || !value}>{busy ? "Saving…" : "Save"}</Button>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch id="env-secret" checked={isSecret} onCheckedChange={setIsSecret} />
        <Label htmlFor="env-secret" className="cursor-pointer">Treat as secret (mask in UI, runtime-only decrypt)</Label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
