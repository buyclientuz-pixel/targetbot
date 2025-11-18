import { parseManualBillingInput } from "./amounts";
import {
  loadAnalyticsOverview,
  loadFinanceOverview,
  loadProjectBundle,
  loadProjectListOverview,
  loadUserProjects,
  listAvailableProjectChats,
  leadStatusLabel,
} from "./data";
import {
  buildBillingKeyboard,
  buildChatBindingKeyboard,
  buildDeleteConfirmKeyboard,
  buildExportKeyboard,
  buildLeadDetailKeyboard,
  buildLeadsKeyboard,
  buildMainMenuKeyboard,
  buildProjectActionsKeyboard,
} from "./keyboards";
import {
  buildAnalyticsOverviewMessage,
  buildBillingScreenMessage,
  buildCampaignsMessage,
  buildChatAlreadyUsedMessage,
  buildChatBindingMessage,
  buildDeleteConfirmationMessage,
  buildFinanceOverviewMessage,
  buildLeadDetailMessage,
  buildLeadsMessage,
  buildMenuMessage,
  buildPortalMessage,
  buildProjectCardMessage,
  buildReportMessage,
  buildNoFreeChatsMessage,
  buildUsersMessage,
  buildWebhookStatusMessage,
} from "./messages";
import { addDaysIso, parseDateInput, todayIsoDate } from "./dates";
import { renderPanel } from "./panel-engine";
import type { TelegramUpdate } from "./types";

import { KV_KEYS, KV_PREFIXES } from "../config/kv";
import { R2_KEYS } from "../config/r2";
import { clearBotSession, getBotSession, saveBotSession, type BotSession } from "../domain/bot-sessions";
import { recordKnownChat } from "../domain/chat-registry";
import {
  deleteFreeChatRecord,
  getFreeChatRecord,
  getOccupiedChatRecord,
  putFreeChatRecord,
  putOccupiedChatRecord,
  type FreeChatRecord,
} from "../domain/project-chats";
import { appendPaymentRecord, type PaymentRecord } from "../domain/spec/payments-history";
import { putBillingRecord } from "../domain/spec/billing";
import { getFbAuthRecord, putFbAuthRecord, type FbAuthRecord } from "../domain/spec/fb-auth";
import { putAutoreportsRecord, type AutoreportsRecord } from "../domain/spec/autoreports";
import {
  getLeadDetailRecord,
  putLeadDetailRecord,
  putProjectLeadsList,
  type ProjectLeadsListRecord,
} from "../domain/spec/project-leads";
import {
  putProjectRecord,
  requireProjectRecord,
  getProjectRecord,
  type ProjectRecord,
} from "../domain/spec/project";
import { getProjectsByUser, putProjectsByUser } from "../domain/spec/projects-by-user";
import { getUserSettingsRecord, updateUserSettingsRecord, type UserSettingsRecord } from "../domain/spec/user-settings";
import { ensureProjectSettings, upsertProjectSettings } from "../domain/project-settings";
import { deletePortalSyncState } from "../domain/portal-sync";
import type { KvClient } from "../infra/kv";
import type { R2Client } from "../infra/r2";
import {
  answerCallbackQuery,
  getTelegramChatInfo,
  getWebhookInfo,
  sendTelegramDocument,
  sendTelegramMessage,
  TelegramError,
} from "../services/telegram";
import { fetchFacebookAdAccounts, fetchFacebookProfile } from "../services/facebook-auth";
import { deleteProjectCascade, releaseProjectChat } from "../services/project-lifecycle";
import { PORTAL_PERIOD_KEYS, syncPortalMetrics, type PortalSyncResult } from "../services/portal-sync";
import { sendAutoReportNow } from "../services/auto-reports";
import { translateMetaObjective } from "../services/meta-objectives";
import { syncProjectMetaAccount, syncUserProjectsMetaAccount } from "../services/project-meta";
import { upsertMetaTokenRecord } from "../domain/meta-tokens";
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

const buildPanelRuntime = (ctx: BotContext) => ({
  kv: ctx.kv,
  r2: ctx.r2,
  workerUrl: ctx.workerBaseUrl,
  defaultTimezone: ctx.defaultTimezone,
  getFacebookOAuthUrl: ctx.getFacebookOAuthUrl,
  telegramToken: ctx.token,
  telegramSecret: ctx.telegramSecret,
  adminIds: ctx.adminIds,
});

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

