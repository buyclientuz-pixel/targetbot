import { parseManualBillingInput } from "./amounts";
import { loadProjectBundle, loadUserProjects } from "./data";
import {
  buildBillingKeyboard,
  buildExportKeyboard,
  buildLeadsFilterKeyboard,
  buildMainMenuKeyboard,
  buildProjectActionsKeyboard,
  buildProjectListKeyboard,
} from "./keyboards";
import {
  buildBillingScreenMessage,
  buildCampaignsMessage,
  buildLeadsMessage,
  buildMenuMessage,
  buildPortalMessage,
  buildProjectCardMessage,
  buildProjectsListMessage,
  buildReportMessage,
  type ProjectListItem,
} from "./messages";
import { addDaysIso, parseDateInput, todayIsoDate } from "./dates";
import type { TelegramUpdate } from "./types";

import { clearBotSession, getBotSession, saveBotSession } from "../domain/bot-sessions";
import { appendPaymentRecord, type PaymentRecord } from "../domain/spec/payments-history";
import { putBillingRecord } from "../domain/spec/billing";
import { getFbAuthRecord } from "../domain/spec/fb-auth";
import { getMetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import { answerCallbackQuery, sendTelegramMessage } from "../services/telegram";

interface BotContext {
  kv: KvClient;
  r2: R2Client;
  token: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const extractUserId = (update: TelegramUpdate): number | null => {
  if (update.message?.from?.id) {
    return update.message.from.id;
  }
  if (update.callback_query?.from?.id) {
    return update.callback_query.from.id;
  }
  return null;
};

const extractChatId = (update: TelegramUpdate): number | null => {
  if (update.message?.chat?.id) {
    return update.message.chat.id;
  }
  if (update.callback_query?.message?.chat?.id) {
    return update.callback_query.message.chat.id;
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

const buildProjectListItems = async (
  ctx: BotContext,
  userId: number,
): Promise<ProjectListItem[]> => {
  const projects = await loadUserProjects(ctx.kv, userId);
  const items = await Promise.all(
    projects.map(async (project) => {
      const campaigns = await getMetaCampaignsDocument(ctx.r2, project.id);
      return {
        id: project.id,
        name: project.name,
        spend: campaigns?.summary?.spend ?? null,
        currency: project.settings.currency,
      } satisfies ProjectListItem;
    }),
  );
  return items;
};

const sendProjectsList = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const projects = await buildProjectListItems(ctx, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectsListMessage(projects),
    replyMarkup: projects.length > 0 ? buildProjectListKeyboard(projects) : undefined,
  });
};

const sendProjectCard = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectCardMessage(bundle),
    replyMarkup: buildProjectActionsKeyboard(projectId),
  });
};

const sendBillingView = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildBillingScreenMessage(bundle.project, bundle.billing, bundle.payments),
    replyMarkup: buildBillingKeyboard(projectId),
  });
};

const createPaymentRecord = (
  billing: { amount: number; currency: string },
  periodFrom: string,
  periodTo: string,
  status: PaymentRecord["status"],
): PaymentRecord => ({
  id: `pay_${Date.now()}`,
  amount: billing.amount,
  currency: billing.currency,
  periodFrom,
  periodTo,
  paidAt: status === "paid" ? new Date().toISOString() : null,
  status,
  comment: null,
});

const notifyBillingChange = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  message: string,
): Promise<void> => {
  await sendTelegramMessage(ctx.token, { chatId, text: message });
  await sendProjectCard(ctx, chatId, projectId);
};

const handleBillingAdd30 = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const baseDate = bundle.billing.nextPaymentDate || todayIsoDate();
  const nextDate = addDaysIso(baseDate, 30);
  const updated = { ...bundle.billing, nextPaymentDate: nextDate };
  await putBillingRecord(ctx.kv, projectId, updated);
  await appendPaymentRecord(
    ctx.r2,
    projectId,
    createPaymentRecord(
      { amount: bundle.billing.tariff, currency: bundle.billing.currency },
      baseDate,
      nextDate,
      "planned",
    ),
  );
  await notifyBillingChange(ctx, chatId, projectId, `✅ Дата следующего платежа обновлена: ${nextDate}`);
};

