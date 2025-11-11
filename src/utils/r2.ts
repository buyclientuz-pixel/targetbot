import { CronStatusEntry, CronStatusMap, DashboardLogEntry } from "../types";

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
    await writeFallback(env, key, { reason: "read_error" });
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
    await writeFallback(env, key, { reason: "write_error", value });
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
    await writeFallback(env, fullKey, entry);
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
    await writeFallback(env, fullKey, entry);
  }
};

const CRON_STATUS_KEY = "meta/system/cron-status.json";

export const readCronStatus = async (env: R2Env): Promise<CronStatusMap> => {
  const data = await readJsonFromR2<CronStatusMap>(env, CRON_STATUS_KEY);
  if (!data || typeof data !== "object") {
    return {};
  }
  const entries: CronStatusMap = {};
  for (const [job, value] of Object.entries(data)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const record: CronStatusEntry = {
      job,
      last_run: typeof (value as any).last_run === "string" ? (value as any).last_run : new Date(0).toISOString(),
      ok: Boolean((value as any).ok),
      message:
        typeof (value as any).message === "string" && (value as any).message
          ? (value as any).message
          : null,
      last_success:
        typeof (value as any).last_success === "string" && (value as any).last_success
          ? (value as any).last_success
          : null,
      failure_count:
        typeof (value as any).failure_count === "number"
          ? Math.max(0, (value as any).failure_count)
          : undefined,
    };
    entries[job] = record;
  }
  return entries;
};

export const updateCronStatus = async (
  env: R2Env,
  job: string,
  update: { ok: boolean; message?: string | null },
): Promise<void> => {
  const jobId = job.trim();
  if (!jobId) {
    return;
  }
  const now = new Date().toISOString();
  const current = await readCronStatus(env);
  const previous = current[jobId];
  const next: CronStatusEntry = {
    job: jobId,
    last_run: now,
    ok: update.ok,
    message: update.message || null,
    last_success: update.ok ? now : previous?.last_success || null,
    failure_count: update.ok ? 0 : (previous?.failure_count || 0) + 1,
  };
  const payload: CronStatusMap = { ...current, [jobId]: next };
  await writeJsonToR2(env, CRON_STATUS_KEY, payload);
};

export const deleteFromR2 = async (env: R2Env, key: string): Promise<boolean> => {
  const bucket = resolveBucket(env);
  if (!bucket) {
    return false;
  }

  try {
    await bucket.delete(key);
    return true;
  } catch (_error) {
    await writeFallback(env, key, { reason: "delete_error" });
    return false;
  }
};

export const deletePrefixFromR2 = async (env: R2Env, prefix: string): Promise<number> => {
  const bucket = resolveBucket(env);
  if (!bucket || typeof bucket.list !== "function") {
    return 0;
  }

  let removed = 0;
  let cursor: string | undefined = undefined;

  try {
    do {
      const result = await bucket.list({ prefix, cursor });
      if (Array.isArray(result.objects)) {
        for (const object of result.objects) {
          if (object?.key) {
            await bucket.delete(object.key);
            removed += 1;
          }
        }
      }
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
  } catch (_error) {
    await writeFallback(env, prefix + ":delete", { reason: "delete_prefix_error" });
  }

  return removed;
};

const writeFallback = async (
  env: R2Env,
  key: string,
  message: unknown,
): Promise<void> => {
  const fallback = env.FALLBACK_KV || env.LOGS_NAMESPACE;
  if (!fallback) {
    return;
  }

  try {
    const now = new Date().toISOString();
    const payload = {
      key,
      timestamp: now,
      message,
      _fallback: true,
    };
    await fallback.put("fallback:" + key + ":" + now, JSON.stringify(payload));
  } catch (_error) {
    // ignore
  }
};

export const listR2Keys = async (env: R2Env, prefix: string): Promise<string[]> => {
  const bucket = resolveBucket(env);
  if (!bucket || typeof bucket.list !== "function") {
    return [];
  }

  const keys: string[] = [];
  let cursor: string | undefined = undefined;

  try {
    do {
      const result = await bucket.list({ prefix, cursor });
      for (const object of result.objects) {
        if (object?.key) {
          keys.push(object.key);
        }
      }
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);
  } catch (_error) {
    await writeFallback(env, prefix + ":list", { reason: "list_error" });
    return [];
  }

  return keys;
};

export const countFallbackEntries = async (env: R2Env): Promise<number | null> => {
  const fallback = env.FALLBACK_KV || env.LOGS_NAMESPACE;
  if (!fallback || typeof fallback.list !== "function") {
    return null;
  }

  try {
    const result = await fallback.list({ prefix: "fallback:" });
    return result.keys.length;
  } catch (_error) {
    return null;
  }
};

export const clearFallbackEntries = async (env: R2Env): Promise<number | null> => {
  const fallback = env.FALLBACK_KV || env.LOGS_NAMESPACE;
  if (!fallback || typeof fallback.list !== "function") {
    return null;
  }

  let removed = 0;
  let cursor: string | undefined = undefined;

  try {
    do {
      const result = await fallback.list({ prefix: "fallback:", cursor });
      if (Array.isArray(result.keys)) {
        for (const key of result.keys) {
          if (key?.name) {
            await fallback.delete(key.name);
            removed += 1;
          }
        }
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  } catch (_error) {
    return null;
  }

  return removed;
};
