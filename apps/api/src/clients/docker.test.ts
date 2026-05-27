import { describe, it, expect, vi } from "vitest";
import { DockerClient } from "./docker.js";

describe("DockerClient", () => {
  it("constructs dockerode with the proxy URL", async () => {
    const calls: any[] = [];
    const fakeDocker = {
      createContainer: vi.fn(async (opts: any) => {
        calls.push({ kind: "createContainer", opts });
        return { id: "abc123", start: vi.fn(), stop: vi.fn(), remove: vi.fn() };
      }),
      createNetwork: vi.fn(async (opts: any) => {
        calls.push({ kind: "createNetwork", opts });
        return { id: "net123" };
      }),
    };
    const client = new DockerClient("http://proxy:2375", () => fakeDocker as any);
    await client.createContainer({
      name: "myapp_abc",
      image: "pm/myapp:abc",
      networkName: "app_myapp",
      portBindings: { host: 10001, container: 3000 },
      env: { NODE_ENV: "production" },
      memLimitMb: 256,
      cpuLimit: 0.5,
      restartPolicy: "unless-stopped",
    });
    expect(fakeDocker.createContainer).toHaveBeenCalledOnce();
    const opts = (fakeDocker.createContainer.mock.calls[0]![0] as any);
    expect(opts.name).toBe("myapp_abc");
    expect(opts.Image).toBe("pm/myapp:abc");
    expect(opts.HostConfig.PortBindings["3000/tcp"][0].HostPort).toBe("10001");
    expect(opts.HostConfig.PortBindings["3000/tcp"][0].HostIp).toBe("127.0.0.1");
    expect(opts.HostConfig.NetworkMode).toBe("app_myapp");
    expect(opts.Env).toEqual(["NODE_ENV=production"]);
    expect(opts.HostConfig.RestartPolicy.Name).toBe("unless-stopped");
  });
});