const handleBillingTariff = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  tariff: number,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const updated = { ...bundle.billing, tariff };
  await putBillingRecord(ctx.kv, projectId, updated);
  await notifyBillingChange(
    ctx,
    chatId,
    projectId,
    `✅ Тариф обновлён: ${new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: bundle.billing.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(tariff)}`,
  );
};

const handleBillingDateInput = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  dateInput: string,
): Promise<void> => {
  const parsed = parseDateInput(dateInput);
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const updated = { ...bundle.billing, nextPaymentDate: parsed };
  await putBillingRecord(ctx.kv, projectId, updated);
  await appendPaymentRecord(
    ctx.r2,
    projectId,
    createPaymentRecord(
      { amount: bundle.billing.tariff, currency: bundle.billing.currency },
      parsed,
      parsed,
      "planned",
    ),
  );
  await notifyBillingChange(ctx, chatId, projectId, `✅ Дата следующего платежа обновлена: ${parsed}`);
};

const handleBillingManualInput = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  input: string,
): Promise<void> => {
  const { amount, date } = parseManualBillingInput(input);
  const parsedDate = parseDateInput(date);
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const updated = { ...bundle.billing, tariff: amount, nextPaymentDate: parsedDate };
  await putBillingRecord(ctx.kv, projectId, updated);
  await appendPaymentRecord(
    ctx.r2,
    projectId,
    createPaymentRecord({ amount, currency: bundle.billing.currency }, parsedDate, parsedDate, "paid"),
  );
  await notifyBillingChange(ctx, chatId, projectId, `✅ Оплата обновлена: ${parsedDate}`);
};

const sendLeadsSection = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  status: "new" | "processing" | "done" | "trash",
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildLeadsMessage(bundle.project, bundle.leads, status),
    replyMarkup: buildLeadsFilterKeyboard(projectId),
  });
};

const sendReport = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildReportMessage(bundle.project, bundle.campaigns),
    replyMarkup: buildProjectActionsKeyboard(projectId),
  });
};

const sendCampaigns = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildCampaignsMessage(bundle.project, bundle.campaigns),
    replyMarkup: buildProjectActionsKeyboard(projectId),
  });
};

const sendPortalLink = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildPortalMessage(bundle.project),
    replyMarkup: buildProjectActionsKeyboard(projectId),
  });
};

const sendExportMenu = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: "Экспорт данных проекта. Выберите формат:",
    replyMarkup: buildExportKeyboard(projectId),
  });
};

const buildCsv = (rows: string[][]): string =>
  rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes("\"")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(","),
    )
    .join("\n");

const sendCsvExport = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  type: "leads" | "campaigns" | "payments",
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  let csv = "";
  switch (type) {
    case "leads": {
      csv = buildCsv([
        ["id", "name", "phone", "created_at", "status", "campaign"],
        ...bundle.leads.leads.map((lead) => [
          lead.id,
          lead.name,
          lead.phone,
          lead.createdAt,
          lead.status,
          lead.campaignName,
        ]),
      ]);
      break;
    }
    case "campaigns": {
      csv = buildCsv([
        ["id", "name", "objective", "spend", "impressions", "clicks", "leads"],
        ...bundle.campaigns.campaigns.map((campaign) => [
          campaign.id,
          campaign.name,
          campaign.objective,
          String(campaign.spend),
          String(campaign.impressions),
          String(campaign.clicks),
          String(campaign.leads),
        ]),
      ]);
      break;
    }
    case "payments": {
      csv = buildCsv([
        ["id", "amount", "currency", "period_from", "period_to", "status", "paid_at"],
        ...bundle.payments.payments.map((payment) => [
          payment.id,
          String(payment.amount),
          payment.currency,
          payment.periodFrom,
          payment.periodTo,
          payment.status,
          payment.paidAt ?? "",
        ]),
      ]);
      break;
    }
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: `Экспорт (${type.toUpperCase()}):\n<pre>${escapeHtml(csv)}</pre>`,
    replyMarkup: buildProjectActionsKeyboard(projectId),
  });
};

