import type { Env, RouterContext } from "../core/types";

export function createMemoryKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list({ prefix }: { prefix: string }) {
      const keys = Array.from(store.keys())
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys };
    },
  } as KVNamespace;
}

export function createMemoryR2() {
  const store = new Map<string, { body: string; customMetadata?: Record<string, string>; uploaded: Date }>();
  return {
    async put(key: string, value: string, options?: { customMetadata?: Record<string, string> }) {
      store.set(key, { body: value, customMetadata: options?.customMetadata, uploaded: new Date() });
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        text: async () => entry.body,
      } as R2ObjectBody;
    },
    async list({ prefix }: { prefix: string }) {
      const objects = Array.from(store.entries())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({
          key,
          customMetadata: value.customMetadata,
          uploaded: value.uploaded,
          httpEtag: `etag-${key}`,
        }));
      return { objects };
    },
  } as unknown as R2Bucket;
}

export function createContext(overrides: Partial<RouterContext> = {}): RouterContext {
  const env: Env = {
    KV_USERS: createMemoryKV(),
    KV_LEADS: createMemoryKV(),
    KV_META: createMemoryKV(),
    KV_LOGS: createMemoryKV(),
    R2_REPORTS: createMemoryR2(),
    TELEGRAM_TOKEN: "123:token",
    ADMIN_KEY: "test",
  };
  const request = overrides.request ?? new Request("https://example.com", { method: "GET" });
  const ctx = overrides.ctx ?? ({} as ExecutionContext);
  return {
    env: overrides.env ?? env,
    request,
    params: overrides.params ?? {},
    ctx,
    data: overrides.data,
  };
}
