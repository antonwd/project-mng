"use client";
import { useActionState, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { passwordLoginAction, type ActionState } from "@/actions/auth";

export function LoginForm() {
  const [pwState, pwAction] = useActionState<ActionState, FormData>(passwordLoginAction, null);
  const [pkEmail, setPkEmail] = useState("");
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function startPasskey() {
    setPkError(null);
    setPkBusy(true);
    try {
      const startRes = await fetch("/api/proxy/auth/webauthn/login/start", {
        method: "POST",
        body: JSON.stringify({ email: pkEmail }),
        headers: { "content-type": "application/json" },
      });
      if (!startRes.ok) throw new Error("could not start passkey login");
      const startBody = (await startRes.json()) as { options: Parameters<typeof startAuthentication>[0]["optionsJSON"] };
      const assertion = await startAuthentication({ optionsJSON: startBody.options });
      const finishRes = await fetch("/api/proxy/auth/webauthn/login/finish", {
        method: "POST",
        body: JSON.stringify({ response: assertion }),
        headers: { "content-type": "application/json" },
      });
      if (!finishRes.ok) throw new Error("passkey login failed");
      location.href = "/apps";
    } catch (e) {
      setPkError(e instanceof Error ? e.message : String(e));
    } finally {
      setPkBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Sign in to projectMng</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="passkey">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="passkey">Passkey</TabsTrigger>
            <TabsTrigger value="password">Password + TOTP</TabsTrigger>
          </TabsList>

          <TabsContent value="passkey" className="space-y-3 mt-4">
            <Label htmlFor="pk-email">Email</Label>
            <Input id="pk-email" type="email" value={pkEmail} onChange={(e) => setPkEmail(e.target.value)} />
            <Button onClick={startPasskey} disabled={!pkEmail || pkBusy} className="w-full">
              {pkBusy ? "Waiting for passkey…" : "Continue"}
            </Button>
            {pkError && <p className="text-sm text-destructive">{pkError}</p>}
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <form action={pwAction} className="space-y-3">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <div>
                <Label htmlFor="totp">TOTP</Label>
                <Input id="totp" name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
              {pwState?.error && <p className="text-sm text-destructive">{pwState.error}</p>}
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
