import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import Redis from "ioredis";
import { RateLimiter } from "./rate-limit.js";

let redisContainer: StartedRedisContainer;
let redis: Redis;

beforeAll(async () => {
  redisContainer = await new RedisContainer("redis:7-alpine").start();
  redis = new Redis(redisContainer.getConnectionUrl());
});
afterAll(async () => { await redis.quit(); await redisContainer.stop({ remove: true }); });

describe("RateLimiter", () => {
  it("allows the first N, then blocks", async () => {
    const rl = new RateLimiter(redis);
    const key = "test:" + Math.random();
    for (let i = 0; i < 3; i++) {
      const r = await rl.consume(key, 3, 60);
      expect(r.allowed).toBe(true);
    }
    const r = await rl.consume(key, 3, 60);
    expect(r.allowed).toBe(false);
  });
});
