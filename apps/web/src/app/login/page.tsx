import { LoginForm } from "@/components/auth/login-form";
import { maybeSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const me = await maybeSession();
  if (me) redirect("/apps");
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <LoginForm />
    </main>
  );
}
