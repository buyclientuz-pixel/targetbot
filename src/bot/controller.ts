import { parseManualBillingInput } from "./amounts";
import {
  loadAnalyticsOverview,
  loadFinanceOverview,
  loadProjectBundle,
  loadUserProjects,
  listAvailableProjectChats,
} from "./data";
import {
  buildAutoreportsKeyboard,
  buildAutoreportsRouteKeyboard,
  buildAlertsKeyboard,
  buildAlertsRouteKeyboard,
  buildBillingKeyboard,
  buildChatBindingKeyboard,
  buildChatChangeKeyboard,
  buildChatInfoKeyboard,
  buildDeleteConfirmKeyboard,
  buildExportKeyboard,
  buildKpiKeyboard,
  buildLeadDetailKeyboard,
  buildLeadsKeyboard,
  buildMainMenuKeyboard,
  buildProjectActionsKeyboard,
  buildProjectEditKeyboard,
  buildProjectCreationKeyboard,
  buildProjectListKeyboard,
  buildSettingsKeyboard,
} from "./keyboards";
import {
  buildAlertsMessage,
  buildAnalyticsOverviewMessage,
  buildAutoreportsMessage,
  buildBillingScreenMessage,
  buildCampaignsMessage,
  buildChatAlreadyUsedMessage,
  buildChatBindingMessage,
  buildChatChangeMessage,
  buildChatInfoMessage,
  buildDeleteConfirmationMessage,
  buildFinanceOverviewMessage,
  buildKpiMessage,
  buildLeadDetailMessage,
  buildLeadsMessage,
  buildMenuMessage,
  buildPortalMessage,
  buildProjectCardMessage,
  buildProjectEditMessage,
  buildProjectCreationMessage,
  buildProjectsListMessage,
  buildReportMessage,
  buildNoFreeChatsMessage,
  buildSettingsMessage,
  buildUsersMessage,
  buildWebhookStatusMessage,
  type ProjectListItem,
} from "./messages";
import { addDaysIso, parseDateInput, todayIsoDate } from "./dates";
import type { TelegramUpdate } from "./types";

import { KV_KEYS } from "../config/kv";
import { R2_KEYS } from "../config/r2";
import { clearBotSession, getBotSession, saveBotSession } from "../domain/bot-sessions";
import { recordKnownChat } from "../domain/chat-registry";
import {
  deleteFreeChatRecord,
  deleteOccupiedChatRecord,
  getFreeChatRecord,
  getOccupiedChatRecord,
  putFreeChatRecord,
  putOccupiedChatRecord,
} from "../domain/project-chats";
import { appendPaymentRecord, type PaymentRecord } from "../domain/spec/payments-history";
import { putBillingRecord } from "../domain/spec/billing";
import { getFbAuthRecord, putFbAuthRecord, type FbAuthRecord } from "../domain/spec/fb-auth";
import { getMetaCampaignsDocument } from "../domain/spec/meta-campaigns";
import { putAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import { putAlertsRecord, type AlertsRecord } from "../domain/spec/alerts";
import {
  getLeadDetailRecord,
  putLeadDetailRecord,
  putProjectLeadsList,
  type ProjectLeadsListRecord,
} from "../domain/spec/project-leads";
import {
  putProjectRecord,
  deleteProjectRecord,
  requireProjectRecord,
  getProjectRecord,
  type ProjectRecord,
} from "../domain/spec/project";
import { getProjectsByUser, putProjectsByUser } from "../domain/spec/projects-by-user";
import { getUserSettingsRecord, updateUserSettingsRecord, type UserSettingsRecord } from "../domain/spec/user-settings";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import {
  answerCallbackQuery,
  getTelegramChatInfo,
  getWebhookInfo,
  sendTelegramDocument,
  sendTelegramMessage,
} from "../services/telegram";
import { fetchFacebookAdAccounts } from "../services/facebook-auth";
import { normaliseBaseUrl } from "../utils/url";

interface BotContext {
  kv: KvClient;
  r2: R2Client;
  token: string;
  workerBaseUrl: string;
  facebookAuthGuideUrl: string | null;
  telegramSecret: string;
  defaultTimezone: string;
  adminIds: number[];
  buildMenuKeyboard: (userId: number) => ReturnType<typeof buildMainMenuKeyboard>;
  getFacebookOAuthUrl: (userId: number) => string | null;
}

interface CreateTelegramBotControllerOptions {
  kv: KvClient;
  r2: R2Client;
  token: string;
  workerUrl: string;
  telegramSecret: string;
  defaultTimezone: string;
  adminIds: number[];
}

const DEFAULT_WORKER_DOMAIN = "th-reports.buyclientuz.workers.dev";
const FACEBOOK_AUTH_GUIDE_FALLBACK = "https://developers.facebook.com/tools/explorer/";

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

const recordChatFromUpdate = async (ctx: BotContext, update: TelegramUpdate): Promise<void> => {
  const chat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (!chat || chat.type === "private") {
    return;
  }
  await recordKnownChat(ctx.kv, { id: chat.id, title: chat.title, type: chat.type });
};

const slugifyProjectName = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "project";
};

const generateProjectId = async (ctx: BotContext, name: string): Promise<string> => {
  const slug = slugifyProjectName(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `proj_${slug}_${suffix}`;
    const existing = await getProjectRecord(ctx.kv, candidate);
    if (!existing) {
      return candidate;
    }
  }
  return `proj_${slug}_${Date.now().toString(36)}`;
};

const buildDefaultBillingRecord = (currency: string) => ({
  tariff: 0,
  currency,
  nextPaymentDate: new Date().toISOString().slice(0, 10),
  autobilling: false,
});

const buildDefaultAlertsRecord = (): AlertsRecord => ({
  enabled: true,
  channel: "chat",
  types: { leadInQueue: true, pause24h: true, paymentReminder: true },
  leadQueueThresholdHours: 1,
  pauseThresholdHours: 24,
  paymentReminderDays: [7, 1],
});

const buildDefaultAutoreportsRecord = (): AutoreportsRecord => ({
  enabled: false,
  time: "10:00",
  mode: "yesterday_plus_week",
  sendTo: "both",
});

