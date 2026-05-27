import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  bigserial,
  timestamp,
  jsonb,
  inet,
  customType,
  unique,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// citext is not built-in; declare a tiny custom type that maps to it.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array) {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer) {
    return new Uint8Array(value);
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash"),
  totpSecretEnc: bytea("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: bytea("credential_id").notNull().unique(),
  publicKey: bytea("public_key").notNull(),
  signCount: bigint("sign_count", { mode: "bigint" }).notNull().default(sql`0`),
  transports: text("transports").array().notNull().default(sql`'{}'::text[]`),
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ipInet: inet("ip_inet"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const invites = pgTable("invites", {
  tokenHash: bytea("token_hash").primaryKey(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  consumedBy: uuid("consumed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  githubInstallationId: bigint("github_installation_id", { mode: "bigint" }).notNull(),
  githubRepoFullName: text("github_repo_full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  buildRoot: text("build_root").notNull().default("."),
  autoDeploy: boolean("auto_deploy").notNull().default(false),
  internalPort: integer("internal_port").notNull().unique(),
  cpuLimit: numeric("cpu_limit", { precision: 4, scale: 2 }).notNull().default("1.00"),
  memLimitMb: integer("mem_limit_mb").notNull().default(512),
  healthCheckPath: text("health_check_path").notNull().default("/"),
  healthCheckStatus: integer("health_check_status").notNull().default(200),
  healthCheckTimeoutS: integer("health_check_timeout_s").notNull().default(60),
  restartPolicy: text("restart_policy").notNull().default("unless-stopped"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const appEnvVars = pgTable(
  "app_env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: bytea("value_enc").notNull(),
    valueNonce: bytea("value_nonce").notNull(),
    isSecret: boolean("is_secret").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAppKey: unique("app_env_vars_app_id_key_uniq").on(t.appId, t.key),
  }),
);

export const appVolumes = pgTable(
  "app_volumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    mountPath: text("mount_path").notNull(),
    dockerVolumeName: text("docker_volume_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAppMount: unique("app_volumes_app_id_mount_uniq").on(t.appId, t.mountPath),
  }),
);

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  commitSha: text("commit_sha").notNull(),
  commitMessage: text("commit_message"),
  commitAuthor: text("commit_author"),
  trigger: text("trigger").notNull(),
  triggeredBy: uuid("triggered_by").references(() => users.id),
  status: text("status").notNull().default("queued"),
  imageTag: text("image_tag"),
  containerId: text("container_id"),
  boundPort: integer("bound_port"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorSummary: text("error_summary"),
});

export const deploymentLogs = pgTable(
  "deployment_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    deploymentId: uuid("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    stream: text("stream").notNull(),
    line: text("line").notNull(),
  },
  (t) => ({
    byDeployTs: index("deployment_logs_dep_ts_idx").on(t.deploymentId, t.ts),
  }),
);

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  certStatus: text("cert_status").notNull().default("pending_dns"),
  certIssuedAt: timestamp("cert_issued_at", { withTimezone: true }),
  certExpiresAt: timestamp("cert_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorIp: inet("actor_ip"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    byTs: index("audit_log_ts_idx").on(t.ts),
    byActor: index("audit_log_actor_idx").on(t.actorUserId),
  }),
);
