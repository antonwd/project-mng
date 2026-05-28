"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { startRegistration } from "@simplewebauthn/browser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordSetupAction, type ActionState } from "@/actions/auth";
import { removeCredentialAction, type Credential } from "@/actions/users";
import type { Me } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

export function AccountPanel({ me, credentials }: { me: Me; credentials: Credential[] }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Identity</div>
        <div className="text-sm text-muted-foreground">{me.email}</div>
      </Card>

      <PasskeysSection credentials={credentials} onChange={() => router.refresh()} />
      <PasswordTotpSection enabled={me.totpEnabled} />
    </div>
  );
}

function PasskeysSection({ credentials, onChange }: { credentials: Credential[]; onChange: () => void }) {
  const [nickname, setNickname] = useState("My device");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function addPasskey() {
    setError(null);
    try {
      const start = await fetch("/api/proxy/auth/webauthn/registration/start", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
      if (!start.ok) throw new Error("could not start passkey registration");
      const startBody = (await start.json()) as { options: Parameters<typeof startRegistration>[0]["optionsJSON"] };
      const attestation = await startRegistration({ optionsJSON: startBody.options });
      const finish = await fetch("/api/proxy/auth/webauthn/registration/finish", {
        method: "POST",
        body: JSON.stringify({ response: attestation, email: "self", nickname }),
        headers: { "content-type": "application/json" },
      });
      if (!finish.ok) throw new Error("passkey registration failed");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Passkeys</div>
        <Button variant="outline" size="sm" onClick={addPasskey}>Add passkey</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <Label htmlFor="nickname">Device name (for the next passkey)</Label>
          <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
      </div>
      {credentials.length === 0 ? (
        <div className="text-sm text-muted-foreground">No passkeys registered.</div>
      ) : (
        <div className="divide-y">
          {credentials.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.nickname}</div>
                <div className="text-xs text-muted-foreground">
                  added {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  {c.lastUsedAt && ` · last used ${formatDistanceToNow(new Date(c.lastUsedAt), { addSuffix: true })}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (!confirm(`Remove ${c.nickname}? You'll lose this device's passkey.`)) return;
                  startTransition(async () => {
                    await removeCredentialAction(c.id);
                    onChange();
                  });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function genSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let bits = 0, value = 0, out = "";
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

function PasswordTotpSection({ enabled }: { enabled: boolean }) {
  const [secret] = useState(() => genSecret());
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(null);
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    if (enabled) return;
    QRCode.toDataURL(`otpauth://totp/projectMng?secret=${secret}&issuer=projectMng&algorithm=SHA1&digits=6&period=30`).then(setQr).catch(() => setQr(null));
  }, [enabled, secret]);

  if (enabled) {
    return (
      <Card className="p-4">
        <div className="text-sm font-medium">Password + TOTP</div>
        <div className="text-sm text-muted-foreground">Enabled. Use your authenticator app at login.</div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Set up password + TOTP</div>
      <form
        action={(fd) => {
          fd.set("totpSecret", secret);
          startTransition(async () => {
            const res = await passwordSetupAction(state, fd);
            setState(res);
          });
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="pw">Password (min 8 chars)</Label>
          <Input id="pw" name="password" type="password" minLength={8} required />
        </div>
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm">Scan with your authenticator</div>
          {qr ? <img src={qr} alt="TOTP QR" className="size-44 mx-auto" /> : <div className="text-xs text-muted-foreground">Generating QR…</div>}
          <div className="text-xs text-muted-foreground font-mono break-all">{secret}</div>
        </div>
        <div>
          <Label htmlFor="totpToken">6-digit code</Label>
          <Input id="totpToken" name="totpToken" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Enable"}</Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>
    </Card>
  );
}
