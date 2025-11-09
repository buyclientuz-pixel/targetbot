import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_IDS: z.string().optional(),
  DEFAULT_TZ: z.string().default("Asia/Tashkent"),
  FB_APP_ID: z.string().min(1, "FB_APP_ID is required"),
  FB_APP_SECRET: z.string().min(1, "FB_APP_SECRET is required"),
  FB_LONG_TOKEN: z.string().optional(),
  WORKER_URL: z
    .string()
    .url("WORKER_URL must be a valid URL")
    .refine((url) => url.startsWith("https://"), "WORKER_URL must be https"),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
  CLOUDFLARE_API_TOKEN: z
    .string()
    .min(1, "CLOUDFLARE_API_TOKEN is required"),
  CF_KV_NAMESPACE_ID: z
    .string()
    .min(1, "CF_KV_NAMESPACE_ID is required"),
});

export type EnvConfig = z.infer<typeof envSchema> & {
  adminIds: number[];
};

let cachedConfig: EnvConfig | undefined;

export function loadEnv(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.errors
      .map((err) => `${err.path.join(".") || "env"}: ${err.message}`)
      .join(", ");
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }

  const { ADMIN_IDS, ...rest } = parsed.data;
  const adminIds = (ADMIN_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      const num = Number(value);
      if (!Number.isInteger(num)) {
        throw new Error(`ADMIN_IDS entry must be an integer: "${value}"`);
      }
      return num;
    });

  cachedConfig = {
    ...rest,
    BOT_TOKEN: rest.BOT_TOKEN,
    FB_APP_ID: rest.FB_APP_ID,
    FB_APP_SECRET: rest.FB_APP_SECRET,
    FB_LONG_TOKEN: rest.FB_LONG_TOKEN,
    WORKER_URL: rest.WORKER_URL.replace(/\/$/, ""),
    adminIds,
  };

  return cachedConfig;
}

export function resetEnvCache(): void {
  cachedConfig = undefined;
}
