import { jsonResponse, parseJsonRequest } from "../utils/http";
import { EnvBindings, listUsers, saveUsers } from "../utils/storage";
import { ApiError, ApiSuccess, UserRecord, UserRole } from "../types";
import { createId } from "../utils/ids";

const ensureEnv = (env: unknown): EnvBindings & Record<string, unknown> => {
  if (!env || typeof env !== "object" || !("DB" in env) || !("R2" in env)) {
    throw new Error("Env bindings are not configured");
  }
  return env as EnvBindings & Record<string, unknown>;
};

const nowIso = () => new Date().toISOString();

const ensureRole = (role: string | undefined): UserRole => {
  if (role === "owner" || role === "manager" || role === "client") {
    return role;
  }
  if (role === "admin") {
    return "owner";
  }
  throw new Error("Invalid user role");
};

export const handleUsersList = async (_request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const users = await listUsers(bindings);
    const payload: ApiSuccess<UserRecord[]> = { ok: true, data: users };
    return jsonResponse(payload);
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 500 });
  }
};

export const handleUsersCreate = async (request: Request, env: unknown): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<Partial<UserRecord>>(request);
    if (!body.name) {
      throw new Error("User name is required");
    }
    if (!body.role) {
      throw new Error("User role is required");
    }
    const role = ensureRole(body.role);
    const users = await listUsers(bindings);
    const timestamp = nowIso();
    const record: UserRecord = {
      id: body.id || createId(),
      name: body.name,
      username: body.username,
      role,
      createdAt: timestamp,
      registeredAt: timestamp,
    };
    users.push(record);
    await saveUsers(bindings, users);
    const payload: ApiSuccess<UserRecord> = { ok: true, data: record };
    return jsonResponse(payload, { status: 201 });
  } catch (error) {
    const payload: ApiError = { ok: false, error: (error as Error).message };
    return jsonResponse(payload, { status: 400 });
  }
};

export const handleUserUpdate = async (
  request: Request,
  env: unknown,
  userId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const body = await parseJsonRequest<Partial<UserRecord>>(request);
    const users = await listUsers(bindings);
    const index = users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return jsonResponse({ ok: false, error: "User not found" }, { status: 404 });
    }
    const updates: Partial<UserRecord> = {};
    if (body.name) updates.name = body.name;
    if (body.username !== undefined) updates.username = body.username;
    if (body.role) updates.role = ensureRole(body.role);
    const updated: UserRecord = { ...users[index], ...updates };
    users[index] = updated;
    await saveUsers(bindings, users);
    return jsonResponse({ ok: true, data: updated });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 400 });
  }
};

export const handleUserDelete = async (
  _request: Request,
  env: unknown,
  userId: string,
): Promise<Response> => {
  try {
    const bindings = ensureEnv(env);
    const users = await listUsers(bindings);
    const filtered = users.filter((user) => user.id !== userId);
    if (filtered.length === users.length) {
      return jsonResponse({ ok: false, error: "User not found" }, { status: 404 });
    }
    await saveUsers(bindings, filtered);
    return jsonResponse({ ok: true, data: { id: userId } });
  } catch (error) {
    return jsonResponse({ ok: false, error: (error as Error).message }, { status: 500 });
  }
};
