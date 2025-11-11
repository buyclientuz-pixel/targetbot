import { DashboardLogEntry } from "../types";

interface R2Env {
  REPORTS_BUCKET?: R2Bucket;
  R2_BUCKET?: R2Bucket;
  BOT_BUCKET?: R2Bucket;
  STORAGE_BUCKET?: R2Bucket;
  LOGS_BUCKET?: R2Bucket;
  FALLBACK_KV?: KVNamespace;
  LOGS_NAMESPACE?: KVNamespace;
}

const resolveBucket = (env: R2Env): R2Bucket | null => {
  return (
    env.REPORTS_BUCKET ||
    env.LOGS_BUCKET ||
    env.R2_BUCKET ||
    env.BOT_BUCKET ||
    env.STORAGE_BUCKET ||
    null
  );
};

export const readJsonFromR2 = async <T>(env: R2Env, key: string): Promise<T | null> => {
  const bucket = resolveBucket(env);
  if (!bucket) {
    return null;
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return null;
    }
    const text = await object.text();
    return JSON.parse(text) as T;
  } catch (_error) {
    await writeFallback(env, key, "read_error");
    return null;
  }
};

export const writeJsonToR2 = async (env: R2Env, key: string, value: unknown): Promise<boolean> => {
  const bucket = resolveBucket(env);
  if (!bucket) {
    return false;
  }

  try {
    await bucket.put(key, JSON.stringify(value, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    return true;
  } catch (_error) {
    await writeFallback(env, key, "write_error");
    return false;
  }
};

export const appendLogEntry = async (
  env: R2Env,
  entry: DashboardLogEntry,
  dateKey?: string,
): Promise<void> => {
  const bucket = resolveBucket(env);
  const logKey = (dateKey || new Date().toISOString().slice(0, 10)) + ".json";
  const fullKey = "logs/" + logKey;

  if (!bucket) {
    await writeFallback(env, fullKey, JSON.stringify(entry));
    return;
  }

  try {
    const existing = await readJsonFromR2<DashboardLogEntry[]>(env, fullKey);
    const nextLogs = Array.isArray(existing) ? existing.slice(-199) : [];
    nextLogs.push(entry);
    await bucket.put(fullKey, JSON.stringify(nextLogs, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (_error) {
    await writeFallback(env, fullKey, JSON.stringify(entry));
  }
};

const writeFallback = async (env: R2Env, key: string, message: string): Promise<void> => {
  const fallback = env.FALLBACK_KV || env.LOGS_NAMESPACE;
  if (!fallback) {
    return;
  }

  try {
    const now = new Date().toISOString();
    await fallback.put("fallback:" + key + ":" + now, message);
  } catch (_error) {
    // ignore
  }
};
