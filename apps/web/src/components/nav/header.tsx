import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";
import { MobileNav } from "@/components/nav/mobile-nav";
import { LogOut } from "lucide-react";

export function Header({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <MobileNav />
        <span className="font-semibold text-base md:hidden">projectMng</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="text-sm text-muted-foreground truncate max-w-[12ch] sm:max-w-none">{email}</div>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon-sm" type="submit" aria-label="Sign out" className="sm:hidden">
            <LogOut />
          </Button>
          <Button variant="ghost" size="sm" type="submit" className="hidden sm:inline-flex">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
