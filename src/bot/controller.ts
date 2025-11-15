import { loadProjectTodayMetrics } from "./metrics";
import { buildBillingKeyboard, buildMainMenuKeyboard, buildProjectListKeyboard } from "./keyboards";
import { buildMenuMessage, buildProjectCardMessage, buildProjectsListMessage } from "./messages";
import type { TelegramUpdate } from "./types";
import { parseDateInput, addDaysIso, todayIsoDate } from "./dates";
import { parseManualBillingInput } from "./amounts";
import { clearBotSession, getBotSession, saveBotSession } from "../domain/bot-sessions";
import {
  ensureProjectSettings,
  parseProjectSettings,
  upsertProjectSettings,
  type ProjectSettings,
} from "../domain/project-settings";
import { getProject, listProjects, touchProjectUpdatedAt, type Project } from "../domain/projects";
import { createPayment, savePayment } from "../domain/payments";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { sendTelegramMessage, answerCallbackQuery } from "../services/telegram";

interface BotContext {
  kv: KvClient;
  r2: R2Client;
  token: string;
}

const extractUserId = (update: TelegramUpdate): number | null => {
  if (update.message?.from?.id) {
    return update.message.from.id;
  }
  if (update.callback_query?.from?.id) {
    return update.callback_query.from.id;
  }
  return null;
};

const sendMenu = async (ctx: BotContext, chatId: number): Promise<void> => {
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildMenuMessage(),
    replyMarkup: buildMainMenuKeyboard(),
  });
};

const sendProjectsList = async (ctx: BotContext, chatId: number): Promise<void> => {
  const projects = await listProjects(ctx.kv);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectsListMessage(projects.length),
    replyMarkup: projects.length > 0 ? buildProjectListKeyboard(projects) : undefined,
  });
};

const loadProjectAndSettings = async (
  ctx: BotContext,
  projectId: string,
): Promise<{ project: Project; settings: ProjectSettings }> => {
  const project = await getProject(ctx.kv, projectId);
  const settings = await ensureProjectSettings(ctx.kv, projectId);
  return { project, settings };
};

const persistSettings = async (
  ctx: BotContext,
  settings: ProjectSettings,
): Promise<ProjectSettings> => {
  const updated = parseProjectSettings(settings, settings.projectId);
  await upsertProjectSettings(ctx.kv, updated);
  await touchProjectUpdatedAt(ctx.kv, settings.projectId);
  return updated;
};

const sendProjectCard = async (
  ctx: BotContext,
  chatId: number,
  project: Project,
  settings: ProjectSettings,
): Promise<void> => {
  const metrics = await loadProjectTodayMetrics(ctx.kv, project.id);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectCardMessage(project, settings, metrics ?? undefined),
    replyMarkup: buildBillingKeyboard(project.id),
  });
};

const createPlannedPayment = async (
  ctx: BotContext,
  project: Project,
  settings: ProjectSettings,
  amount: number,
  periodStart: string,
  periodEnd: string,
  createdBy: number,
): Promise<void> => {
  if (!amount || amount <= 0) {
    return;
  }
  const payment = createPayment({
    projectId: project.id,
    amount,
    currency: settings.billing.currency,
    periodStart,
    periodEnd,
    status: "PLANNED",
    createdBy,
  });
  await savePayment(ctx.r2, payment);
};

const handleBillingAdd30 = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
): Promise<void> => {
  const { project, settings } = await loadProjectAndSettings(ctx, projectId);
  const baseDate = settings.billing.nextPaymentDate ?? todayIsoDate();
  const newDate = addDaysIso(baseDate, 30);
  const updated: ProjectSettings = {
    ...settings,
    billing: {
      ...settings.billing,
      nextPaymentDate: newDate,
    },
    updatedAt: new Date().toISOString(),
  };
  const saved = await persistSettings(ctx, updated);
  await createPlannedPayment(ctx, project, saved, saved.billing.tariff, baseDate, newDate, userId);
  await sendProjectCard(ctx, chatId, project, saved);
};

const handleBillingTariff = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  tariff: number,
): Promise<void> => {
  const { project, settings } = await loadProjectAndSettings(ctx, projectId);
  const updated: ProjectSettings = {
    ...settings,
    billing: {
      ...settings.billing,
      tariff,
    },
    updatedAt: new Date().toISOString(),
  };
  const saved = await persistSettings(ctx, updated);
  await sendProjectCard(ctx, chatId, project, saved);
};

const handleBillingDatePrompt = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
  mode: "billing:set-date" | "billing:manual",
): Promise<void> => {
  const message =
    mode === "billing:set-date"
      ? "Введите дату оплаты в формате YYYY-MM-DD или DD.MM.YYYY"
      : "Введите сумму и дату через пробел. Пример: 450 2025-12-15";
  await saveBotSession(ctx.kv, { userId, state: { type: mode, projectId }, updatedAt: new Date().toISOString() });
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: message,
  });
};

