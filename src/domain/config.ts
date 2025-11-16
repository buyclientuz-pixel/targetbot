import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";

const DAY_MIN = 1;

const clampNumber = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const readConfigNumber = async (
  kv: KvClient,
  key: string,
  fallback: number,
  min: number,
  max: number,
): Promise<number> => {
  const raw = await kv.get(KV_KEYS.config(key));
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clampNumber(Math.floor(parsed), min, max);
};

export const getLeadRetentionDays = async (kv: KvClient, fallback = 30): Promise<number> => {
  return readConfigNumber(kv, "lead-retention-days", fallback, DAY_MIN, 90);
};

export const getMetaCacheRetentionDays = async (kv: KvClient, fallback = 3): Promise<number> => {
  return readConfigNumber(kv, "meta-cache-retention-days", fallback, DAY_MIN, 30);
};
