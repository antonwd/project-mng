"use client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { Users as UsersIcon } from "lucide-react";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { fromThrowing } from "@/lib/action-result";
import { deleteUserAction, type User } from "@/actions/users";
import { formatDistanceToNow } from "date-fns";

export function UsersList({ users, meId }: { users: User[]; meId: string }) {
  const { items, remove, pending } = useOptimisticAction<User, string>({
    initial: users,
    keyFn: (u) => u.id,
    addAction: () => Promise.resolve({ ok: true as const }),
    removeAction: (id) => fromThrowing(() => deleteUserAction(id)),
    toastMessages: {
      addSuccess: "User added",
      addErrorPrefix: "Add failed",
      removeSuccess: "User deleted",
      removeErrorPrefix: "Delete failed",
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState icon={UsersIcon} title="No users yet">
        Create an invite above and share the URL with the next admin.
      </EmptyState>
    );
  }

  return (
    <Card className="divide-y">
      {items.map((u) => (
        <div key={u.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {u.email}
              {u.id === meId && <Badge variant="secondary" className="ml-2">you</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {u.totpEnabled ? "password + TOTP" : "passkey only"} · joined {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
            </div>
          </div>
          {u.id !== meId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Permanently delete ${u.email}? Their sessions and credentials cascade away.`)) return;
                remove(u.id);
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