const addProjectToUserMembership = async (ctx: BotContext, userId: number, projectId: string): Promise<void> => {
  const membership = (await getProjectsByUser(ctx.kv, userId)) ?? { projects: [] };
  const nextProjects = [projectId, ...membership.projects.filter((id) => id !== projectId)];
  await putProjectsByUser(ctx.kv, userId, { projects: nextProjects });
};

const reserveChatForProject = async (
  ctx: BotContext,
  project: ProjectRecord,
  chat: { chatId: number; chatTitle: string | null },
): Promise<void> => {
  await deleteFreeChatRecord(ctx.kv, chat.chatId);
  await putOccupiedChatRecord(ctx.kv, {
    chatId: chat.chatId,
    chatTitle: chat.chatTitle,
    ownerId: project.ownerId,
    projectId: project.id,
    projectName: project.name,
    boundAt: new Date().toISOString(),
  });
};

const releaseChatOccupancy = async (
  ctx: BotContext,
  chatId: number,
  ownerId: number,
): Promise<void> => {
  const occupied = await getOccupiedChatRecord(ctx.kv, chatId);
  await deleteOccupiedChatRecord(ctx.kv, chatId);
  const actualOwner = occupied?.ownerId ?? ownerId;
  if (!actualOwner) {
    return;
  }
  await putFreeChatRecord(ctx.kv, {
    chatId,
    chatTitle: occupied?.chatTitle ?? null,
    ownerId: actualOwner,
    registeredAt: new Date().toISOString(),
  });
};

const createProjectFromAccount = async (
  ctx: BotContext,
  userId: number,
  account: FbAuthRecord["adAccounts"][number],
  chat: { chatId: number; chatTitle: string | null },
): Promise<ProjectRecord> => {
  const projectId = await generateProjectId(ctx, account.name);
  const portalUrl = ctx.workerBaseUrl ? `${ctx.workerBaseUrl}/p/${projectId}` : `/p/${projectId}`;
  const project: ProjectRecord = {
    id: projectId,
    name: account.name,
    ownerId: userId,
    adAccountId: account.id,
    chatId: chat.chatId,
    portalUrl,
    settings: {
      currency: account.currency,
      timezone: ctx.defaultTimezone,
      kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
    },
  };
  await putProjectRecord(ctx.kv, project);
  await addProjectToUserMembership(ctx, userId, projectId);
  await putBillingRecord(ctx.kv, projectId, buildDefaultBillingRecord(account.currency));
  await putAlertsRecord(ctx.kv, projectId, buildDefaultAlertsRecord());
  await putAutoreportsRecord(ctx.kv, projectId, buildDefaultAutoreportsRecord());
  await reserveChatForProject(ctx, project, chat);
  return project;
};

const setProjectChatBinding = async (
  ctx: BotContext,
  projectId: string,
  chat: { chatId: number; chatTitle: string | null } | null,
): Promise<void> => {
  const current = await requireProjectRecord(ctx.kv, projectId);
  if (current.chatId && (!chat || current.chatId !== chat.chatId)) {
    await releaseChatOccupancy(ctx, current.chatId, current.ownerId);
  }
  const updated = await updateProject(ctx, projectId, (project) => {
    project.chatId = chat ? chat.chatId : null;
  });
  if (chat) {
    await reserveChatForProject(ctx, updated, chat);
  }
};

const sendMenu = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const fbAuth = await getFbAuthRecord(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildMenuMessage({ fbAuth }),
    replyMarkup: ctx.buildMenuKeyboard(userId),
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

const sendExistingProjectsList = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const projects = await buildProjectListItems(ctx, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectsListMessage(projects),
    replyMarkup: projects.length > 0 ? buildProjectListKeyboard(projects) : undefined,
  });
};

const sendProjectsEntry = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const fbAuth = await getFbAuthRecord(ctx.kv, userId);
  const adAccounts = (fbAuth?.adAccounts ?? []) as FbAuthRecord["adAccounts"];
  const projects = await buildProjectListItems(ctx, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectCreationMessage({ accounts: adAccounts, hasProjects: projects.length > 0 }),
    replyMarkup: buildProjectCreationKeyboard(adAccounts, { hasProjects: projects.length > 0 }),
  });
  if (projects.length === 0) {
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectsListMessage(projects),
    replyMarkup: buildProjectListKeyboard(projects),
  });
};

const handleProjectAccountSelect = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  accountId: string,
): Promise<void> => {
  const fbAuth = await getFbAuthRecord(ctx.kv, userId);
  if (!fbAuth) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Подключите Facebook в разделе «Авторизация Facebook», чтобы увидеть рекламные аккаунты.",
    });
    return;
  }
  const account = fbAuth.adAccounts.find((entry) => entry.id === accountId);
  if (!account) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Рекламный аккаунт не найден. Нажмите «📦 Список рекламных аккаунтов», чтобы обновить данные.",
    });
    return;
  }
  const chats = await listAvailableProjectChats(ctx.kv, userId);
  if (chats.length === 0) {
    await sendTelegramMessage(ctx.token, { chatId, text: buildNoFreeChatsMessage() });
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildChatBindingMessage({ accountName: account.name }),
    replyMarkup: buildChatBindingKeyboard(account.id, chats),
  });
};

const completeProjectBinding = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  account: FbAuthRecord["adAccounts"][number],
  freeChat: { chatId: number; chatTitle: string | null; ownerId: number },
): Promise<void> => {
  const project = await createProjectFromAccount(ctx, userId, account, freeChat);
  await sendTelegramMessage(ctx.token, {
    chatId: freeChat.chatId,
    text:
      `👍 Группа успешно подключена к проекту «${escapeHtml(project.name)}».\n` +
      "Теперь здесь будут приходить лиды, алерты и отчёты.",
  });
  await sendTelegramMessage(ctx.token, {
    chatId,
    text:
      "📦 Проект подключён!\n" +
      `Название: <b>${escapeHtml(project.name)}</b>\n` +
      `Рекламный аккаунт: <b>${escapeHtml(account.id)}</b>\n` +
      `Чат-группа: <b>${freeChat.chatTitle ?? freeChat.chatId}</b>`,
    replyMarkup: buildProjectActionsKeyboard(project.id),
  });
};

