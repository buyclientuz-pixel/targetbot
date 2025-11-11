interface SessionEnv {
  SESSION_NAMESPACE?: KVNamespace;
  DB?: KVNamespace;
  FALLBACK_KV?: KVNamespace;
  LOGS_NAMESPACE?: KVNamespace;
}

const resolveNamespace = (env: SessionEnv): KVNamespace | null => {
  return env.SESSION_NAMESPACE || env.DB || env.FALLBACK_KV || env.LOGS_NAMESPACE || null;
};

const buildKey = (chatId: string): string => `session:admin:${chatId}`;

export interface AdminSessionState {
  kind: string;
  projectId: string;
  messageId?: number;
  createdAt: string;
  data?: Record<string, unknown>;
}

export const readAdminSession = async (
  env: SessionEnv,
  chatId: string,
): Promise<AdminSessionState | null> => {
  const namespace = resolveNamespace(env);
  if (!namespace) {
    return null;
  }

  try {
    const raw = await namespace.get(buildKey(chatId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AdminSessionState;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
};

export const writeAdminSession = async (
  env: SessionEnv,
  chatId: string,
  session: AdminSessionState,
): Promise<void> => {
  const namespace = resolveNamespace(env);
  if (!namespace) {
    return;
  }

  try {
    await namespace.put(buildKey(chatId), JSON.stringify(session), { expirationTtl: 15 * 60 });
  } catch (_error) {
    // ignore write failures
  }
};

export const clearAdminSession = async (env: SessionEnv, chatId: string): Promise<void> => {
  const namespace = resolveNamespace(env);
  if (!namespace) {
    return;
  }

  try {
    await namespace.delete(buildKey(chatId));
  } catch (_error) {
    // ignore delete failures
  }
};
