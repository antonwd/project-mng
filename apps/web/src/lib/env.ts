import { z } from "zod";

const schema = z.object({
  PM_API_URL: z.url(),
  NEXT_PUBLIC_WEBAUTHN_RP_ID: z.string().min(1),
});

export type WebEnv = z.infer<typeof schema>;

let cached: WebEnv | null = null;

function loadEnv(): WebEnv {
  if (cached) return cached;
  const parsed = schema.safeParse({
    PM_API_URL: process.env.PM_API_URL,
    NEXT_PUBLIC_WEBAUTHN_RP_ID: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID,
  });
  if (!parsed.success) {
    throw new Error(
      "invalid web env: " + parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", "),
    );
  }
  cached = parsed.data;
  return cached;
}

// Proxy so call sites can keep writing env.PM_API_URL but validation only fires
// the first time a key is actually read at runtime. next build does static
// analysis that imports this module — eager validation would fail the build.
export const env = new Proxy({} as WebEnv, {
  get(_t, prop: string) {
    return loadEnv()[prop as keyof WebEnv];
  },
});
