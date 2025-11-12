import type { Env, LeadRecord, UserRecord } from "../core/types";
import { createLead, listReports, saveUser } from "../core/db";
import { jsonResponse, uuid } from "../core/utils";
import { callTelegramApi } from "./telegram";
import { logEvent } from "../core/logger";

interface CommandContext {
  env: Env;
  chatId: number;
  user: UserRecord;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  text?: string;
}

export async function ensureUser(env: Env, message: TelegramMessage) {
  const from = message.from;
  if (!from) {
    throw new Error("Telegram message missing sender");
  }
  const existingRaw = await env.KV_USERS.get(`user:${from.id}`);
  if (existingRaw) {
    return JSON.parse(existingRaw) as UserRecord;
  }
  const user: UserRecord = {
    id: from.id,
    firstName: from.first_name,
    lastName: from.last_name,
    username: from.username,
    role: "client",
    token: uuid(),
    createdAt: new Date().toISOString(),
  };
  await saveUser(env, user);
  await logEvent(env, "user.registered", { userId: user.id });
  return user;
}

export async function handleCommand(context: CommandContext, command: string, args: string) {
  switch (command) {
    case "/start":
      return handleStart(context);
    case "/lead":
      return handleLead(context, args);
    case "/report":
      return handleReport(context);
    case "/status":
      return handleStatus(context);
    default:
      return sendMessage(context, "Неизвестная команда. Используйте /start, /lead, /report или /status.");
  }
}

async function handleStart(context: CommandContext) {
  const message = [
    "👋 Добро пожаловать в TargetBot!",
    "Выберите роль: клиент, менеджер или администратор.",
    "Используйте /lead для создания заявки, /report для отчёта и /status для проверки интеграций.",
  ].join("\n");
  await sendMessage(context, message);
  return jsonResponse({ ok: true });
}

async function handleLead(context: CommandContext, args: string) {
  if (!args) {
    return sendMessage(
      context,
      "Отправьте команду в формате `/lead Имя | Контакт | Примечание`",
      { parse_mode: "Markdown" },
    );
  }
  const [name, contact, notes] = args.split("|").map((part) => part.trim());
  if (!name || !contact) {
    return sendMessage(context, "Не удалось распознать данные заявки. Укажите имя и контакт.");
  }
  const lead: Omit<LeadRecord, "id" | "createdAt" | "updatedAt"> = {
    name,
    contact,
    notes,
    status: "new",
    source: "telegram",
    userId: context.user.id,
  };
  const created = await createLead(context.env, lead);
  await logEvent(context.env, "lead.created", { leadId: created.id, userId: context.user.id });
  await sendMessage(
    context,
    `✅ Заявка создана!\nID: ${created.id}\nИмя: ${created.name}\nКонтакт: ${created.contact}`,
  );
  return jsonResponse({ ok: true, lead: created });
}

async function handleReport(context: CommandContext) {
  const reports = await listReports(context.env);
  if (!reports.length) {
    return sendMessage(context, "Отчётов пока нет. Попробуйте позже или создайте их через /admin.");
  }
  const lines = reports.slice(0, 5).map((report, index) => {
    const period = report.period.from && report.period.to ? `${report.period.from} → ${report.period.to}` : "период не задан";
    return `${index + 1}. ${report.id} (${period})`;
  });
  await sendMessage(context, [`📊 Доступные отчёты:`, ...lines].join("\n"));
  return jsonResponse({ ok: true, reports });
}

async function handleStatus(context: CommandContext) {
  const token = await context.env.KV_META.get("meta:token");
  const message = token
    ? "🔗 Facebook Meta подключён. Используйте /report, чтобы получить последние данные."
    : "⚠️ Meta не подключена. Авторизуйтесь в панели администратора.";
  await sendMessage(context, message);
  return jsonResponse({ ok: true });
}

async function sendMessage(
  context: CommandContext,
  text: string,
  extra: Record<string, unknown> = {},
) {
  await callTelegramApi(context.env, "sendMessage", {
    chat_id: context.chatId,
    text,
    ...extra,
  });
  return jsonResponse({ ok: true });
}