const buildDefaultAutoreportsRecord = (): AutoreportsRecord => ({
  enabled: false,
  time: "10:00",
  mode: "yesterday_plus_week",
  sendToChat: true,
  sendToAdmin: false,
});

const addProjectToUserMembership = async (ctx: BotContext, userId: number, projectId: string): Promise<void> => {
  const membership = (await getProjectsByUser(ctx.kv, userId)) ?? { projects: [] };
  const nextProjects = [projectId, ...membership.projects.filter((id) => id !== projectId)];
  await putProjectsByUser(ctx.kv, userId, { projects: nextProjects });
};

interface ProjectChatBinding {
  chatId: number;
  chatTitle: string | null;
  topicId: number | null;
}

const reserveChatForProject = async (
  ctx: BotContext,
  project: ProjectRecord,
  chat: ProjectChatBinding,
): Promise<void> => {
  await deleteFreeChatRecord(ctx.kv, chat.chatId);
  await putOccupiedChatRecord(ctx.kv, {
    chatId: chat.chatId,
    chatTitle: chat.chatTitle,
    topicId: chat.topicId,
    ownerId: project.ownerId,
    projectId: project.id,
    projectName: project.name,
    boundAt: new Date().toISOString(),
  });
};

const syncProjectChatSettings = async (
  ctx: BotContext,
  projectId: string,
  chat: { chatId: number | null; topicId: number | null },
): Promise<void> => {
  const settings = await ensureProjectSettings(ctx.kv, projectId);
  if (settings.chatId === chat.chatId && settings.topicId === chat.topicId) {
    return;
  }
  await upsertProjectSettings(ctx.kv, {
    ...settings,
    chatId: chat.chatId,
    topicId: chat.topicId,
    updatedAt: new Date().toISOString(),
  });
};

const createProjectFromAccount = async (
  ctx: BotContext,
  userId: number,
  account: FbAuthRecord["adAccounts"][number],
  chat: ProjectChatBinding,
  fbAuth: FbAuthRecord,
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
  await putAutoreportsRecord(ctx.kv, projectId, buildDefaultAutoreportsRecord());
  await reserveChatForProject(ctx, project, chat);
  await syncProjectChatSettings(ctx, projectId, { chatId: chat.chatId, topicId: chat.topicId });
  await syncProjectMetaAccount(ctx.kv, projectId, fbAuth.facebookUserId ?? null);
  return project;
};

const setProjectChatBinding = async (
  ctx: BotContext,
  projectId: string,
  chat: ProjectChatBinding | null,
): Promise<void> => {
  const current = await requireProjectRecord(ctx.kv, projectId);
  if (current.chatId && (!chat || current.chatId !== chat.chatId)) {
    await releaseProjectChat(ctx.kv, current.chatId, current.ownerId);
  }
  const updated = await updateProject(ctx, projectId, (project) => {
    project.chatId = chat ? chat.chatId : null;
  });
  if (chat) {
    await reserveChatForProject(ctx, updated, chat);
  }
  await syncProjectChatSettings(ctx, projectId, {
    chatId: chat ? chat.chatId : null,
    topicId: chat ? chat.topicId : null,
  });
};

const sendMenu = async (ctx: BotContext, chatId: number, userId: number): Promise<void> => {
  const fbAuth = await getFbAuthRecord(ctx.kv, userId);
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: buildMenuMessage({ fbAuth }),
    replyMarkup: ctx.buildMenuKeyboard(userId),
  });
};

const renderMainPanelFromCommand = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  session?: BotSession,
): Promise<void> => {
  const currentSession = session ?? (await getBotSession(ctx.kv, userId));
  const hasPanelState = currentSession.panel != null || currentSession.state.type !== "idle";
  if (hasPanelState) {
    await saveBotSession(ctx.kv, {
      ...currentSession,
      panel: undefined,
      state: { type: "idle" },
    });
  }
  await renderPanel({ runtime, userId, chatId, panelId: "panel:main" });
};

