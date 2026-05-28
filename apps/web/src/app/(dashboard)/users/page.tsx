import { listUsers } from "@/actions/users";
import { listInvites } from "@/actions/invites";
import { UsersList } from "@/components/users/users-list";
import { InvitesPanel } from "@/components/users/invites-panel";
import { requireSession } from "@/lib/auth";

export default async function UsersPage() {
  const me = await requireSession();
  const [users, invites] = await Promise.all([listUsers(), listInvites()]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <InvitesPanel invites={invites} />
      <UsersList users={users} meId={me.id} />
    </div>
  );
}
