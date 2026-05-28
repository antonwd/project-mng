import { z } from "zod";

const schema = z.object({
  PM_API_URL: z.url(),
  NEXT_PUBLIC_WEBAUTHN_RP_ID: z.string().min(1),
});

export type WebEnv = z.infer<typeof schema>;

export const env: WebEnv = (() => {
  const parsed = schema.safeParse({
    PM_API_URL: process.env.PM_API_URL,
    NEXT_PUBLIC_WEBAUTHN_RP_ID: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID,
  });
  if (!parsed.success) {
    throw new Error("invalid web env: " + parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", "));
  }
  return parsed.data;
})();
