import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users, webauthnCredentials } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { verifyTotp } from "../../auth/totp.js";
import { SessionManager } from "../../auth/sessions.js";
import { RateLimiter } from "../../auth/rate-limit.js";
import { AuditLog } from "../../auth/audit.js";
import { WebAuthnService } from "../../auth/webauthn.js";
import { InviteService } from "../../domain/invites.js";
import { encryptSecret, decryptSecret } from "../../crypto/secrets.js";
import { BadRequest, Unauthorized, HTTPError } from "../../lib/errors.js";

export type AuthDeps = {
  db: Database;
  sessions: SessionManager;
  rateLimit: RateLimiter;
  audit: AuditLog;
  masterKey: Uint8Array;
  webauthn: WebAuthnService;
  invites: InviteService;
};

const PasswordLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/),
});

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps) {
  app.post("/api/auth/password/login", async (req, reply) => {
    const body = PasswordLoginBody.parse(req.body);
    const ip = req.ip;
    const { allowed } = await deps.rateLimit.consume(`login:${ip}`, 5, 15 * 60);
    if (!allowed) {
      await deps.audit.write({ actorIp: ip, action: "login.rate_limited", metadata: { email: body.email } });
      throw new HTTPError(429, "rate_limited", "too many attempts");
    }
    const [user] = await deps.db.select().from(users).where(eq(users.email, body.email));
    if (!user || !user.passwordHash || !user.totpEnabled || !user.totpSecretEnc) {
      await deps.audit.write({ actorIp: ip, action: "login.failure", metadata: { email: body.email, reason: "no_credentials" } });
      throw Unauthorized();
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.failure", metadata: { reason: "bad_password" } });
      throw Unauthorized();
    }
    const blob = Buffer.from(user.totpSecretEnc);
    const nonce = blob.subarray(0, 12);
    const ct = blob.subarray(12);
    const totpSecret = decryptSecret(deps.masterKey, ct, nonce);
    if (!verifyTotp(totpSecret, body.totp)) {
      await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.failure", metadata: { reason: "bad_totp" } });
      throw Unauthorized();
    }
    const { sessionId } = await deps.sessions.create({ userId: user.id, ip, userAgent: req.headers["user-agent"] });
    app.setSessionCookie(reply, sessionId);
    await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.success", metadata: { method: "password+totp" } });
    return { ok: true };
  });

  app.post("/api/auth/logout", { preHandler: app.requireAuth }, async (req, reply) => {
    if (req.session) {
      await deps.sessions.revoke(req.session.sessionId);
      await deps.audit.write({ actorIp: req.ip, actorUserId: req.session.userId, action: "logout" });
    }
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  const PasswordSetupBody = z.object({
    password: z.string().min(8),
    totpSecret: z.string().min(16),
    totpToken: z.string().regex(/^\d{6}$/),
  });

  app.post("/api/auth/password/setup", { preHandler: app.requireAuth }, async (req) => {
    const body = PasswordSetupBody.parse(req.body);
    if (!verifyTotp(body.totpSecret, body.totpToken)) throw BadRequest("invalid totp token");
    const enc = encryptSecret(deps.masterKey, body.totpSecret);
    const blob = new Uint8Array(enc.nonce.length + enc.ciphertext.length);
    blob.set(enc.nonce, 0);
    blob.set(enc.ciphertext, enc.nonce.length);
    const hash = await hashPassword(body.password);
    await deps.db.update(users)
      .set({ passwordHash: hash, totpSecretEnc: blob, totpEnabled: true, updatedAt: new Date() })
      .where(eq(users.id, req.session!.userId));
    await deps.audit.write({ actorIp: req.ip, actorUserId: req.session!.userId, action: "password.setup" });
    return { ok: true };
  });

  const PasswordEnrollBody = z.object({
    inviteToken: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    totpSecret: z.string().min(16),
    totpToken: z.string().regex(/^\d{6}$/),
  });

  app.post("/api/auth/password/enroll", async (req, reply) => {
    const body = PasswordEnrollBody.parse(req.body);
    if (!verifyTotp(body.totpSecret, body.totpToken)) throw BadRequest("invalid totp token");
    const { userId } = await deps.invites.consume(body.inviteToken, body.email);
    const enc = encryptSecret(deps.masterKey, body.totpSecret);
    const blob = new Uint8Array(enc.nonce.length + enc.ciphertext.length);
    blob.set(enc.nonce, 0);
    blob.set(enc.ciphertext, enc.nonce.length);
    const hash = await hashPassword(body.password);
    await deps.db.update(users)
      .set({ passwordHash: hash, totpSecretEnc: blob, totpEnabled: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
    const { sessionId } = await deps.sessions.create({ userId, ip: req.ip, userAgent: req.headers["user-agent"] });
    app.setSessionCookie(reply, sessionId);
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: userId,
      action: "user.enroll",
      metadata: { method: "password+totp" },
    });
    return { ok: true };
  });

  const WEBAUTHN_REG_COOKIE = "pm_webauthn_reg";
  const WEBAUTHN_LOGIN_COOKIE = "pm_webauthn_login";
  const challengeCookieOpts = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 300 };

  const RegStartBody = z.object({ inviteToken: z.string().optional() }).default({});

  app.post("/api/auth/webauthn/registration/start", async (req, reply) => {
    const body = RegStartBody.parse(req.body ?? {});
    const tempUserId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const { options, challenge } = await deps.webauthn.startRegistration({ userId: tempUserId, userName: "new-user" });
    reply.setCookie(WEBAUTHN_REG_COOKIE, JSON.stringify({ challenge, inviteToken: body.inviteToken ?? null }), challengeCookieOpts);
    return { options };
  });

  const RegFinishBody = z.object({
    response: z.any(),
    email: z.string().email(),
    nickname: z.string().min(1).max(64),
    inviteToken: z.string().optional(),
  });

  app.post("/api/auth/webauthn/registration/finish", async (req, reply) => {
    const body = RegFinishBody.parse(req.body);
    const cookie = req.cookies[WEBAUTHN_REG_COOKIE];
    if (!cookie) throw BadRequest("missing challenge cookie");
    const { challenge, inviteToken } = JSON.parse(cookie) as { challenge: string; inviteToken: string | null };
    const inviteFromBody = body.inviteToken ?? inviteToken;
    let userId: string;
    if (inviteFromBody) {
      const consumed = await deps.invites.consume(inviteFromBody, body.email);
      userId = consumed.userId;
    } else {
      const [existing] = await deps.db.select().from(users).where(eq(users.email, body.email));
      if (existing) throw BadRequest("email already registered");
      const createdRows = await deps.db.insert(users).values({ email: body.email }).returning();
      const created = createdRows[0];
      if (!created) throw new Error("failed to create user");
      userId = created.id;
    }
    const reg = await deps.webauthn.finishRegistration({ response: body.response, expectedChallenge: challenge });
    await deps.db.insert(webauthnCredentials).values({
      userId,
      credentialId: reg.credentialId,
      publicKey: reg.publicKey,
      signCount: reg.signCount,
      transports: reg.transports,
      nickname: body.nickname,
    });
    reply.clearCookie(WEBAUTHN_REG_COOKIE, { path: "/" });
    const { sessionId } = await deps.sessions.create({ userId, ip: req.ip, userAgent: req.headers["user-agent"] });
    app.setSessionCookie(reply, sessionId);
    await deps.audit.write({ actorIp: req.ip, actorUserId: userId, action: "webauthn.register", metadata: { nickname: body.nickname } });
    return { ok: true };
  });

  const LoginStartBody = z.object({ email: z.string().email() });

  app.post("/api/auth/webauthn/login/start", async (req, reply) => {
    const body = LoginStartBody.parse(req.body);
    const [user] = await deps.db.select().from(users).where(eq(users.email, body.email));
    if (!user) throw Unauthorized();
    const creds = await deps.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, user.id));
    const { options, challenge } = await deps.webauthn.startAuthentication({
      allowCredentialIds: creds.map((c) => c.credentialId),
    });
    reply.setCookie(WEBAUTHN_LOGIN_COOKIE, JSON.stringify({ challenge, userId: user.id }), challengeCookieOpts);
    return { options };
  });

  const LoginFinishBody = z.object({ response: z.any() });

  app.post("/api/auth/webauthn/login/finish", async (req, reply) => {
    const body = LoginFinishBody.parse(req.body);
    const cookie = req.cookies[WEBAUTHN_LOGIN_COOKIE];
    if (!cookie) throw Unauthorized("missing challenge cookie");
    const { challenge, userId } = JSON.parse(cookie) as { challenge: string; userId: string };
    const credentialIdRaw = body.response?.id as string;
    if (!credentialIdRaw) throw BadRequest("missing credential id");
    const credentialId = new Uint8Array(Buffer.from(credentialIdRaw, "base64url"));
    const [cred] = await deps.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, credentialId));
    if (!cred || cred.userId !== userId) throw Unauthorized();
    const { newSignCount } = await deps.webauthn.finishAuthentication({
      response: body.response,
      expectedChallenge: challenge,
      storedPublicKey: cred.publicKey,
      storedSignCount: cred.signCount,
    });
    await deps.db.update(webauthnCredentials)
      .set({ signCount: newSignCount, lastUsedAt: new Date() })
      .where(eq(webauthnCredentials.id, cred.id));
    reply.clearCookie(WEBAUTHN_LOGIN_COOKIE, { path: "/" });
    const { sessionId } = await deps.sessions.create({ userId, ip: req.ip, userAgent: req.headers["user-agent"] });
    app.setSessionCookie(reply, sessionId);
    await deps.audit.write({ actorIp: req.ip, actorUserId: userId, action: "login.success", metadata: { method: "webauthn" } });
    return { ok: true };
  });
}
