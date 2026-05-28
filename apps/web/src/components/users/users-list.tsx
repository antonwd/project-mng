"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteUserAction, type User } from "@/actions/users";
import { formatDistanceToNow } from "date-fns";

export function UsersList({ users, meId }: { users: User[]; meId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <Card className="divide-y">
      {users.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{u.email} {u.id === meId && <Badge variant="secondary">you</Badge>}</div>
            <div className="text-xs text-muted-foreground">
              {u.totpEnabled ? "password + TOTP" : "passkey only"} · joined {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
            </div>
          </div>
          {u.id !== meId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Permanently delete ${u.email}? Their sessions and credentials cascade away.`)) return;
                startTransition(async () => {
                  await deleteUserAction(u.id);
                  router.refresh();
                });
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
