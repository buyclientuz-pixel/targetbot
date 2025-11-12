import type { RouteHandler } from "../core/types";
import { listUsers, saveUser } from "../core/db";
import { fail, ok, readJsonBody } from "../core/utils";
import { requireAdmin } from "../core/auth";

export const listUsersHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const users = await listUsers(context.env);
  return ok({ users });
};

export const updateUserHandler: RouteHandler = async (context) => {
  const authError = requireAdmin(context);
  if (authError) return authError;
  const payload = await readJsonBody<{
    role?: string;
    meta?: Record<string, unknown>;
  }>(context.request);
  if (!payload) return fail("Missing body", 400);
  const existingRaw = await context.env.KV_USERS.get(`user:${context.params.id}`);
  if (!existingRaw) return fail("User not found", 404);
  const user = JSON.parse(existingRaw);
  if (payload.role) user.role = payload.role;
  if (payload.meta) user.meta = payload.meta;
  await saveUser(context.env, user);
  return ok({ user });
};
