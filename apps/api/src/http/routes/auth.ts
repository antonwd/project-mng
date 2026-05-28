import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { verifyPassword } from "../../auth/password.js";
import { verifyTotp } from "../../auth/totp.js";
import { SessionManager } from "../../auth/sessions.js";
import { RateLimiter } from "../../auth/rate-limit.js";
import { AuditLog } from "../../auth/audit.js";
import { WebAuthnService } from "../../auth/webauthn.js";
import { InviteService } from "../../domain/invites.js";
import { decryptSecret } from "../../crypto/secrets.js";
import { Unauthorized, HTTPError } from "../../lib/errors.js";

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
}