const handleSessionInput = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  text: string,
  sessionState: Awaited<ReturnType<typeof getBotSession>>,
): Promise<boolean> => {
  switch (sessionState.state.type) {
    case "billing:set-date":
      await handleBillingDateInput(ctx, chatId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "billing:manual":
      await handleBillingManualInput(ctx, chatId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    default:
      return false;
  }
};

const handleFacebookAuth = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const record = await getFbAuthRecord(ctx.kv, userId);
  if (!record) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text:
        "👣 Шаг 1. Авторизация Facebook\nПерейдите по ссылке ниже, авторизуйтесь и пришлите сюда полученный код.\n\n" +
        "Если у вас уже есть токен — просто отправьте его сообщением.",
    });
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text:
      `✅ Facebook уже подключён.\nАккаунт: <b>${record.userId}</b>\n` +
      `Токен действителен до: <b>${record.expiresAt}</b>\n` +
      "Используйте кнопки ниже для обновления или проверки подключения.",
    replyMarkup: buildMainMenuKeyboard(),
  });
};

const createTelegramBotController = (ctx: BotContext) => ({
  handleUpdate: async (update: TelegramUpdate): Promise<void> => {
    const userId = extractUserId(update);
    const chatId = extractChatId(update);
    if (userId == null || chatId == null) {
      return;
    }

    if (update.message?.text) {
      const session = await getBotSession(ctx.kv, userId);
      if (await handleSessionInput(ctx, chatId, userId, update.message.text, session)) {
        return;
      }

      const text = update.message.text.trim();
      if (text === "/start" || text === "Меню") {
        await sendMenu(ctx, chatId);
        return;
      }
      if (text === "Авторизация Facebook") {
        await handleFacebookAuth(ctx, chatId, userId);
        return;
      }
      if (text === "Проекты") {
        await sendProjectsList(ctx, chatId, userId);
        return;
      }
      // default fallback
      await sendMenu(ctx, chatId);
      return;
    }

    if (update.callback_query?.data) {
      const parts = update.callback_query.data.split(":");
      const scope = parts[0];
      switch (scope) {
        case "project": {
          const action = parts[1];
          const projectId = parts[2];
          if (!action) {
            break;
          }
          if (action === "card" && projectId) {
            await sendProjectCard(ctx, chatId, projectId);
          } else if (action === "list") {
            await sendProjectsList(ctx, chatId, userId);
          } else if (action === "menu") {
            await sendMenu(ctx, chatId);
          } else if (action === "billing" && projectId) {
            await sendBillingView(ctx, chatId, projectId);
          } else if (action === "leads" && parts[2] && parts[3]) {
            await sendLeadsSection(ctx, chatId, parts[3], parts[2] as "new" | "processing" | "done" | "trash");
          } else if (action === "report" && projectId) {
            await sendReport(ctx, chatId, projectId);
          } else if (action === "campaigns" && projectId) {
            await sendCampaigns(ctx, chatId, projectId);
          } else if (action === "portal" && projectId) {
            await sendPortalLink(ctx, chatId, projectId);
          } else if (action === "export" && projectId) {
            await sendExportMenu(ctx, chatId, projectId);
          } else if (action === "export-leads" && projectId) {
            await sendCsvExport(ctx, chatId, projectId, "leads");
          } else if (action === "export-campaigns" && projectId) {
            await sendCsvExport(ctx, chatId, projectId, "campaigns");
          } else if (action === "export-payments" && projectId) {
            await sendCsvExport(ctx, chatId, projectId, "payments");
          }
          break;
        }
        case "billing": {
          const action = parts[1];
          const projectId = parts[2];
          if (!projectId) {
            break;
          }
          if (action === "add30") {
            await handleBillingAdd30(ctx, chatId, projectId);
          } else if (action === "tariff" && parts[3]) {
            await handleBillingTariff(ctx, chatId, projectId, Number(parts[3]));
          } else if (action === "set-date") {
            await saveBotSession(ctx.kv, { userId, state: { type: "billing:set-date", projectId }, updatedAt: new Date().toISOString() });
            await sendTelegramMessage(ctx.token, {
              chatId,
              text: "Введите дату оплаты в формате YYYY-MM-DD или DD.MM.YYYY",
            });
          } else if (action === "manual") {
            await saveBotSession(ctx.kv, { userId, state: { type: "billing:manual", projectId }, updatedAt: new Date().toISOString() });
            await sendTelegramMessage(ctx.token, {
              chatId,
              text: "Введите сумму и дату в формате '500 2025-12-15'",
            });
          }
          break;
        }
        default:
          break;
      }
      if (update.callback_query.id) {
        await answerCallbackQuery(ctx.token, { id: update.callback_query.id });
      }
    }
  },
});

export { createTelegramBotController };
