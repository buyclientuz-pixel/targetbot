import { Composer } from "grammy";
import { BotContext } from "../types";
import { loadEnv } from "../../utils/env";
import { kvGet } from "../../services/kv";
import { AdminRoles, Role } from "../../types/domain";

const ADMIN_KEY = "admins";

async function resolveRoles(): Promise<Record<string, Role>> {
  const raw = await kvGet(ADMIN_KEY);
  if (!raw) {
    const { adminIds } = loadEnv();
    return Object.fromEntries(adminIds.map((id) => [String(id), "SUPER_ADMIN" as Role]));
  }

  const parsed = JSON.parse(raw) as AdminRoles;
  return parsed.roles;
}

export async function getUserRole(userId: number): Promise<Role | undefined> {
  const roles = await resolveRoles();
  return roles[String(userId)];
}

export function isAdminComposer(): Composer<BotContext> {
  const composer = new Composer<BotContext>();
  composer.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return ctx.reply("Не удалось определить пользователя.");
    }

    const role = await getUserRole(userId);
    if (!role) {
      return ctx.reply("У вас нет доступа к админ-панели.");
    }

    ctx.session.role = role;
    return next();
  });
  return composer;
}

export function requireRole(...allowed: Role[]) {
  return async (ctx: BotContext, next: () => Promise<void>) => {
    const role = ctx.session.role;
    if (!role || !allowed.includes(role)) {
      await ctx.answerCallbackQuery({
        text: "Недостаточно прав",
        show_alert: true,
      });
      return;
    }
    await next();
  };
}