const handleDateSubmission = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
  text: string,
): Promise<void> => {
  const { project, settings } = await loadProjectAndSettings(ctx, projectId);
  let isoDate: string;
  try {
    isoDate = parseDateInput(text);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось обработать дату: ${(error as Error).message}`,
    });
    return;
  }
  const updated: ProjectSettings = {
    ...settings,
    billing: {
      ...settings.billing,
      nextPaymentDate: isoDate,
    },
    updatedAt: new Date().toISOString(),
  };
  const saved = await persistSettings(ctx, updated);
  await createPlannedPayment(ctx, project, saved, saved.billing.tariff, isoDate, isoDate, userId);
  await clearBotSession(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: "Дата оплаты обновлена",
  });
  await sendProjectCard(ctx, chatId, project, saved);
};

const handleManualSubmission = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
  text: string,
): Promise<void> => {
  let amount: number;
  let date: string;
  try {
    ({ amount, date } = parseManualBillingInput(text));
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Ошибка: ${(error as Error).message}`,
    });
    return;
  }

  let isoDate: string;
  try {
    isoDate = parseDateInput(date);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось обработать дату: ${(error as Error).message}`,
    });
    return;
  }
  const { project, settings } = await loadProjectAndSettings(ctx, projectId);
  const updated: ProjectSettings = {
    ...settings,
    billing: {
      ...settings.billing,
      tariff: amount,
      nextPaymentDate: isoDate,
    },
    updatedAt: new Date().toISOString(),
  };
  const saved = await persistSettings(ctx, updated);
  await createPlannedPayment(ctx, project, saved, amount, isoDate, isoDate, userId);
  await clearBotSession(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: "Тариф и дата оплаты обновлены",
  });
  await sendProjectCard(ctx, chatId, project, saved);
};

export class TelegramBotController {
  constructor(private readonly context: BotContext) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const userId = extractUserId(update);
    if (!userId) {
      return;
    }
    if (update.message) {
      await this.handleMessage(update.message.chat.id, userId, update.message.text ?? "");
    } else if (update.callback_query) {
      await this.handleCallback(update.callback_query, userId);
    }
  }

  private async handleMessage(chatId: number, userId: number, text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const session = await getBotSession(this.context.kv, userId);
    if (session.state.type === "billing:set-date") {
      await handleDateSubmission(this.context, chatId, userId, session.state.projectId, trimmed);
      return;
    }
    if (session.state.type === "billing:manual") {
      await handleManualSubmission(this.context, chatId, userId, session.state.projectId, trimmed);
      return;
    }

    if (trimmed === "/start" || trimmed.toLowerCase() === "меню") {
      await sendMenu(this.context, chatId);
      return;
    }

    switch (trimmed.toLowerCase()) {
      case "проекты":
        await sendProjectsList(this.context, chatId);
        return;
      case "финансы":
        await sendTelegramMessage(this.context.token, {
          chatId,
          text: "Выберите проект, чтобы управлять оплатой",
        });
        return;
      default:
        await sendMenu(this.context, chatId);
        return;
    }
  }

  private async handleCallback(query: TelegramUpdate["callback_query"], userId: number): Promise<void> {
    const callback = query;
    if (!callback?.data || !callback.message) {
      return;
    }
    const chatId = callback.message.chat.id;
    const data = callback.data;

    const [namespace, action, projectId, extra] = data.split(":");

    if (namespace === "project" && action) {
      await answerCallbackQuery(this.context.token, { id: callback.id });
      const { project, settings } = await loadProjectAndSettings(this.context, action);
      await sendProjectCard(this.context, chatId, project, settings);
      await clearBotSession(this.context.kv, userId);
      return;
    }

    if (namespace === "billing" && projectId) {
      await answerCallbackQuery(this.context.token, { id: callback.id });
      switch (action) {
        case "add30":
          await handleBillingAdd30(this.context, chatId, userId, projectId);
          break;
        case "tariff": {
          const amount = Number.parseFloat(extra ?? "0");
          if (!Number.isNaN(amount) && amount > 0) {
            await handleBillingTariff(this.context, chatId, projectId, amount);
          }
          break;
        }
        case "set-date":
          await handleBillingDatePrompt(this.context, chatId, userId, projectId, "billing:set-date");
          break;
        case "manual":
          await handleBillingDatePrompt(this.context, chatId, userId, projectId, "billing:manual");
          break;
      }
      return;
    }

    await answerCallbackQuery(this.context.token, { id: callback.id, text: "Команда не поддерживается" });
  }
}

export const createTelegramBotController = (context: BotContext): TelegramBotController => {
  return new TelegramBotController(context);
};
