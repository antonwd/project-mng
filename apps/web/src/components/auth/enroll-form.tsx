"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = { token: string; prefillEmail: string };

export function EnrollForm({ token, prefillEmail }: Props) {
  const [email, setEmail] = useState(prefillEmail);
  const [nickname, setNickname] = useState("My device");
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkBusy, setPkBusy] = useState(false);

  async function registerPasskey() {
    setPkError(null);
    setPkBusy(true);
    try {
      const startRes = await fetch("/api/proxy/auth/webauthn/registration/start", {
        method: "POST",
        body: JSON.stringify({ inviteToken: token }),
        headers: { "content-type": "application/json" },
      });
      if (!startRes.ok) throw new Error("could not start passkey registration");
      const startBody = (await startRes.json()) as { options: Parameters<typeof startRegistration>[0]["optionsJSON"] };
      const attestation = await startRegistration({ optionsJSON: startBody.options });
      const finishRes = await fetch("/api/proxy/auth/webauthn/registration/finish", {
        method: "POST",
        body: JSON.stringify({ response: attestation, email, nickname, inviteToken: token }),
        headers: { "content-type": "application/json" },
      });
      if (!finishRes.ok) throw new Error("passkey registration failed");
      location.href = "/apps";
    } catch (e) {
      setPkError(e instanceof Error ? e.message : String(e));
    } finally {
      setPkBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Welcome to projectMng</CardTitle></CardHeader>
      <CardContent>
        <Tabs defaultValue="passkey">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="passkey">Register a passkey</TabsTrigger>
            <TabsTrigger value="password">Password + TOTP</TabsTrigger>
          </TabsList>

          <TabsContent value="passkey" className="space-y-3 mt-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="nickname">Device name</Label>
              <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} required />
            </div>
            <Button onClick={registerPasskey} disabled={!email || pkBusy} className="w-full">
              {pkBusy ? "Waiting for passkey…" : "Register passkey"}
            </Button>
            {pkError && <p className="text-sm text-destructive">{pkError}</p>}
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <PasswordTotpEnroll token={token} initialEmail={email} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function PasswordTotpEnroll({ token, initialEmail }: { token: string; initialEmail: string }) {
  const [secret] = useState(() => generateTotpSecret());
  const [qr, setQr] = useState<string | null>(null);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const otpauth = `otpauth://totp/projectMng:${encodeURIComponent(email || "new")}?secret=${secret}&issuer=projectMng&algorithm=SHA1&digits=6&period=30`;
    QRCode.toDataURL(otpauth, { errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(null));
  }, [email, secret]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // 1. Register a placeholder user via the existing webauthn registration finish endpoint
      //    is overkill — instead, drive password+TOTP enrollment via a dedicated endpoint that
      //    consumes the invite then accepts password+TOTP. For v1 we use a simple two-call flow:
      //    /api/proxy/enroll/password-finish (the helper route we add on pm-api in a follow-up).
      const res = await fetch("/api/proxy/auth/password/enroll", {
        method: "POST",
        body: JSON.stringify({ inviteToken: token, email, password, totpSecret: secret, totpToken }),
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "enrollment failed");
      }
      location.href = "/apps";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="pw-email">Email</Label>
        <Input id="pw-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="pw-password">Password (min 8 chars)</Label>
        <Input id="pw-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </div>
      <div className="rounded-md border p-3 space-y-2">
        <div className="text-sm font-medium">Scan with your authenticator</div>
        {qr ? <img src={qr} alt="TOTP QR" className="size-44 mx-auto" /> : <div className="text-xs text-muted-foreground">Generating QR…</div>}
        <div className="text-xs text-muted-foreground font-mono break-all">{secret}</div>
      </div>
      <div>
        <Label htmlFor="totp-token">6-digit code</Label>
        <Input id="totp-token" inputMode="numeric" pattern="\d{6}" maxLength={6} value={totpToken} onChange={(e) => setTotpToken(e.target.value)} required />
      </div>
      <Button onClick={submit} disabled={busy || !email || password.length < 8 || totpToken.length !== 6} className="w-full">
        {busy ? "Submitting…" : "Complete setup"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// RFC 4648 base32 alphabet
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  // Convert bytes to base32 (no padding, length=32 for 20 bytes)
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
