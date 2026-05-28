import { describe, it, expect } from "vitest";
import { renderManagedSite } from "./nginx-template.js";

describe("renderManagedSite", () => {
  it("renders HTTP-only when cert not yet active", () => {
    const s = renderManagedSite({ hostname: "ex.com", certActive: false, upstreamPort: 10000, acmeWebroot: "/var/www/_acme" });
    expect(s).toContain("listen 80");
    expect(s).not.toContain("listen 443");
    expect(s).toContain("/var/www/_acme");
    expect(s).toContain("server_name ex.com;");
  });

  it("renders HTTPS + HSTS + redirect when cert active", () => {
    const s = renderManagedSite({ hostname: "ex.com", certActive: true, upstreamPort: 10000, acmeWebroot: "/var/www/_acme" });
    expect(s).toContain("listen 443 ssl http2");
    expect(s).toContain("Strict-Transport-Security");
    expect(s).toContain("ssl_certificate /etc/letsencrypt/live/ex.com/fullchain.pem");
    expect(s).toContain("proxy_pass http://127.0.0.1:10000;");
  });
});
