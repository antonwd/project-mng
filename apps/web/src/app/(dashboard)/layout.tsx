import type { ReactNode } from "react";
import { Sidebar } from "@/components/nav/sidebar";
import { Header } from "@/components/nav/header";
import { requireSession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const me = await requireSession();
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen">
      <Sidebar />
      <div className="flex flex-col">
        <Header email={me.email} />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
