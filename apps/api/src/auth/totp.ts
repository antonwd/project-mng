import { authenticator } from "otplib";

authenticator.options = { window: 1, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function otpauthUri(account: string, secret: string, issuer: string): string {
  return authenticator.keyuri(account, issuer, secret);
}
