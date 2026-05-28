import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { EnrollForm } from "@/components/auth/enroll-form";

type Params = Promise<{ token: string }>;

export default async function EnrollPage({ params }: { params: Params }) {
  const { token } = await params;
  const res = await fetch(`${env.PM_API_URL}/api/enroll/${token}`, { cache: "no-store" });
  if (!res.ok) redirect("/login?reason=expired-invite");
  const body = (await res.json()) as { valid: boolean; email: string | null; expiresAt: string };
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <EnrollForm token={token} prefillEmail={body.email ?? ""} />
    </main>
  );
}
