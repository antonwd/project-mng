import type Redis from "ioredis";

export class RateLimiter {
  constructor(private redis: Redis) {}

  async consume(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }> {
    const k = `rl:${key}`;
    const tx = this.redis.multi();
    tx.incr(k);
    tx.expire(k, windowSec, "NX");
    const res = await tx.exec();
    const count = (res?.[0]?.[1] as number) ?? 0;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}