const handleProjectBind = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  accountId: string,
  selectedChatId: number,
): Promise<void> => {
  const fbAuth = await getFbAuthRecord(ctx.kv, userId);
  if (!fbAuth) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Подключите Facebook в разделе «Авторизация Facebook», чтобы выбрать аккаунт.",
    });
    return;
  }
  const account = fbAuth.adAccounts.find((entry) => entry.id === accountId);
  if (!account) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Рекламный аккаунт не найден. Обновите список аккаунтов.",
    });
    return;
  }
  const freeChat = await getFreeChatRecord(ctx.kv, selectedChatId);
  if (!freeChat || freeChat.ownerId !== userId) {
    await sendTelegramMessage(ctx.token, { chatId, text: buildChatAlreadyUsedMessage() });
    return;
  }
  await completeProjectBinding(ctx, chatId, userId, account, freeChat);
};

const handleProjectManualBindInput = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  accountId: string,
  input: string,
): Promise<void> => {
  try {
    const resolved = await resolveChatInput(ctx, input);
    const freeChat = await getFreeChatRecord(ctx.kv, resolved.id);
    if (!freeChat || freeChat.ownerId !== userId) {
      await sendTelegramMessage(ctx.token, {
        chatId,
        text: "Чат не найден среди зарегистрированных. Отправьте команду /reg в группе и попробуйте снова.",
      });
      return;
    }
    const fbAuth = await getFbAuthRecord(ctx.kv, userId);
    if (!fbAuth) {
      await sendTelegramMessage(ctx.token, {
        chatId,
        text: "Подключите Facebook в разделе «Авторизация Facebook», чтобы выбрать аккаунт.",
      });
      return;
    }
    const account = fbAuth.adAccounts.find((entry) => entry.id === accountId);
    if (!account) {
      await sendTelegramMessage(ctx.token, {
        chatId,
        text: "Рекламный аккаунт не найден. Обновите список аккаунтов.",
      });
      return;
    }
    await completeProjectBinding(ctx, chatId, userId, account, freeChat);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось обработать чат: ${(error as Error).message}`,
    });
  }
};

const handleGroupRegistration = async (
  ctx: BotContext,
  chat: NonNullable<TelegramUpdate["message"]>["chat"],
  userId: number,
): Promise<void> => {
  if (!chat || chat.type === "private") {
    return;
  }
  const existing = await getOccupiedChatRecord(ctx.kv, chat.id);
  if (existing) {
    await sendTelegramMessage(ctx.token, {
      chatId: chat.id,
      text: "❌ Эта чат-группа уже используется другим проектом. Выберите другую.",
    });
    return;
  }
  await putFreeChatRecord(ctx.kv, {
    chatId: chat.id,
    chatTitle: chat.title ?? null,
    ownerId: userId,
    registeredAt: new Date().toISOString(),
  });
  await sendTelegramMessage(ctx.token, {
    chatId: chat.id,
    text:
      "Группа зарегистрирована!\nТеперь вы можете привязать её к проекту в разделе «Проекты».",
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
    replyMarkup: buildLeadsKeyboard(projectId, bundle.leads.leads, status),
  });
};

const sendLeadDetail = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  leadId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const lead = bundle.leads.leads.find((entry) => entry.id === leadId);
  if (!lead) {
    await sendTelegramMessage(ctx.token, { chatId, text: "Лид не найден." });
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildLeadDetailMessage(bundle.project, lead),
    replyMarkup: buildLeadDetailKeyboard(projectId, leadId, lead.status),
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

const EXPORT_LABELS: Record<"leads" | "campaigns" | "payments", string> = {
  leads: "лидов",
  campaigns: "кампаний",
  payments: "оплат",
};

const buildExportFilename = (projectId: string, type: string): string => {
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${projectId}-${type}-${safeTimestamp}.csv`;
};

const sendCsvExport = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  type: "leads" | "campaigns" | "payments",
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  let rows: string[][] = [];
  switch (type) {
    case "leads": {
      rows = [
        ["id", "name", "phone", "created_at", "status", "campaign"],
        ...bundle.leads.leads.map((lead) => [
          lead.id,
          lead.name,
          lead.phone,
          lead.createdAt,
          lead.status,
          lead.campaignName,
        ]),
      ];
      break;
    }
    case "campaigns": {
      rows = [
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
      ];
      break;
    }
    case "payments": {
      rows = [
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
      ];
      break;
    }
  }

  const csv = buildCsv(rows);
  const filename = buildExportFilename(bundle.project.id, type);
  const caption = `Вот ваш экспорт ${EXPORT_LABELS[type]} в формате CSV.`;

  await sendTelegramDocument(ctx.token, {
    chatId,
    filename,
    content: csv,
    caption,
    replyMarkup: buildProjectActionsKeyboard(projectId),
    contentType: "text/csv",
  });
};

const sendAnalyticsOverview = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const overview = await loadAnalyticsOverview(ctx.kv, ctx.r2, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildAnalyticsOverviewMessage(overview),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const sendUsersOverview = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const projects = await loadUserProjects(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildUsersMessage(projects, ctx.adminIds, userId),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const sendFinanceOverview = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const finance = await loadFinanceOverview(ctx.kv, ctx.r2, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildFinanceOverviewMessage(finance),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const sendWebhookStatus = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const info = await getWebhookInfo(ctx.token);
  const suffix = ctx.telegramSecret ? `?secret=${ctx.telegramSecret}` : "";
  const expectedUrl = ctx.workerBaseUrl ? `${ctx.workerBaseUrl}/tg-webhook${suffix}` : `/tg-webhook${suffix}`;
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildWebhookStatusMessage({
      currentUrl: info?.url ?? null,
      expectedUrl,
      pendingUpdates: info?.pending_update_count ?? 0,
      lastError: info?.last_error_message ?? null,
      lastErrorDate: info?.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : null,
    }),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const sendSettingsScreen = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const settings = await getUserSettingsRecord(ctx.kv, userId, { timezone: ctx.defaultTimezone, language: "ru" });
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildSettingsMessage(settings),
    replyMarkup: buildSettingsKeyboard(settings),
  });
};

