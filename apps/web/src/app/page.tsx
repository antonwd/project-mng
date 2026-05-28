import { redirect } from "next/navigation";
import { maybeSession } from "@/lib/auth";

export default async function Index() {
  const me = await maybeSession();
  redirect(me ? "/apps" : "/login");
}