const ensureLegacyKeyboardCleared = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  session?: BotSession,
): Promise<BotSession> => {
  const currentSession = session ?? (await getBotSession(ctx.kv, userId));
  if (currentSession.replyKeyboardCleared) {
    return currentSession;
  }
  try {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Переключаюсь на новую панель…",
      replyMarkup: { remove_keyboard: true },
    });
  } catch (error) {
    console.warn(
      `[telegram] Failed to clear legacy reply keyboard for ${userId}: ${(error as Error).message}`,
    );
  }
  const updatedSession: BotSession = { ...currentSession, replyKeyboardCleared: true };
  await saveBotSession(ctx.kv, updatedSession);
  return updatedSession;
};

const completeProjectBinding = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  account: FbAuthRecord["adAccounts"][number],
  freeChat: FreeChatRecord,
  fbAuth: FbAuthRecord,
): Promise<void> => {
  const project = await createProjectFromAccount(ctx, userId, account, freeChat, fbAuth);
  await sendTelegramMessage(ctx.token, {
    chatId: freeChat.chatId,
    messageThreadId: freeChat.topicId ?? undefined,
    text:
      `👍 Группа успешно подключена к проекту «${escapeHtml(project.name)}».\n` +
      "Теперь здесь будут приходить лиды, алерты и отчёты.",
  });
  await sendTelegramMessage(ctx.token, {
    chatId,
    text:
      "📦 Проект подключён!\n" +
      `Название: <b>${escapeHtml(project.name)}</b>\n` +
      `Рекламный аккаунт: <b>${escapeHtml(account.name || account.id)}</b>\n` +
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
  await completeProjectBinding(ctx, chatId, userId, account, freeChat, fbAuth);
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
    await completeProjectBinding(ctx, chatId, userId, account, freeChat, fbAuth);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось обработать чат: ${(error as Error).message}`,
    });
  }
};

const handleGroupRegistration = async (
  ctx: BotContext,
  message: NonNullable<TelegramUpdate["message"]>,
  userId: number,
): Promise<void> => {
  const chat = message.chat;
  if (!chat || chat.type === "private") {
    return;
  }
  const existing = await getOccupiedChatRecord(ctx.kv, chat.id);
  if (existing) {
    await sendTelegramMessage(ctx.token, {
      chatId: chat.id,
      messageThreadId: message.message_thread_id ?? undefined,
      text: "❌ Эта чат-группа уже используется другим проектом. Выберите другую.",
    });
    return;
  }
  await putFreeChatRecord(ctx.kv, {
    chatId: chat.id,
    chatTitle: chat.title ?? null,
    topicId: message.message_thread_id ?? null,
    ownerId: userId,
    registeredAt: new Date().toISOString(),
  });
  await sendTelegramMessage(ctx.token, {
    chatId: chat.id,
    messageThreadId: message.message_thread_id ?? undefined,
    text:
      "Группа зарегистрирована!\nТеперь вы можете привязать её к проекту в разделе «Проекты».",
  });
};

const handleGroupStatCommand = async (
  ctx: BotContext,
  message: NonNullable<TelegramUpdate["message"]>,
): Promise<void> => {
  const chat = message.chat;
  if (!chat || chat.type === "private") {
    return;
  }
  const projectId = await resolveProjectIdByChatId(ctx, chat.id);
  if (!projectId) {
    await sendTelegramMessage(ctx.token, {
      chatId: chat.id,
      messageThreadId: message.message_thread_id ?? undefined,
      text: "❌ Чат ещё не привязан к проекту. Используйте /reg и завершите настройку в личном кабинете.",
    });
    return;
  }
  try {
    const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
    const messageText = buildReportMessage(bundle.project, bundle.campaigns);
    await sendTelegramMessage(ctx.token, {
      chatId: chat.id,
      messageThreadId: message.message_thread_id ?? undefined,
      text: messageText,
    });
  } catch (error) {
    console.error(`[telegram] Failed to render /stat for chat ${chat.id}:`, error);
    await sendTelegramMessage(ctx.token, {
      chatId: chat.id,
      messageThreadId: message.message_thread_id ?? undefined,
      text: "⚠️ Не удалось собрать отчёт. Попробуйте позже.",
    });
  }
};

const resolveProjectIdByChatId = async (ctx: BotContext, chatId: number): Promise<string | null> => {
  try {
    const occupied = await getOccupiedChatRecord(ctx.kv, chatId);
    if (occupied?.projectId) {
      return occupied.projectId;
    }
  } catch (error) {
    console.warn(`[telegram] Failed to read occupied chat ${chatId}:`, error);
  }
  try {
    const { keys } = await ctx.kv.list(KV_PREFIXES.projects);
    for (const key of keys) {
      const projectId = key.slice(KV_PREFIXES.projects.length);
      if (!projectId) {
        continue;
      }
      try {
        const record = await getProjectRecord(ctx.kv, projectId);
        if (record?.chatId === chatId) {
          return record.id;
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.warn(`[telegram] Failed to list projects while resolving chat ${chatId}:`, error);
  }
  return null;
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
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
  message: string,
): Promise<void> => {
  await sendTelegramMessage(ctx.token, { chatId, text: message });
  await renderPanel({ runtime, userId, chatId, panelId: `project:billing:${projectId}` });
};

const handleBillingAdd30 = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await notifyBillingChange(ctx, runtime, userId, chatId, projectId, `✅ Дата следующего платежа обновлена: ${nextDate}`);
};

const handleBillingTariff = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
  tariff: number,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const updated = { ...bundle.billing, tariff };
  await putBillingRecord(ctx.kv, projectId, updated);
  await notifyBillingChange(
    ctx,
    runtime,
    userId,
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
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await notifyBillingChange(ctx, runtime, userId, chatId, projectId, `✅ Дата следующего платежа обновлена: ${parsed}`);
};

const handleBillingManualInput = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await notifyBillingChange(ctx, runtime, userId, chatId, projectId, `✅ Оплата обновлена: ${parsedDate}`);
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

const renderPortalPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: `project:portal:${projectId}` });
};

const PORTAL_SYNC_KEY_LABELS: Record<string, string> = {
  today: "сегодня",
  yesterday: "вчера",
  week: "неделя",
  month: "месяц",
  all: "всё время",
  max: "максимум",
  leads: "лиды",
};

const describePortalSyncResult = (result: PortalSyncResult): string | null => {
  const failed = result.periods.filter((entry) => !entry.ok);
  if (failed.length === 0) {
    return null;
  }
  const success = result.periods.length - failed.length;
  const total = result.periods.length;
  const issues = failed
    .map((entry) => `${PORTAL_SYNC_KEY_LABELS[entry.periodKey] ?? entry.periodKey}: ${entry.error ?? "ошибка"}`)
    .join(", ");
  return `Обновлено ${success}/${total}. Проблемы: ${issues}`;
};

const sendExportMenu = async (ctx: BotContext, chatId: number, projectId: string): Promise<void> => {
  await sendTelegramMessage(ctx.token, {
    chatId,
    text: "Экспорт данных проекта. Выберите формат:",
    replyMarkup: buildExportKeyboard(projectId),
  });
};

const handlePortalCreate = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  try {
    let project = await requireProjectRecord(ctx.kv, projectId);
    if (!project.portalUrl) {
      const portalUrl = ctx.workerBaseUrl ? `${ctx.workerBaseUrl}/p/${projectId}` : `/p/${projectId}`;
      project = { ...project, portalUrl };
      await putProjectRecord(ctx.kv, project);
      await sendTelegramMessage(ctx.token, { chatId, text: `Портал создан: ${portalUrl}` });
    }
    const settings = await ensureProjectSettings(ctx.kv, projectId);
    if (!settings.portalEnabled) {
      await upsertProjectSettings(ctx.kv, { ...settings, portalEnabled: true, updatedAt: new Date().toISOString() });
    }
    try {
      const result = await syncPortalMetrics(ctx.kv, ctx.r2, projectId, { allowPartial: true });
      const summary = describePortalSyncResult(result);
      if (summary) {
        await sendTelegramMessage(ctx.token, { chatId, text: summary });
      }
    } catch (error) {
      await sendTelegramMessage(ctx.token, {
        chatId,
        text: `Портал включён, но не удалось обновить данные: ${(error as Error).message}`,
      });
    }
  } catch (error) {
    await sendTelegramMessage(ctx.token, { chatId, text: `Не удалось создать портал: ${(error as Error).message}` });
  }
  await renderPortalPanel(runtime, userId, chatId, projectId);
};

const handlePortalToggle = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  try {
    const settings = await ensureProjectSettings(ctx.kv, projectId);
    const nextValue = !settings.portalEnabled;
    await upsertProjectSettings(ctx.kv, { ...settings, portalEnabled: nextValue, updatedAt: new Date().toISOString() });
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: nextValue ? "Автообновление портала включено." : "Автообновление портала остановлено.",
    });
  } catch (error) {
    await sendTelegramMessage(ctx.token, { chatId, text: `Не удалось изменить состояние портала: ${(error as Error).message}` });
  }
  await renderPortalPanel(runtime, userId, chatId, projectId);
};

const handlePortalSyncRequest = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  try {
    const project = await requireProjectRecord(ctx.kv, projectId);
    if (!project.portalUrl) {
      await sendTelegramMessage(ctx.token, { chatId, text: "Сначала создайте портал." });
    } else {
      const result = await syncPortalMetrics(ctx.kv, ctx.r2, projectId, {
        allowPartial: true,
        periods: PORTAL_PERIOD_KEYS,
      });
      const summary = describePortalSyncResult(result);
      if (summary) {
        await sendTelegramMessage(ctx.token, { chatId, text: summary });
      }
    }
  } catch (error) {
    await sendTelegramMessage(ctx.token, { chatId, text: `Не удалось обновить данные портала: ${(error as Error).message}` });
  }
  await renderPortalPanel(runtime, userId, chatId, projectId);
};

const handlePortalDelete = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  try {
    const project = await requireProjectRecord(ctx.kv, projectId);
    if (!project.portalUrl) {
      await sendTelegramMessage(ctx.token, { chatId, text: "Портал уже удалён." });
    } else {
      await putProjectRecord(ctx.kv, { ...project, portalUrl: "" });
      const settings = await ensureProjectSettings(ctx.kv, projectId);
      if (settings.portalEnabled) {
        await upsertProjectSettings(ctx.kv, { ...settings, portalEnabled: false, updatedAt: new Date().toISOString() });
      }
      await deletePortalSyncState(ctx.kv, projectId).catch(() => {});
      await sendTelegramMessage(ctx.token, { chatId, text: "Портал отключён и ссылка удалена." });
    }
  } catch (error) {
    await sendTelegramMessage(ctx.token, { chatId, text: `Не удалось удалить портал: ${(error as Error).message}` });
  }
  await renderPortalPanel(runtime, userId, chatId, projectId);
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
          translateMetaObjective(campaign.objective),
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

const renderSettingsPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: "panel:settings" });
};

const renderChatPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: `project:chat:${projectId}` });
};

const renderAutoreportsPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: `project:autoreports:${projectId}` });
};

const renderKpiPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: `project:kpi:${projectId}` });
};

const renderProjectEditPanel = async (
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await renderPanel({ runtime, userId, chatId, panelId: `project:edit:${projectId}` });
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
    const profile = await fetchFacebookProfile(trimmed);
    const expiresAt = addDaysIso(todayIsoDate(), 90);
    await putFbAuthRecord(ctx.kv, {
      userId,
      accessToken: trimmed,
      expiresAt: `${expiresAt}T00:00:00.000Z`,
      adAccounts: accounts,
      facebookUserId: profile.id,
      facebookName: profile.name,
    });
    await upsertMetaTokenRecord(ctx.kv, {
      facebookUserId: profile.id,
      accessToken: trimmed,
      expiresAt: `${expiresAt}T00:00:00.000Z`,
    });
    await syncUserProjectsMetaAccount(ctx.kv, userId, profile.id);
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
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
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
    await setProjectChatBinding(ctx, projectId, {
      chatId: freeChat.chatId,
      chatTitle: freeChat.chatTitle,
      topicId: freeChat.topicId,
    });
    await recordKnownChat(ctx.kv, chat);
    await renderChatPanel(runtime, userId, chatId, projectId);
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `Не удалось привязать чат: ${(error as Error).message}`,
    });
  }
};

const handleChatSelect = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
  selectedChatId: number,
): Promise<void> => {
  const freeChat = await getFreeChatRecord(ctx.kv, selectedChatId);
  if (!freeChat || freeChat.ownerId !== userId) {
    await sendTelegramMessage(ctx.token, { chatId, text: buildChatAlreadyUsedMessage() });
    return;
  }
  await setProjectChatBinding(ctx, projectId, {
    chatId: freeChat.chatId,
    chatTitle: freeChat.chatTitle,
    topicId: freeChat.topicId,
  });
  await renderChatPanel(runtime, userId, chatId, projectId);
};

const handleChatUnlink = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await setProjectChatBinding(ctx, projectId, null);
  await renderChatPanel(runtime, userId, chatId, projectId);
};

const handleAutoreportsToggle = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  await putAutoreportsRecord(ctx.kv, projectId, { ...bundle.autoreports, enabled: !bundle.autoreports.enabled });
  await renderAutoreportsPanel(runtime, userId, chatId, projectId);
};

const handleAutoreportsTimeInput = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await renderAutoreportsPanel(runtime, userId, chatId, projectId);
};

const handleAutoreportsRecipientToggle = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
  target: "chat" | "admin",
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const nextRecord: AutoreportsRecord = {
    ...bundle.autoreports,
    sendToChat: target === "chat" ? !bundle.autoreports.sendToChat : bundle.autoreports.sendToChat,
    sendToAdmin: target === "admin" ? !bundle.autoreports.sendToAdmin : bundle.autoreports.sendToAdmin,
  };
  await putAutoreportsRecord(ctx.kv, projectId, nextRecord);
  await renderAutoreportsPanel(runtime, userId, chatId, projectId);
};

const handleAutoreportsSendNow = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  if (!bundle.autoreports.sendToChat && !bundle.autoreports.sendToAdmin) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Ни один канал автоотчёта не включён. Включите отправку в чат или админу.",
    });
    await renderAutoreportsPanel(runtime, userId, chatId, projectId);
    return;
  }
  try {
    await sendAutoReportNow(ctx.kv, ctx.token, projectId);
  } catch (error) {
    console.error("auto-report manual send failed", { projectId, error });
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: "Не удалось отправить автоотчёт. Проверьте подключение Meta и попробуйте позже.",
    });
  }
  await renderAutoreportsPanel(runtime, userId, chatId, projectId);
};

const handleKpiModeChange = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
  mode: ProjectRecord["settings"]["kpi"]["mode"],
): Promise<void> => {
  await updateProject(ctx, projectId, (project) => {
    project.settings.kpi.mode = mode;
  });
  await renderKpiPanel(runtime, userId, chatId, projectId);
};

const handleKpiTypeChange = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await renderKpiPanel(runtime, userId, chatId, projectId);
};

const handleProjectDelete = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  projectId: string,
): Promise<void> => {
  await deleteProjectCascade(ctx.kv, ctx.r2, projectId);
  await sendTelegramMessage(ctx.token, { chatId, text: "✅ Проект удалён." });
  await renderPanel({ runtime, userId, chatId, panelId: "panel:projects" });
};

const handleLeadStatusChange = async (
  ctx: BotContext,
  chatId: number,
  projectId: string,
  leadId: string,
  status: ProjectLeadsListRecord["leads"][number]["status"],
): Promise<string> => {
  const bundle = await loadProjectBundle(ctx.kv, ctx.r2, projectId);
  const leads = bundle.leads.leads.map((lead) => (lead.id === leadId ? { ...lead, status } : lead));
  await putProjectLeadsList(ctx.r2, projectId, { ...bundle.leads, leads });
  try {
    const detail = await getLeadDetailRecord(ctx.r2, projectId, leadId);
    await putLeadDetailRecord(ctx.r2, projectId, { ...detail, status });
  } catch {
    // ignore missing detail
  }
  return `✅ Статус обновлён: ${leadStatusLabel(status)}`;
};

const handleSettingsChange = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
  chatId: number,
  patch: Partial<UserSettingsRecord>,
): Promise<void> => {
  await updateUserSettingsRecord(ctx.kv, userId, patch, { timezone: ctx.defaultTimezone, language: "ru" });
  await renderSettingsPanel(runtime, userId, chatId);
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
  panelRuntime: ReturnType<typeof buildPanelRuntime>,
  session?: BotSession,
): Promise<void> => {
  const normalized = text.trim();
  const lower = normalized.toLowerCase();
  const commandToken = lower.split(/\s+/)[0] ?? lower;
  const baseCommand = commandToken.split("@")[0];
  if (
    baseCommand === "/start" ||
    baseCommand === "start" ||
    baseCommand === "/menu" ||
    baseCommand === "/меню" ||
    lower === "меню" ||
    lower === "menu"
  ) {
    await renderMainPanelFromCommand(ctx, panelRuntime, userId, chatId, session);
    return;
  }
  switch (normalized) {
    case "Авторизация Facebook":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:fb-auth" });
      return;
    case "Проекты":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:projects" });
      return;
    case "Аналитика":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:analytics" });
      return;
    case "Пользователи":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:users" });
      return;
    case "Финансы":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:finance" });
      return;
    case "Вебхуки Telegram":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:webhooks" });
      return;
    case "Настройки":
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:settings" });
      return;
    default:
      await renderMainPanelFromCommand(ctx, panelRuntime, userId, chatId, session);
  }
};

const handleCallback = async (
  ctx: BotContext,
  chatId: number,
  userId: number,
  data: string,
  panelRuntime: ReturnType<typeof buildPanelRuntime>,
): Promise<void> => {
  const parts = data.split(":");
  const scope = parts[0];
  switch (scope) {
    case "cmd": {
      const action = parts[1] ?? "main";
      const targetPanel = (() => {
        switch (action) {
          case "main":
          case "menu":
            return "panel:main";
          case "auth":
            return "panel:fb-auth";
          case "projects":
            return "panel:projects";
          case "analytics":
            return "panel:analytics";
          case "finance":
            return "panel:finance";
          case "users":
            return "panel:users";
          case "settings":
            return "panel:settings";
          case "webhooks":
            return "panel:webhooks";
          default:
            return "panel:main";
        }
      })();
      await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: targetPanel });
      break;
    }
    case "project": {
      const action = parts[1];
      switch (action) {
        case "card":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "project:card:" + parts[2]! });
          break;
        case "menu":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: "panel:main" });
          break;
        case "add":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: data });
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
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:billing:${parts[2]!}` });
          break;
        case "leads":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:leads:${parts[2]!}:${parts[3]!}` });
          break;
        case "report":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:report:${parts[2]!}` });
          break;
        case "campaigns":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:campaigns:${parts[2]!}` });
          break;
        case "portal":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:portal:${parts[2]!}` });
          break;
        case "portal-create":
          await handlePortalCreate(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "portal-toggle":
          await handlePortalToggle(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "portal-sync":
          await handlePortalSyncRequest(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "portal-delete":
          await handlePortalDelete(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "export":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:export:${parts[2]!}` });
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
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:chat:${parts[2]!}` });
          break;
        case "chat-change":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:chat-change:${parts[2]!}` });
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
          await handleChatSelect(ctx, panelRuntime, userId, chatId, parts[2]!, Number(parts[3]));
          break;
        case "chat-unlink":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:chat-unlink:${parts[2]!}` });
          break;
        case "chat-unlink-confirm":
          await handleChatUnlink(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "autoreports":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:autoreports:${parts[2]!}` });
          break;
        case "autoreports-toggle":
          await handleAutoreportsToggle(ctx, panelRuntime, userId, chatId, parts[2]!);
          break;
        case "autoreports-time":
          await saveBotSession(ctx.kv, {
            userId,
            state: { type: "autoreports:set-time", projectId: parts[2]! },
            updatedAt: new Date().toISOString(),
          });
          await sendTelegramMessage(ctx.token, { chatId, text: "Введите время HH:MM" });
          break;
        case "autoreports-target":
          await handleAutoreportsRecipientToggle(
            ctx,
            panelRuntime,
            userId,
            chatId,
            parts[2]!,
            parts[3]! as "chat" | "admin",
          );
          break;
        case "kpi":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:kpi:${parts[2]!}` });
          break;
        case "kpi-mode":
          await handleKpiModeChange(
            ctx,
            panelRuntime,
            userId,
            chatId,
            parts[2]!,
            parts[3]! as ProjectRecord["settings"]["kpi"]["mode"],
          );
          break;
        case "kpi-type":
          await handleKpiTypeChange(
            ctx,
            panelRuntime,
            userId,
            chatId,
            parts[2]!,
            parts[3]! as ProjectRecord["settings"]["kpi"]["type"],
          );
          break;
        case "edit":
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:edit:${parts[2]!}` });
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
          await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `project:delete:${parts[2]!}` });
          break;
        case "delete-confirm":
          await handleProjectDelete(ctx, panelRuntime, userId, chatId, parts[2]!);
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
        await handleBillingAdd30(ctx, panelRuntime, userId, chatId, projectId);
      } else if (action === "tariff") {
        await handleBillingTariff(ctx, panelRuntime, userId, chatId, projectId, Number(parts[3]));
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
        await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `lead:detail:${parts[2]!}:${parts[3]!}` });
      } else if (action === "status") {
        await handleLeadStatusChange(
          ctx,
          chatId,
          parts[2]!,
          parts[3]!,
          parts[4]! as ProjectLeadsListRecord["leads"][number]["status"],
        );
        await renderPanel({ runtime: panelRuntime, userId, chatId, panelId: `lead:detail:${parts[2]!}:${parts[3]!}` });
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
        await handleSettingsChange(ctx, panelRuntime, userId, chatId, { language: parts[2]! });
      } else if (target === "tz") {
        await handleSettingsChange(ctx, panelRuntime, userId, chatId, { timezone: parts[2]! });
      }
      break;
    }
    case "auto_send_now": {
      const projectId = parts[1];
      if (projectId) {
        await handleAutoreportsSendNow(ctx, panelRuntime, userId, chatId, projectId);
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
      const panelRuntime = buildPanelRuntime(ctx);
      const userId = extractUserId(update);
      const chatId = extractChatId(update);
      if (userId == null || chatId == null) {
        return;
      }
      let cachedSession: Awaited<ReturnType<typeof getBotSession>> | null = null;
      const chatType = update.message?.chat?.type ?? update.callback_query?.message?.chat?.type ?? "private";
      const isGroupChat = chatType === "group" || chatType === "supergroup";
      if (isGroupChat && update.message?.text) {
        const text = update.message.text.trim();
        const lowered = text.toLowerCase();
        if (lowered.startsWith("/reg")) {
          await handleGroupRegistration(ctx, update.message, userId);
        } else if (lowered.startsWith("/stat")) {
          await handleGroupStatCommand(ctx, update.message);
        }
        return;
      }
      await recordChatFromUpdate(ctx, update);

      if (update.message?.text) {
        let session = cachedSession ?? (await getBotSession(ctx.kv, userId));
        cachedSession = session;
        if (await handleSessionInput(ctx, chatId, userId, update.message.text, session, panelRuntime)) {
          return;
        }
        session = await ensureLegacyKeyboardCleared(ctx, chatId, userId, session);
        cachedSession = session;
        await handleTextCommand(ctx, chatId, userId, update.message.text.trim(), panelRuntime, session);
        return;
      }

      if (update.callback_query?.data) {
        await handleCallback(ctx, chatId, userId, update.callback_query.data, panelRuntime);
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
  panelRuntime: ReturnType<typeof buildPanelRuntime>,
): Promise<boolean> => {
  if (!sessionState || !sessionState.state || sessionState.state.type === "idle") {
    return false;
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("/")) {
    await clearBotSession(ctx.kv, userId);
    return false;
  }
  try {
    switch (sessionState.state.type) {
      case "billing:set-date":
        await handleBillingDateInput(ctx, panelRuntime, userId, chatId, sessionState.state.projectId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      case "billing:manual":
        await handleBillingManualInput(ctx, panelRuntime, userId, chatId, sessionState.state.projectId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      case "facebook:token":
        await handleFacebookTokenInput(ctx, chatId, userId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      case "project:edit":
        await handleProjectEditInput(
          ctx,
          panelRuntime,
          userId,
          chatId,
          sessionState.state.projectId,
          sessionState.state.field,
          trimmed,
        );
        await clearBotSession(ctx.kv, userId);
        return true;
      case "project:create-manual":
        await handleProjectManualBindInput(ctx, chatId, userId, sessionState.state.accountId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      case "chat:manual":
        await handleChatManualInput(ctx, panelRuntime, userId, chatId, sessionState.state.projectId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      case "autoreports:set-time":
        await handleAutoreportsTimeInput(ctx, panelRuntime, userId, chatId, sessionState.state.projectId, trimmed);
        await clearBotSession(ctx.kv, userId);
        return true;
      default:
        return false;
    }
  } catch (error) {
    await sendTelegramMessage(ctx.token, {
      chatId,
      text: `⚠️ ${((error as Error).message ?? 'Не удалось обработать ввод').slice(0, 300)}`,
    });
    return true;
  }
};

const handleProjectEditInput = async (
  ctx: BotContext,
  runtime: ReturnType<typeof buildPanelRuntime>,
  userId: number,
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
  await renderProjectEditPanel(runtime, userId, chatId, projectId);
};

