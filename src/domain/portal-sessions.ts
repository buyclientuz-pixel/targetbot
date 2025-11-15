import { KV_KEYS } from "../config/kv";
import type { KvClient } from "../infra/kv";
import { DataValidationError, EntityNotFoundError } from "../errors";
import {
  assertIsoDate,
  assertOptionalString,
  assertString,
} from "./validation";

export interface PortalSession {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PortalSessionWriteOptions {
  ttlSeconds?: number;
}

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export const parsePortalSession = (raw: unknown): PortalSession => {
  if (!raw || typeof raw !== "object") {
    throw new DataValidationError("Portal session payload must be an object");
  }
  const record = raw as Record<string, unknown>;

  return {
    id: assertString(record.id, "portalSession.id"),
    projectId: assertString(record.projectId, "portalSession.projectId"),
    userId: assertString(record.userId, "portalSession.userId"),
    createdAt: assertIsoDate(record.createdAt, "portalSession.createdAt"),
    expiresAt: assertIsoDate(record.expiresAt, "portalSession.expiresAt"),
    lastSeenAt: assertOptionalString(record.lastSeenAt, "portalSession.lastSeenAt"),
    ipAddress: assertOptionalString(record.ipAddress, "portalSession.ipAddress"),
    userAgent: assertOptionalString(record.userAgent, "portalSession.userAgent"),
  };
};

export const serialisePortalSession = (session: PortalSession): Record<string, unknown> => ({
  id: session.id,
  projectId: session.projectId,
  userId: session.userId,
  createdAt: session.createdAt,
  expiresAt: session.expiresAt,
  lastSeenAt: session.lastSeenAt,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
});

export const createPortalSession = (
  input: Pick<PortalSession, "id" | "projectId" | "userId"> &
    Partial<Pick<PortalSession, "ipAddress" | "userAgent">>,
  ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
): PortalSession => {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
  const session: PortalSession = {
    id: input.id,
    projectId: input.projectId,
    userId: input.userId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: createdAt.toISOString(),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };
  return parsePortalSession(session);
};

export const getPortalSession = async (kv: KvClient, sessionId: string): Promise<PortalSession> => {
  const raw = await kv.getJson<Record<string, unknown>>(KV_KEYS.portalSession(sessionId));
  if (!raw) {
    throw new EntityNotFoundError("portal-session", sessionId);
  }
  return parsePortalSession(raw);
};

export const savePortalSession = async (
  kv: KvClient,
  session: PortalSession,
  options: PortalSessionWriteOptions = {},
): Promise<void> => {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  await kv.putJson(KV_KEYS.portalSession(session.id), serialisePortalSession(session), {
    expirationTtl: ttlSeconds,
  });
};

export const touchPortalSession = async (
  kv: KvClient,
  sessionId: string,
  options: PortalSessionWriteOptions = {},
): Promise<PortalSession> => {
  const session = await getPortalSession(kv, sessionId);
  const now = new Date().toISOString();
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const updated: PortalSession = { ...session, lastSeenAt: now, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  await savePortalSession(kv, updated, { ttlSeconds });
  return updated;
};

export const deletePortalSession = async (kv: KvClient, sessionId: string): Promise<void> => {
  await kv.delete(KV_KEYS.portalSession(sessionId));
};
