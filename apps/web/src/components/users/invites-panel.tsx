"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInviteAction, type Invite } from "@/actions/invites";
import { formatDistanceToNow } from "date-fns";

export function InvitesPanel({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function create() {
    setError(null);
    setCreatedUrl(null);
    startTransition(async () => {
      const res = await createInviteAction(email || undefined);
      if (res.error) setError(res.error);
      else if (res.url) {
        setCreatedUrl(res.url);
        setEmail("");
        router.refresh();
      }
    });
  }

  function copy() {
    if (createdUrl) navigator.clipboard.writeText(createdUrl).catch(() => undefined);
  }

  const outstanding = invites.filter((i) => !i.consumedAt && new Date(i.expiresAt) > new Date());

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="invite-email">Invite email (optional, used to prefill the form)</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new-admin@example.com" />
        </div>
        <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create invite"}</Button>
      </div>
      {createdUrl && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/40">
          <div className="text-sm">Share this one-time URL with the invitee (24h):</div>
          <div className="flex items-center gap-2">
            <code className="text-xs break-all flex-1">{createdUrl}</code>
            <Button variant="outline" size="sm" onClick={copy}>Copy</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {outstanding.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {outstanding.length} outstanding invite{outstanding.length === 1 ? "" : "s"} — first expires {formatDistanceToNow(new Date(outstanding[0]!.expiresAt), { addSuffix: true })}
        </div>
      )}
    </Card>
  );
}
