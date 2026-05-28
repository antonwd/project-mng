import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { HTTPError } from "../lib/errors.js";

export type ServerOptions = {
  cookieSecret: string;
  corsOrigins?: string[];
};

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: opts.corsOrigins ?? false, credentials: true });
  await app.register(cookie, { secret: opts.cookieSecret });
  await app.register(websocket);
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HTTPError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal_error", message: "internal error" } });
  });
  return app;
}
