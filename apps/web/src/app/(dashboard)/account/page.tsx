import { requireSession } from "@/lib/auth";
import { listCredentials } from "@/actions/users";
import { AccountPanel } from "@/components/users/account-panel";

export default async function AccountPage() {
  const me = await requireSession();
  const credentials = await listCredentials();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Account</h1>
      <AccountPanel me={me} credentials={credentials} />
    </div>
  );
}
