import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://x:y@localhost:5432/z",
  REDIS_URL: "redis://localhost:6379",
  MASTER_KEY_PATH: "/run/secrets/master.key",
  HELPER_SOCKET_PATH: "/run/projectmng/helper.sock",
  DOCKER_PROXY_URL: "http://docker-socket-proxy:2375",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY_PATH: "/run/secrets/github-app.pem",
  GITHUB_WEBHOOK_SECRET: "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  PUBLIC_BASE_URL: "https://pm.example.com",
  WEBAUTHN_RP_ID: "pm.example.com",
  WEBAUTHN_RP_NAME: "projectMng",
  COOKIE_SECRET: "x".repeat(32),
  INTERNAL_PORT_MIN: "10000",
  INTERNAL_PORT_MAX: "19999",
  NGINX_MANAGED_DIR: "/etc/nginx/sites-enabled/managed",
  ACME_EMAIL: "you@example.com",
};

describe("loadConfig", () => {
  it("parses a valid env", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.databaseUrl).toBe(baseEnv.DATABASE_URL);
    expect(cfg.internalPortMin).toBe(10000);
    expect(cfg.internalPortMax).toBe(19999);
  });

  it("rejects a missing required var", () => {
    const env = { ...baseEnv } as Record<string, string | undefined>;
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it("rejects a short cookie secret", () => {
    expect(() => loadConfig({ ...baseEnv, COOKIE_SECRET: "tooshort" }))
      .toThrow(/COOKIE_SECRET/);
  });

  it("rejects an inverted port range", () => {
    expect(() => loadConfig({ ...baseEnv, INTERNAL_PORT_MIN: "20000" }))
      .toThrow(/INTERNAL_PORT/);
  });
});
