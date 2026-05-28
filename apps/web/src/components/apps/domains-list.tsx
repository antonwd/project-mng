"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkDnsAction, removeDomainAction, type Domain } from "@/actions/domains";
import { formatDistanceToNow } from "date-fns";

export function DomainsList({ domains }: { domains: Domain[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (domains.length === 0) {
    return <Card className="p-6 text-center text-muted-foreground text-sm">No domains attached.</Card>;
  }

  function variantFor(status: string) {
    if (status === "active") return "default" as const;
    if (status === "failed") return "destructive" as const;
    return "secondary" as const;
  }

  return (
    <Card className="divide-y">
      {domains.map((d) => {
        const daysLeft = d.certExpiresAt
          ? Math.max(0, Math.round((new Date(d.certExpiresAt).getTime() - Date.now()) / 86_400_000))
          : null;
        return (
          <div key={d.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{d.hostname}</div>
                <div className="text-xs text-muted-foreground">
                  {d.certStatus === "active" && daysLeft !== null && `cert expires in ${daysLeft}d`}
                  {d.certStatus === "pending_dns" && "waiting for DNS A record"}
                  {d.certStatus === "pending_cert" && "issuing certificate…"}
                  {d.certStatus === "failed" && (d.lastError ?? "issuance failed")}
                  {d.certIssuedAt && d.certStatus === "active" && ` · issued ${formatDistanceToNow(new Date(d.certIssuedAt), { addSuffix: true })}`}
                </div>
              </div>
              <Badge variant={variantFor(d.certStatus)}>{d.certStatus}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setErrors((p) => ({ ...p, [d.id]: "" }));
                  startTransition(async () => {
                    try {
                      const res = await checkDnsAction(d.id);
                      if (res.status === "pending_dns") {
                        setErrors((p) => ({ ...p, [d.id]: `DNS not yet pointing to this host (resolved: ${res.resolved.join(", ") || "nothing"})` }));
                      } else {
                        router.refresh();
                      }
                    } catch (e) {
                      setErrors((p) => ({ ...p, [d.id]: e instanceof Error ? e.message : String(e) }));
                    }
                  });
                }}
              >
                Check DNS
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Remove ${d.hostname}?`)) return;
                  startTransition(async () => {
                    await removeDomainAction(d.id);
                    router.refresh();
                  });
                }}
              >
                Remove
              </Button>
            </div>
            {errors[d.id] && <p className="text-xs text-destructive">{errors[d.id]}</p>}
          </div>
        );
      })}
    </Card>
  );
}