const sendChatInfoScreen = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildChatInfoMessage(bundle.project),
    replyMarkup: buildChatInfoKeyboard(projectId, Boolean(bundle.project.chatId)),
  });
};

const sendChatChangeScreen = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const chats = await listAvailableProjectChats(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildChatChangeMessage(bundle.project, chats),
    replyMarkup: buildChatChangeKeyboard(projectId, chats),
  });
};

const sendAutoreportsScreen = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildAutoreportsMessage(bundle.project, bundle.autoreports),
    replyMarkup: buildAutoreportsKeyboard(projectId, bundle.autoreports),
  });
};

const sendAlertsScreen = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildAlertsMessage(bundle.project, bundle.alerts),
    replyMarkup: buildAlertsKeyboard(projectId, bundle.alerts),
  });
};

const sendKpiScreen = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildKpiMessage(bundle.project),
    replyMarkup: buildKpiKeyboard(projectId),
  });
};

const sendProjectEditScreen = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildProjectEditMessage(bundle.project),
    replyMarkup: buildProjectEditKeyboard(projectId),
  });
};

const sendDeleteConfirm = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildDeleteConfirmationMessage(bundle.project),
    replyMarkup: buildDeleteConfirmKeyboard(projectId),
  });
};

const updateProject = async (
  ctx: BotContext,
  projectId: string,
  update: (record: ProjectRecord) => void,
): Promise<ProjectRecord> => {
  const project = await requireProjectRecord(ctx.kv, projectId);
  const next: ProjectRecord = {
    ...project,
    settings: {
      ...project.settings,
      kpi: { ...project.settings.kpi },
    },
  };
  update(next);
  await putProjectRecord(ctx.kv, next);
  return next;
};

const buildFacebookConnectKeyboard = (ctx: BotContext, userId: number) => {
  const authUrl = ctx.getFacebookOAuthUrl(userId) ?? ctx.facebookAuthGuideUrl ?? FACEBOOK_AUTH_GUIDE_FALLBACK;
  return {
    inline_keyboard: [
      [{ text: "🔗 Открыть авторизацию Facebook", url: authUrl }],
      [{ text: "✏️ Ввести токен вручную", callback_data: "auth:manual" }],
      [{ text: "⬅️ Назад", callback_data: "project:menu" }],
    ],
  } as const;
};

const buildFacebookAuthKeyboard = (ctx: BotContext, userId: number) => {
  const authUrl = ctx.getFacebookOAuthUrl(userId);
  const fallbackUrl = ctx.facebookAuthGuideUrl ?? FACEBOOK_AUTH_GUIDE_FALLBACK;
  return {
    inline_keyboard: [
      [{ text: "🔄 Обновить токен", url: authUrl ?? fallbackUrl }],
      [{ text: "📦 Список рекламных аккаунтов", callback_data: "auth:accounts" }],
      [{ text: "✏️ Ввести токен вручную", callback_data: "auth:manual" }],
      [{ text: "⬅️ Назад", callback_data: "project:menu" }],
    ],
  } as const;
};

const formatAdAccounts = (accounts: FbAuthRecord["adAccounts"]): string => {
  if (accounts.length === 0) {
    return "⚠️ Рекламные аккаунты не найдены. Проверьте права доступа в Meta.";
  }
  return [
    "Доступные рекламные аккаунты:",
    ...accounts.map((account, index) => `${index + 1}. ${account.name} (${account.id}) — ${account.currency}`),
  ].join("\n");
};

const sendMetaAccountsList = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const record = await getFbAuthRecord(ctx.kv, userId);
  if (!record) {
    const oauthUrl = ctx.getFacebookOAuthUrl(userId) ?? ctx.facebookAuthGuideUrl ?? FACEBOOK_AUTH_GUIDE_FALLBACK;
    await sendTelegramMessage(ctx.token, {
      chatId,
      text:
        "⚠️ Facebook не подключён. Нажмите «Авторизация Facebook», чтобы пройти авторизацию." +
        `\nСсылка: ${oauthUrl}`,
      replyMarkup: ctx.buildMenuKeyboard(userId),
    });
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: formatAdAccounts(record.adAccounts),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const handleFacebookAuth = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const record = await getFbAuthRecord(ctx.kv, userId);
  if (!record) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text:
        "👣 Шаг 1. Авторизация Facebook\nПерейдите по ссылке ниже, подтвердите доступ и вернитесь в бот." +
        "\nЕсли у вас уже есть токен — просто отправьте его сообщением.",
      replyMarkup: buildFacebookConnectKeyboard(ctx, userId),
    });
    return;
  }
  await sendTelegramMessage(ctx.token, {
    chatId,
    text:
      `✅ Facebook уже подключён.\nАккаунт: <b>${record.userId}</b>\n` +
      `Токен действителен до: <b>${record.expiresAt}</b>\n` +
      "Используйте кнопки ниже для обновления или проверки подключения.",
    replyMarkup: buildFacebookAuthKeyboard(ctx, userId),
  });
};

const handleFacebookTokenInput = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  tokenValue: string,
): Promise<void> => {
  try {
    const trimmed = tokenValue.trim();
    const accounts = await fetchFacebookAdAccounts(trimmed);
    const expiresAt = addDaysIso(todayIsoDate(), 90);
    await putFbAuthRecord(ctx.kv, {
      userId,
      accessToken: trimmed,
      expiresAt: `${expiresAt}T00:00:00.000Z`,
      adAccounts: accounts,
    });
    const accountLines = ["", formatAdAccounts(accounts)];
    await sendTelegramMessage(ctx.token, {
      chatId,
      text:
        "✅ Facebook подключён. Аккаунт сохранён, можно возвращаться к проектам." +
        accountLines.join("\n"),
      replyMarkup: ctx.buildMenuKeyboard(userId),
    });
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text:
        "Не удалось сохранить токен Facebook: " +
        (error instanceof Error ? error.message : "неизвестная ошибка"),
    });
  }
};

