import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../errors";
import { assertIsoDate, assertOptionalString, assertString } from "./validation";

export interface MetaToken {
  facebookUserId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const normaliseMetaToken = (raw: Record<string, unknown>): MetaToken => {
  const metaToken: MetaToken = {
    facebookUserId: assertString(raw.facebookUserId, "metaToken.facebookUserId"),
    accessToken: assertString(raw.accessToken, "metaToken.accessToken"),
    refreshToken: assertOptionalString(raw.refreshToken, "metaToken.refreshToken"),
    expiresAt: assertOptionalString(raw.expiresAt, "metaToken.expiresAt"),
    createdAt: assertIsoDate(raw.createdAt, "metaToken.createdAt"),
    updatedAt: assertIsoDate(raw.updatedAt, "metaToken.updatedAt"),
  };

  if (metaToken.expiresAt) {
    assertIsoDate(metaToken.expiresAt, "metaToken.expiresAt");
  }

  return metaToken;
};

export const parseMetaToken = (raw: unknown): MetaToken => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Meta token payload must be an object");
  }
  return normaliseMetaToken(raw as Record<string, unknown>);
};

export const serialiseMetaToken = (token: MetaToken): Record<string, unknown> => ({
  facebookUserId: token.facebookUserId,
  accessToken: token.accessToken,
  refreshToken: token.refreshToken,
  expiresAt: token.expiresAt,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
});

export const createMetaToken = (
  input: Pick<MetaToken, "facebookUserId" | "accessToken"> &
    Partial<Pick<MetaToken, "refreshToken" | "expiresAt">>,
): MetaToken => {
  const now = new Date().toISOString();
  return parseMetaToken({
    facebookUserId: input.facebookUserId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
};

export const getMetaToken = async (
  kv: KvClient,
  facebookUserId: string,
): Promise<MetaToken> => {
  const key = KV_KEYS.metaToken(facebookUserId);
  const raw = await kv.getJson<Record<string, unknown>>(key);
  if (!raw) {
    throw new EntityNotFoundError("meta-token", facebookUserId);
  }
  return parseMetaToken(raw);
};

export const upsertMetaToken = async (kv: KvClient, token: MetaToken): Promise<void> => {
  const key = KV_KEYS.metaToken(token.facebookUserId);
  await kv.putJson(key, serialiseMetaToken(token));
};

export const touchMetaToken = async (
  kv: KvClient,
  facebookUserId: string,
  updater: (token: MetaToken) => MetaToken,
): Promise<MetaToken> => {
  const existing = await getMetaToken(kv, facebookUserId);
  const updated = updater({ ...existing, updatedAt: new Date().toISOString() });
  await upsertMetaToken(kv, updated);
  return updated;
};

export const deleteMetaToken = async (kv: KvClient, facebookUserId: string): Promise<void> => {
  await kv.delete(KV_KEYS.metaToken(facebookUserId));
};

export const upsertMetaTokenRecord = async (
  kv: KvClient,
  input: { facebookUserId: string; accessToken: string; refreshToken?: string | null; expiresAt?: string | null },
): Promise<MetaToken> => {
  let createdAt = new Date().toISOString();
  try {
    const existing = await getMetaToken(kv, input.facebookUserId);
    createdAt = existing.createdAt;
  } catch (error) {
    if (!(error instanceof EntityNotFoundError)) {
      throw error;
    }
  }
  const token = parseMetaToken({
    facebookUserId: input.facebookUserId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt,
    updatedAt: new Date().toISOString(),
  });
  await upsertMetaToken(kv, token);
  return token;
};
