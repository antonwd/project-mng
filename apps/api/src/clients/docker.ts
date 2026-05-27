import Docker from "dockerode";

export type CreateContainerOptions = {
  name: string;
  image: string;
  networkName: string;
  portBindings: { host: number; container: number };
  env: Record<string, string>;
  memLimitMb: number;
  cpuLimit: number;
  restartPolicy: string;
  labels?: Record<string, string>;
};

export class DockerClient {
  private inner: any;

  constructor(proxyUrl: string, factory: (proxyUrl: string) => any = defaultFactory) {
    this.inner = factory(proxyUrl);
  }

  async createNetwork(name: string): Promise<{ id: string }> {
    return this.inner.createNetwork({ Name: name, Driver: "bridge", Internal: false });
  }

  async createContainer(opts: CreateContainerOptions): Promise<{ id: string; start: () => Promise<void>; stop: () => Promise<void>; remove: () => Promise<void> }> {
    const env = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
    const created = await this.inner.createContainer({
      name: opts.name,
      Image: opts.image,
      Env: env,
      Labels: opts.labels ?? {},
      HostConfig: {
        Memory: opts.memLimitMb * 1024 * 1024,
        NanoCpus: Math.round(opts.cpuLimit * 1e9),
        RestartPolicy: { Name: opts.restartPolicy },
        NetworkMode: opts.networkName,
        PortBindings: {
          [`${opts.portBindings.container}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: String(opts.portBindings.host) }],
        },
      },
    });
    return created;
  }

  async buildImage(tarballStream: NodeJS.ReadableStream, tag: string): Promise<NodeJS.ReadableStream> {
    return this.inner.buildImage(tarballStream, { t: tag });
  }

  async listContainersByLabel(label: string, value: string): Promise<any[]> {
    return this.inner.listContainers({ all: true, filters: { label: [`${label}=${value}`] } });
  }

  getContainer(id: string): any {
    return this.inner.getContainer(id);
  }
}

function defaultFactory(proxyUrl: string) {
  const url = new URL(proxyUrl);
  return new Docker({ host: url.hostname, port: Number(url.port) || 2375, protocol: (url.protocol.replace(":", "") as "http" | "https") });
}
