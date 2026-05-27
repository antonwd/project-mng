import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    MASTER_KEY_PATH: z.string().min(1),
    HELPER_SOCKET_PATH: z.string().min(1),
    DOCKER_PROXY_URL: z.string().url(),
    GITHUB_APP_ID: z.string().regex(/^\d+$/),
    GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(20),
    PUBLIC_BASE_URL: z.string().url(),
    WEBAUTHN_RP_ID: z.string().min(1),
    WEBAUTHN_RP_NAME: z.string().min(1),
    COOKIE_SECRET: z.string().min(32),
    INTERNAL_PORT_MIN: z.string().regex(/^\d+$/),
    INTERNAL_PORT_MAX: z.string().regex(/^\d+$/),
    NGINX_MANAGED_DIR: z.string().min(1),
    ACME_EMAIL: z.string().email(),
    HTTP_PORT: z.string().regex(/^\d+$/).default("3000"),
  })
  .superRefine((env, ctx) => {
    const min = Number(env.INTERNAL_PORT_MIN);
    const max = Number(env.INTERNAL_PORT_MAX);
    if (min >= max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_PORT_MIN"],
        message: "INTERNAL_PORT_MIN must be < INTERNAL_PORT_MAX",
      });
    }
  });

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  redisUrl: string;
  masterKeyPath: string;
  helperSocketPath: string;
  dockerProxyUrl: string;
  githubAppId: string;
  githubAppPrivateKeyPath: string;
  githubWebhookSecret: string;
  publicBaseUrl: string;
  webauthnRpId: string;
  webauthnRpName: string;
  cookieSecret: string;
  internalPortMin: number;
  internalPortMax: number;
  nginxManagedDir: string;
  acmeEmail: string;
  httpPort: number;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid config: ${summary}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    masterKeyPath: e.MASTER_KEY_PATH,
    helperSocketPath: e.HELPER_SOCKET_PATH,
    dockerProxyUrl: e.DOCKER_PROXY_URL,
    githubAppId: e.GITHUB_APP_ID,
    githubAppPrivateKeyPath: e.GITHUB_APP_PRIVATE_KEY_PATH,
    githubWebhookSecret: e.GITHUB_WEBHOOK_SECRET,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    webauthnRpId: e.WEBAUTHN_RP_ID,
    webauthnRpName: e.WEBAUTHN_RP_NAME,
    cookieSecret: e.COOKIE_SECRET,
    internalPortMin: Number(e.INTERNAL_PORT_MIN),
    internalPortMax: Number(e.INTERNAL_PORT_MAX),
    nginxManagedDir: e.NGINX_MANAGED_DIR,
    acmeEmail: e.ACME_EMAIL,
    httpPort: Number(e.HTTP_PORT),
  };
}
