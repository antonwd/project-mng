import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";

export function Header({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="text-sm text-muted-foreground">{email}</div>
      <form action={logoutAction}>
        <Button variant="ghost" size="sm" type="submit">Sign out</Button>
      </form>
    </header>
  );
}
