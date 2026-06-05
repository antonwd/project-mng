"use client";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { Globe } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromThrowing } from "@/lib/action-result";
import { checkDnsAction, removeDomainAction, type Domain } from "@/actions/domains";
import { formatDistanceToNow } from "date-fns";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DomainsList({ appId, domains }: { appId: string; domains: Domain[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checking, startCheckTransition] = useTransition();

  const { items, remove, pending } = useOptimisticAction<Domain, string>({
    initial: domains,
    keyFn: (d) => d.id,
    addAction: () => Promise.resolve({ ok: true as const }),
    removeAction: (id) => fromThrowing(() => removeDomainAction(id)),
    toastMessages: {
      addSuccess: "Domain attached",
      addErrorPrefix: "Attach failed",
      removeSuccess: "Domain removed",
      removeErrorPrefix: "Remove failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={Globe} title="No domains attached">
        Add a hostname above, then point its DNS A record at this VPS.
      </EmptyState>
    );
  }

  function variantFor(status: string) {
    if (status === "active") return "default" as const;
    if (status === "failed") return "destructive" as const;
    return "secondary" as const;
  }

  return (
    <Card className="divide-y">
      {items.map((d) => {
        const daysLeft = d.certExpiresAt
          ? Math.max(0, Math.round((new Date(d.certExpiresAt).getTime() - Date.now()) / 86_400_000))
          : null;
        return (
          <div key={d.id} className="p-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={variantFor(d.certStatus)}>{d.certStatus}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checking || pending}
                  onClick={() => {
                    setErrors((p) => ({ ...p, [d.id]: "" }));
                    startCheckTransition(async () => {
                      try {
                        const res = await checkDnsAction(d.id);
                        if (res.status === "pending_dns") {
                          setErrors((p) => ({ ...p, [d.id]: `DNS not yet pointing to this host (resolved: ${res.resolved.join(", ") || "nothing"})` }));
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
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Remove ${d.hostname}?`)) return;
                    remove(d.id);
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
            {errors[d.id] && <p className="text-xs text-destructive">{errors[d.id]}</p>}
          </div>
        );
      })}
    </Card>
  );
}
