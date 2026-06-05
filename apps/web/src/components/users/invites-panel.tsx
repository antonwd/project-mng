"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/common/copy-button";
import { HelpHint } from "@/components/common/help-hint";
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

  const outstanding = invites.filter((i) => !i.consumedAt && new Date(i.expiresAt) > new Date());

  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="invite-email" className="flex items-center gap-1">
            Invite email (optional)
            <HelpHint>
              Pre-fills the invitee&apos;s email on the enrollment form. The invite URL is the only thing that grants access — the email is for convenience.
            </HelpHint>
          </Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new-admin@example.com" />
        </div>
        <Button onClick={create} disabled={busy}>{busy ? "Creating…" : "Create invite"}</Button>
      </div>
      {createdUrl && (
        <div className="rounded-md border p-3 space-y-2 bg-muted/40">
          <div className="text-sm">Share this one-time URL with the invitee (24h):</div>
          <CopyButton value={createdUrl} label="invite URL" variant="block" />
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