const resolveChatInput = async (
  ctx: BotContext,
  input: string,
): Promise<{ id: number; title?: string; type: string }> => {
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return { id: Number(trimmed), type: "group" };
  }
  const cMatch = trimmed.match(/t\.me\/c\/(\d+)/i);
  if (cMatch) {
    return { id: Number(`-100${cMatch[1]}`), type: "supergroup" };
  }
  const usernameMatch = trimmed.match(/(?:@|t\.me\/)([A-Za-z0-9_]+)/i);
  const identifier = usernameMatch ? `@${usernameMatch[1]}` : trimmed;
  const info = await getTelegramChatInfo(ctx.token, identifier);
  if (!info) {
    throw new Error("Не удалось получить данные о чате. Убедитесь, что бот добавлен в группу.");
  }
  return { id: info.id, title: info.title ?? undefined, type: info.type };
};

const handleChatManualInput = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
  input: string,
): Promise<void> => {
  try {
    const chat = await resolveChatInput(ctx, input);
    const freeChat = await getFreeChatRecord(ctx.kv, chat.id);
    if (!freeChat || freeChat.ownerId !== userId) {
      await sendTelegramMessage(ctx.token, {
        chatId,
        text: "Чат не найден среди зарегистрированных. Отправьте команду /reg в группе и повторите попытку.",
      });
      return;
    }
    await setProjectChatBinding(ctx, projectId, { chatId: freeChat.chatId, chatTitle: freeChat.chatTitle });
    await recordKnownChat(ctx.kv, chat);
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `✅ Чат-группа обновлена: ID ${chat.id}.`,
    });
    await sendChatInfoScreen(ctx, chatId, projectId);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось привязать чат: ${(error as Error).message}`,
    });
  }
};

const handleChatSelect = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  projectId: string,
  selectedChatId: number,
): Promise<void> => {
  const freeChat = await getFreeChatRecord(ctx.kv, selectedChatId);
  if (!freeChat || freeChat.ownerId !== userId) {
    await sendTelegramMessage(ctx.token, { chatId, text: buildChatAlreadyUsedMessage() });
    return;
  }
  await setProjectChatBinding(ctx, projectId, { chatId: freeChat.chatId, chatTitle: freeChat.chatTitle });
  await sendTelegramMessage(ctx.token, { chatId, text: `✅ Чат привязан: ${selectedChatId}` });
  await sendChatInfoScreen(ctx, chatId, projectId);
};

const handleChatUnlink = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  await setProjectChatBinding(ctx, projectId, null);
  await sendTelegramMessage(ctx.token, { chatId, text: "✅ Чат успешно отвязан от проекта." });
  await sendChatInfoScreen(ctx, chatId, projectId);
};

const handleAutoreportsToggle = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAutoreportsRecord(ctx.kv, projectId, { ...bundle.autoreports, enabled: !bundle.autoreports.enabled });
  await sendAutoreportsScreen(ctx, chatId, projectId);
};

const handleAutoreportsTimeInput = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  timeInput: string,
): Promise<void> => {
  const match = timeInput.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    await sendTelegramMessage(ctx.token, { chatId, text: "Введите время в формате HH:MM" });
    return;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    await sendTelegramMessage(ctx.token, { chatId, text: "Некорректное время." });
    return;
  }
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAutoreportsRecord(ctx.kv, projectId, { ...bundle.autoreports, time: `${match[1]}:${match[2]}` });
  await sendAutoreportsScreen(ctx, chatId, projectId);
};

const handleAutoreportsRouteSet = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  route: AutoreportsRecord["sendTo"],
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAutoreportsRecord(ctx.kv, projectId, { ...bundle.autoreports, sendTo: route });
  await sendAutoreportsScreen(ctx, chatId, projectId);
};

const handleAlertsToggle = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAlertsRecord(ctx.kv, projectId, { ...bundle.alerts, enabled: !bundle.alerts.enabled });
  await sendAlertsScreen(ctx, chatId, projectId);
};

const handleAlertsRouteSet = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  channel: AlertsRecord["channel"],
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAlertsRecord(ctx.kv, projectId, { ...bundle.alerts, channel });
  await sendAlertsScreen(ctx, chatId, projectId);
};

const handleAlertsTypeToggle = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  key: keyof AlertsRecord["types"],
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAlertsRecord(ctx.kv, projectId, {
    ...bundle.alerts,
    types: { ...bundle.alerts.types, [key]: !bundle.alerts.types[key] },
  });
  await sendAlertsScreen(ctx, chatId, projectId);
};

const handleKpiModeChange = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  mode: ProjectRecord["settings"]["kpi"]["mode"],
): Promise<void> => {
  await updateProject(ctx, projectId, (project) => {
    project.settings.kpi.mode = mode;
  });
  await sendKpiScreen(ctx, chatId, projectId);
};

const handleKpiTypeChange = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  type: ProjectRecord["settings"]["kpi"]["type"],
): Promise<void> => {
  await updateProject(ctx, projectId, (project) => {
    project.settings.kpi.type = type;
    switch (type) {
      case "LEAD":
        project.settings.kpi.label = "Лиды";
        break;
      case "MESSAGE":
        project.settings.kpi.label = "Сообщения";
        break;
      case "CLICK":
        project.settings.kpi.label = "Клики";
        break;
      case "VIEW":
        project.settings.kpi.label = "Просмотры";
        break;
      case "PURCHASE":
        project.settings.kpi.label = "Покупки";
        break;
      default:
        break;
    }
  });
  await sendKpiScreen(ctx, chatId, projectId);
};

const cleanupProjectData = async (ctx: BotContext, projectId: string): Promise<void> => {
  await ctx.kv.delete(KV_KEYS.billing(projectId));
  await ctx.kv.delete(KV_KEYS.autoreports(projectId));
  await ctx.kv.delete(KV_KEYS.alerts(projectId));

  const deletePrefix = async (prefix: string): Promise<void> => {
    let cursor: string | undefined;
    do {
      const { objects, cursor: nextCursor } = await ctx.r2.list(prefix, { cursor, limit: 100 });
      for (const object of objects) {
        await ctx.r2.delete(object.key);
      }
      cursor = nextCursor;
    } while (cursor);
  };

  await ctx.r2.delete(R2_KEYS.projectLeadsList(projectId));
  await deletePrefix(`project-leads/${projectId}/`);
  await ctx.r2.delete(R2_KEYS.metaCampaigns(projectId));
  await ctx.r2.delete(R2_KEYS.paymentsHistory(projectId));
  await deletePrefix(`payments/${projectId}/`);
};

const handleProjectDelete = async (ctx: BotContext, chatId: number, projectId: string, userId: number): Promise<void> => {
  const project = await requireProjectRecord(ctx.kv, projectId);
  const membership = await getProjectsByUser(ctx.kv, userId);
  if (project.chatId) {
    await releaseChatOccupancy(ctx, project.chatId, project.ownerId);
  }
  await deleteProjectRecord(ctx.kv, projectId);
  await cleanupProjectData(ctx, projectId);
  if (membership) {
    await putProjectsByUser(ctx.kv, userId, {
      projects: membership.projects.filter((id) => id !== projectId),
    });
  }
  await sendTelegramMessage(ctx.token, { chatId, text: "✅ Проект удалён." });
  await sendExistingProjectsList(ctx, chatId, userId);
};

const handleLeadStatusChange = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  leadId: string,
  status: ProjectLeadsListRecord["leads"][number]["status"],
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const leads = bundle.leads.leads.map((lead) => (lead.id === leadId ? { ...lead, status } : lead));
  await putProjectLeadsList(ctx.r2, projectId, { ...bundle.leads, leads });
  try {
    const detail = await getLeadDetailRecord(ctx.r2, projectId, leadId);
    await putLeadDetailRecord(ctx.r2, projectId, { ...detail, status });
  } catch {
    // ignore missing detail
  }
  await sendLeadDetail(ctx, chatId, projectId, leadId);
};

const handleSettingsChange = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  patch: Partial<UserSettingsRecord>,
): Promise<void> => {
  await updateUserSettingsRecord(ctx.kv, userId, patch, { timezone: ctx.defaultTimezone, language: "ru" });
  await sendSettingsScreen(ctx, chatId, userId);
};

const buildChatUnlinkKeyboard = (projectId: string) => ({
  inline_keyboard: [
    [{ text: "✅ Да, отвязать", callback_data: `project:chat-unlink-confirm:${projectId}` }],
    [{ text: "⬅️ Отмена", callback_data: `project:chat:${projectId}` }],
  ],
});

const sendChatUnlinkConfirm = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text:
      `Вы уверены, что хотите отвязать чат от проекта <b>${escapeHtml(bundle.project.name)}</b>?\n` +
      "Лиды, отчёты и алерты перестанут отправляться в этот чат.",
    replyMarkup: buildChatUnlinkKeyboard(projectId),
  });
};

const handleTextCommand = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  text: string,
): Promise<void> => {
  switch (text) {
    case "/start":
    case "Меню":
      await sendMenu(ctx, chatId, userId);
      return;
    case "Авторизация Facebook":
      await handleFacebookAuth(ctx, chatId, userId);
      return;
    case "Meta-аккаунты":
      await sendMetaAccountsList(ctx, chatId, userId);
      return;
    case "Проекты":
      await sendProjectsEntry(ctx, chatId, userId);
      return;
    case "Аналитика":
      await sendAnalyticsOverview(ctx, chatId, userId);
      return;
    case "Пользователи":
      await sendUsersOverview(ctx, chatId, userId);
      return;
    case "Финансы":
      await sendFinanceOverview(ctx, chatId, userId);
      return;
    case "Вебхуки Telegram":
      await sendWebhookStatus(ctx, chatId, userId);
      return;
    case "Настройки":
      await sendSettingsScreen(ctx, chatId, userId);
      return;
    default:
      await sendMenu(ctx, chatId, userId);
  }
};

const handleCallback = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  data: string,
): Promise<void> => {
  const parts = data.split(":");
  const scope = parts[0];
  switch (scope) {
    case "project": {
      const action = parts[1];
      switch (action) {
        case "card":
          await sendProjectCard(ctx, chatId, parts[2]!);
          break;
        case "list":
          await sendExistingProjectsList(ctx, chatId, userId);
          break;
        case "menu":
          await sendMenu(ctx, chatId, userId);
          break;
        case "add":
          await handleProjectAccountSelect(ctx, chatId, userId, parts[2]!);
          break;
        case "bind":
          await handleProjectBind(ctx, chatId, userId, parts[2]!, Number(parts[3]));
          break;
        case "bind-manual":
          await saveBotSession(ctx.kv, {
            userId,
            state: { type: "project:create-manual", accountId: parts[2]! },
            updatedAt: new Date().toISOString(),
          });
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: "Пришлите ссылку, @username или ID зарегистрированного чата.",
          });
          break;
        case "billing":
          await sendBillingView(ctx, chatId, parts[2]!);
          break;
        case "leads":
          await sendLeadsSection(ctx, chatId, parts[3]!, parts[2]! as ProjectLeadsListRecord["leads"][number]["status"]);
          break;
        case "report":
          await sendReport(ctx, chatId, parts[2]!);
          break;
        case "campaigns":
          await sendCampaigns(ctx, chatId, parts[2]!);
          break;
        case "portal":
          await sendPortalLink(ctx, chatId, parts[2]!);
          break;
        case "export":
          await sendExportMenu(ctx, chatId, parts[2]!);
          break;
        case "export-leads":
          await sendCsvExport(ctx, chatId, parts[2]!, "leads");
          break;
        case "export-campaigns":
          await sendCsvExport(ctx, chatId, parts[2]!, "campaigns");
          break;
        case "export-payments":
          await sendCsvExport(ctx, chatId, parts[2]!, "payments");
          break;
        case "chat":
          await sendChatInfoScreen(ctx, chatId, parts[2]!);
          break;
        case "chat-change":
          await sendChatChangeScreen(ctx, chatId, userId, parts[2]!);
          break;
        case "chat-manual":
          await saveBotSession(ctx.kv, {
            userId,
            state: { type: "chat:manual", projectId: parts[2]! },
            updatedAt: new Date().toISOString(),
          });
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: "Пришлите ссылку, @username или ID чата",
          });
          break;
        case "chat-select":
          await handleChatSelect(ctx, chatId, userId, parts[2]!, Number(parts[3]));
          break;
        case "chat-unlink":
          await sendChatUnlinkConfirm(ctx, chatId, parts[2]!);
          break;
        case "chat-unlink-confirm":
          await handleChatUnlink(ctx, chatId, parts[2]!);
          break;
        case "autoreports":
          await sendAutoreportsScreen(ctx, chatId, parts[2]!);
          break;
        case "autoreports-toggle":
          await handleAutoreportsToggle(ctx, chatId, parts[2]!);
          break;
        case "autoreports-time":
          await saveBotSession(ctx.kv, {
            userId,
            state: { type: "autoreports:set-time", projectId: parts[2]! },
            updatedAt: new Date().toISOString(),
          });
          await sendTelegramMessage(ctx.token, { chatId, text: "Введите время HH:MM" });
          break;
        case "autoreports-route":
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: "Кому отправлять отчёты",
            replyMarkup: buildAutoreportsRouteKeyboard(parts[2]!),
          });
          break;
        case "autoreports-send":
          await handleAutoreportsRouteSet(ctx, chatId, parts[2]!, parts[3]! as AutoreportsRecord["sendTo"]);
          break;
        case "alerts":
          await sendAlertsScreen(ctx, chatId, parts[2]!);
          break;
        case "alerts-toggle":
          await handleAlertsToggle(ctx, chatId, parts[2]!);
          break;
        case "alerts-route":
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: "Выберите маршрут доставки алертов",
            replyMarkup: buildAlertsRouteKeyboard(parts[2]!),
          });
          break;
        case "alerts-route-set":
          await handleAlertsRouteSet(ctx, chatId, parts[2]!, parts[3]! as AlertsRecord["channel"]);
          break;
        case "alerts-type": {
          const typeKeyMap: Record<string, keyof AlertsRecord["types"]> = {
            lead: "leadInQueue",
            pause: "pause24h",
            payment: "paymentReminder",
          };
          await handleAlertsTypeToggle(ctx, chatId, parts[2]!, typeKeyMap[parts[3]!] ?? "leadInQueue");
          break;
        }
        case "kpi":
          await sendKpiScreen(ctx, chatId, parts[2]!);
          break;
        case "kpi-mode":
          await handleKpiModeChange(ctx, chatId, parts[2]!, parts[3]! as ProjectRecord["settings"]["kpi"]["mode"]);
          break;
        case "kpi-type":
          await handleKpiTypeChange(ctx, chatId, parts[2]!, parts[3]! as ProjectRecord["settings"]["kpi"]["type"]);
          break;
        case "edit":
          await sendProjectEditScreen(ctx, chatId, parts[2]!);
          break;
        case "edit-name":
        case "edit-ad":
        case "edit-owner":
          await saveBotSession(ctx.kv, {
            userId,
            state: {
              type: "project:edit",
              projectId: parts[2]!,
              field: action === "edit-name" ? "name" : action === "edit-ad" ? "ad" : "owner",
            },
            updatedAt: new Date().toISOString(),
          });
          await sendTelegramMessage(ctx.token, {
            chatId,
            text:
              action === "edit-owner"
                ? "Введите ID владельца"
                : action === "edit-ad"
                  ? "Введите ID рекламного кабинета"
                  : "Введите новое название проекта",
          });
          break;
        case "delete":
          await sendDeleteConfirm(ctx, chatId, parts[2]!);
          break;
        case "delete-confirm":
          await handleProjectDelete(ctx, chatId, parts[2]!, userId);
          break;
        default:
          break;
      }
      break;
    }
    case "billing": {
      const action = parts[1];
      const projectId = parts[2]!;
      if (action === "add30") {
        await handleBillingAdd30(ctx, chatId, projectId);
      } else if (action === "tariff") {
        await handleBillingTariff(ctx, chatId, projectId, Number(parts[3]));
      } else if (action === "set-date") {
        await saveBotSession(ctx.kv, {
          userId,
          state: { type: "billing:set-date", projectId },
          updatedAt: new Date().toISOString(),
        });
        await sendTelegramMessage(ctx.token, { chatId, text: "Введите дату YYYY-MM-DD или DD.MM.YYYY" });
      } else if (action === "manual") {
        await saveBotSession(ctx.kv, {
          userId,
          state: { type: "billing:manual", projectId },
          updatedAt: new Date().toISOString(),
        });
        await sendTelegramMessage(ctx.token, { chatId, text: "Введите сумму и дату, пример: '500 2025-12-15'" });
      }
      break;
    }
    case "lead": {
      const action = parts[1];
      if (action === "view") {
        await sendLeadDetail(ctx, chatId, parts[2]!, parts[3]!);
      } else if (action === "status") {
        await handleLeadStatusChange(
          ctx,
          chatId,
          parts[2]!,
          parts[3]!,
          parts[4]! as ProjectLeadsListRecord["leads"][number]["status"],
        );
      }
      break;
    }
    case "auth": {
      if (parts[1] === "refresh") {
        await saveBotSession(ctx.kv, {
          userId,
          state: { type: "facebook:token" },
          updatedAt: new Date().toISOString(),
        });
        await sendTelegramMessage(ctx.token, { chatId, text: "Пришлите новый токен Facebook." });
      } else if (parts[1] === "accounts") {
        const record = await getFbAuthRecord(ctx.kv, userId);
        if (!record) {
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: "⚠️ Токен не найден. Нажмите «🔄 Обновить токен» и отправьте новый код.",
          });
          return;
        }
        try {
          const accounts = await fetchFacebookAdAccounts(record.accessToken);
          await putFbAuthRecord(ctx.kv, { ...record, adAccounts: accounts });
          await sendTelegramMessage(ctx.token, {
            chatId,
            text: formatAdAccounts(accounts),
          });
        } catch (error) {
          await sendTelegramMessage(ctx.token, {
            chatId,
            text:
              "Не удалось загрузить рекламные аккаунты: " +
              (error instanceof Error ? error.message : "неизвестная ошибка"),
          });
        }
      } else if (parts[1] === "manual") {
        await saveBotSession(ctx.kv, {
          userId,
          state: { type: "facebook:token" },
          updatedAt: new Date().toISOString(),
        });
        await sendTelegramMessage(ctx.token, {
          chatId,
          text: "Пришлите новый токен Facebook.",
        });
      }
      break;
    }
    case "settings": {
      const target = parts[1];
      if (target === "language") {
        await handleSettingsChange(ctx, chatId, userId, { language: parts[2]! });
      } else if (target === "tz") {
        await handleSettingsChange(ctx, chatId, userId, { timezone: parts[2]! });
      }
      break;
    }
    case "cmd": {
      const action = parts[1];
      switch (action) {
        case "menu":
          await sendMenu(ctx, chatId, userId);
          break;
        case "auth":
          await handleFacebookAuth(ctx, chatId, userId);
          break;
        case "projects":
          await sendProjectsEntry(ctx, chatId, userId);
          break;
        case "analytics":
          await sendAnalyticsOverview(ctx, chatId, userId);
          break;
        case "users":
          await sendUsersOverview(ctx, chatId, userId);
          break;
        case "finance":
          await sendFinanceOverview(ctx, chatId, userId);
          break;
        case "settings":
          await sendSettingsScreen(ctx, chatId, userId);
          break;
        case "meta":
          await sendMetaAccountsList(ctx, chatId, userId);
          break;
        case "webhooks":
          await sendWebhookStatus(ctx, chatId, userId);
          break;
        default:
          await sendMenu(ctx, chatId, userId);
          break;
      }
      break;
    }
    default:
      break;
  }
};

const createTelegramBotController = (options: CreateTelegramBotControllerOptions) => {
  const workerBaseUrl = normaliseBaseUrl(options.workerUrl, DEFAULT_WORKER_DOMAIN);
  const facebookAuthGuideUrl = workerBaseUrl ? `${workerBaseUrl}/fb-auth` : FACEBOOK_AUTH_GUIDE_FALLBACK;
  const buildFacebookOAuthUrl = (userId: number): string | null => {
    if (!workerBaseUrl || !Number.isFinite(userId)) {
      return null;
    }
    const url = new URL(`${workerBaseUrl}/api/meta/oauth/start`);
    url.searchParams.set("tid", String(userId));
    return url.toString();
  };
  const ctx: BotContext = {
    ...options,
    workerBaseUrl,
    facebookAuthGuideUrl,
    buildMenuKeyboard: (userId: number) => {
      const authUrl = buildFacebookOAuthUrl(userId) ?? facebookAuthGuideUrl ?? FACEBOOK_AUTH_GUIDE_FALLBACK;
      return buildMainMenuKeyboard({ facebookAuthUrl: authUrl });
    },
    getFacebookOAuthUrl: (userId: number) => buildFacebookOAuthUrl(userId),
  };

  return {
    handleUpdate: async (update: TelegramUpdate): Promise<void> => {
      const userId = extractUserId(update);
      const chatId = extractChatId(update);
      if (userId == null || chatId == null) {
        return;
      }
      const chatType = update.message?.chat?.type ?? update.callback_query?.message?.chat?.type ?? "private";
      const isGroupChat = chatType === "group" || chatType === "supergroup";
      if (isGroupChat && update.message?.text) {
        const text = update.message.text.trim();
        if (text.startsWith("/reg")) {
          await handleGroupRegistration(ctx, update.message.chat, userId);
        }
        return;
      }
      await recordChatFromUpdate(ctx, update);

      if (update.message?.text) {
        const session = await getBotSession(ctx.kv, userId);
        if (await handleSessionInput(ctx, chatId, userId, update.message.text, session)) {
          return;
        }
        await handleTextCommand(ctx, chatId, userId, update.message.text.trim());
        return;
      }

      if (update.callback_query?.data) {
        await handleCallback(ctx, chatId, userId, update.callback_query.data);
        if (update.callback_query.id) {
          await answerCallbackQuery(ctx.token, { id: update.callback_query.id });
        }
      }
    },
  };
};

export { createTelegramBotController };

const handleSessionInput = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  text: string,
  sessionState: Awaited<ReturnType<typeof getBotSession>>,
): Promise<boolean> => {
  if (!sessionState || !sessionState.state || sessionState.state.type === "idle") {
    return false;
  }
  switch (sessionState.state.type) {
    case "billing:set-date":
      await handleBillingDateInput(ctx, chatId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "billing:manual":
      await handleBillingManualInput(ctx, chatId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "facebook:token":
      await handleFacebookTokenInput(ctx, chatId, userId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "project:edit":
      await handleProjectEditInput(ctx, chatId, sessionState.state.projectId, sessionState.state.field, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "project:create-manual":
      await handleProjectManualBindInput(ctx, chatId, userId, sessionState.state.accountId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "chat:manual":
      await handleChatManualInput(ctx, chatId, userId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    case "autoreports:set-time":
      await handleAutoreportsTimeInput(ctx, chatId, sessionState.state.projectId, text);
      await clearBotSession(ctx.kv, userId);
      return true;
    default:
      return false;
  }
};

const handleProjectEditInput = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  field: "name" | "ad" | "owner",
  value: string,
): Promise<void> => {
  const trimmed = value.trim();
  if (field === "owner") {
    const ownerId = Number(trimmed);
    if (!Number.isFinite(ownerId)) {
      await sendTelegramMessage(ctx.token, { chatId, text: "ID владельца должен быть числом." });
      return;
    }
    await updateProject(ctx, projectId, (project) => {
      project.ownerId = ownerId;
    });
  } else if (field === "ad") {
    await updateProject(ctx, projectId, (project) => {
      project.adAccountId = trimmed;
    });
  } else {
    await updateProject(ctx, projectId, (project) => {
      project.name = trimmed;
    });
  }
  await sendTelegramMessage(ctx.token, { chatId, text: "✅ Данные проекта обновлены." });
  await sendProjectEditScreen(ctx, chatId, projectId);
};

