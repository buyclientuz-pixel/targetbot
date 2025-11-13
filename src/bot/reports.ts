import { BotContext } from "./types";
import { escapeAttribute, escapeHtml } from "../utils/html";
import {
  ReportSessionRecord,
  deleteReportSession,
  loadReportSession,
  saveReportSession,
  getReportAsset,
  loadMetaToken,
  loadPendingKpiSelection,
  savePendingKpiSelection,
  clearPendingKpiSelection,
  updateProjectRecord,
  loadPortalByProjectId,
  savePortalRecord,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { sendTelegramMessage, editTelegramMessage, answerCallbackQuery, sendTelegramDocument } from "../utils/telegram";
import { generateReport } from "../utils/reports";
import { summarizeProjects, sortProjectSummaries, applyProjectReportPreferencesPatch } from "../utils/projects";
import { fetchCampaigns, withMetaSettings } from "../utils/meta";
import {
  resolveCampaignKpis,
  persistCampaignKpis,
  syncCampaignObjectives,
  KPI_LABELS,
  getCampaignKPIs,
} from "../utils/kpi";
import { PortalMetricKey, ProjectSummary, MetaCampaign } from "../types";

const REPORT_SESSION_TTL_MS = 30 * 60 * 1000;

const ensureChatId = (context: BotContext): string | null => {
  if (!context.chatId) {
    console.warn("Report command invoked without chatId", context.update);
    return null;
  }
  return context.chatId;
};

const sendOrEditMessage = async (
  context: BotContext,
  text: string,
  replyMarkup: { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] },
): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  if (context.update.callback_query?.message && typeof context.messageId === "number") {
    await editTelegramMessage(context.env, {
      chatId,
      messageId: context.messageId,
      text,
      replyMarkup,
    });
  } else {
    await sendTelegramMessage(context.env, {
      chatId,
      threadId: context.threadId,
      text,
      replyMarkup,
    });
  }
};

const loadProjectSummaryById = async (
  context: BotContext,
  projectId: string,
): Promise<ProjectSummary | null> => {
  const summaries = await summarizeProjects(context.env, { projectIds: [projectId] });
  return summaries.length ? summaries[0] : null;
};

const loadProjectCampaigns = async (
  context: BotContext,
  summary: ProjectSummary,
): Promise<MetaCampaign[]> => {
  if (!summary.adAccountId) {
    return [];
  }
  try {
    const token = await loadMetaToken(context.env);
    if (!token) {
      return [];
    }
    const metaEnv = await withMetaSettings(context.env);
    const campaigns = await fetchCampaigns(metaEnv, token, summary.adAccountId, {
      limit: 50,
      datePreset: "last_7d",
    });
    await syncCampaignObjectives(context.env, summary.id, campaigns);
    return campaigns;
  } catch (error) {
    console.warn("Failed to load campaigns for KPI", summary.id, error);
    return [];
  }
};

const ensurePendingKpiSelection = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
  metrics: PortalMetricKey[],
): Promise<PortalMetricKey[]> => {
  if (!context.userId) {
    return metrics;
  }
  const existing = await loadPendingKpiSelection(context.env, context.userId);
  if (existing && existing.projectId === projectId && existing.campaignId === campaignId) {
    return existing.metrics;
  }
  await savePendingKpiSelection(context.env, context.userId, {
    projectId,
    campaignId,
    metrics,
    updatedAt: new Date().toISOString(),
  });
  return metrics;
};

const applyProjectMetrics = async (
  context: BotContext,
  summary: ProjectSummary,
  metrics: PortalMetricKey[],
): Promise<void> => {
  const settings = applyProjectReportPreferencesPatch(summary.settings ?? {}, { metrics });
  await updateProjectRecord(context.env, summary.id, { settings });
  try {
    const portalRecord = await loadPortalByProjectId(context.env, summary.id);
    if (portalRecord) {
      const updated = {
        ...portalRecord,
        metrics,
        updatedAt: new Date().toISOString(),
      };
      await savePortalRecord(context.env, updated);
    }
  } catch (error) {
    console.warn("Failed to update portal metrics", summary.id, error);
  }
};

const KPI_BASE_ORDER: PortalMetricKey[] = [
  "leads",
  "cpl",
  "spend",
  "ctr",
  "cpc",
  "reach",
  "messages",
  "conversations",
  "purchases",
  "cpa",
  "roas",
  "cpm",
  "conversions",
  "engagements",
  "cpe",
  "thruplays",
  "cpv",
  "installs",
  "cpi",
  "freq",
  "cpurchase",
  "leads_total",
  "leads_new",
  "leads_done",
  "impressions",
  "clicks",
];

const buildKpiMetricOrder = (objective: string | null | undefined): PortalMetricKey[] => {
  const ordered = [...getCampaignKPIs(objective), ...KPI_BASE_ORDER];
  const seen = new Set<PortalMetricKey>();
  const result: PortalMetricKey[] = [];
  ordered.forEach((key) => {
    if (KPI_LABELS[key] && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  });
  return result;
};

const renderKpiProject = async (context: BotContext, projectId: string): Promise<void> => {
  const summary = await loadProjectSummaryById(context, projectId);
  if (!summary) {
    await sendOrEditMessage(context, "❌ Проект не найден. Обновите список проектов.", {
      inline_keyboard: [[{ text: "📊 Проекты", callback_data: "cmd:projects" }]],
    });
    return;
  }
  if (!summary.adAccountId) {
    await sendOrEditMessage(
      context,
      [
        `🎛 KPI кампаний — <b>${escapeHtml(summary.name)}</b>`,
        "",
        "Рекламный кабинет не подключён. Привяжите Meta-аккаунт, чтобы настроить KPI кампаний.",
      ].join("\n"),
      {
        inline_keyboard: [
          [
            { text: "🔗 Meta-аккаунты", callback_data: "cmd:meta" },
            { text: "🏗 Проект", callback_data: `proj:view:${projectId}` },
          ],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    );
    return;
  }

  const campaigns = await loadProjectCampaigns(context, summary);
  if (!campaigns.length) {
    await sendOrEditMessage(
      context,
      [
        `🎛 KPI кампаний — <b>${escapeHtml(summary.name)}</b>`,
        "",
        "Кампании не найдены. Обновите данные в Meta или выберите другой период.",
      ].join("\n"),
      {
        inline_keyboard: [
          [{ text: "🔄 Обновить", callback_data: `report:kpi_open:${projectId}` }],
          [{ text: "🏗 Проект", callback_data: `proj:view:${projectId}` }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    );
    return;
  }

  if (context.userId) {
    await clearPendingKpiSelection(context.env, context.userId).catch((error) =>
      console.warn("Failed to clear KPI selection", error),
    );
  }

  const enriched = await Promise.all(
    campaigns.map(async (campaign) => {
      const metrics = await resolveCampaignKpis(context.env, projectId, campaign.id, campaign.objective);
      return { campaign, metrics };
    }),
  );

  const rows = enriched.map(({ campaign, metrics }) => {
    const objective = campaign.objective ? campaign.objective : "—";
    const label = `${campaign.objective ? "🎯" : "⚙️"} ${escapeHtml(truncateLabel(campaign.name))} · ${metrics.length}`;
    return [
      {
        text: label,
        callback_data: `report:kpi_campaign:${projectId}:${campaign.id}`,
      },
    ];
  });

  const lines = [
    `🎛 KPI кампаний — <b>${escapeHtml(summary.name)}</b>`,
    "",
    "Выберите кампанию, чтобы настроить список KPI для отчётов и портала.",
  ];

  rows.push([
    { text: "🏗 Проект", callback_data: `proj:view:${projectId}` },
    { text: "🏠 Меню", callback_data: "cmd:menu" },
  ]);

  await sendOrEditMessage(context, lines.join("\n"), { inline_keyboard: rows });
};

const renderKpiCampaign = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
): Promise<void> => {
  const summary = await loadProjectSummaryById(context, projectId);
  if (!summary) {
    await sendOrEditMessage(context, "❌ Проект не найден. Вернитесь к списку проектов.", {
      inline_keyboard: [[{ text: "📊 Проекты", callback_data: "cmd:projects" }]],
    });
    return;
  }
  const campaigns = await loadProjectCampaigns(context, summary);
  const campaign = campaigns.find((entry) => entry.id === campaignId);
  if (!campaign) {
    await sendOrEditMessage(
      context,
      "Кампания не найдена. Обновите список кампаний и попробуйте снова.",
      {
        inline_keyboard: [
          [{ text: "🔁 Обновить", callback_data: `report:kpi_open:${projectId}` }],
          [{ text: "🏗 Проект", callback_data: `proj:view:${projectId}` }],
          [{ text: "🏠 Меню", callback_data: "cmd:menu" }],
        ],
      },
    );
    return;
  }

  const baseMetrics = await resolveCampaignKpis(context.env, projectId, campaignId, campaign.objective);
  const selection = await ensurePendingKpiSelection(context, projectId, campaignId, baseMetrics);
  const currentSet = new Set(selection);
  const metricKeys = buildKpiMetricOrder(campaign.objective);

  const lines: string[] = [
    "🎛 KPI кампании",
    "",
    `Проект: <b>${escapeHtml(summary.name)}</b>`,
    `Кампания: <b>${escapeHtml(campaign.name)}</b>`,
    `Цель: <b>${escapeHtml(campaign.objective ?? "—")}</b>`,
    "",
    "Текущие KPI:",
  ];
  selection.forEach((metric) => {
    lines.push(`• ${escapeHtml(KPI_LABELS[metric] ?? metric)}`);
  });

  const keyboard: { text: string; callback_data: string }[][] = metricKeys.map((metric) => [
    {
      text: `${currentSet.has(metric) ? "✅" : "☑️"} ${KPI_LABELS[metric] ?? metric}`,
      callback_data: `report:kpi_toggle:${projectId}:${campaignId}:${metric}`,
    },
  ]);

  keyboard.push([
    { text: "💾 Сохранить дефолтно", callback_data: `report:kpi_save_default:${projectId}:${campaignId}` },
    { text: "📄 Сохранить разово", callback_data: `report:kpi_save_once:${projectId}:${campaignId}` },
  ]);
  keyboard.push([
    { text: "⬅ Кампании", callback_data: `report:kpi_open:${projectId}` },
    { text: "🏗 Проект", callback_data: `proj:view:${projectId}` },
  ]);

  await sendOrEditMessage(context, lines.join("\n"), { inline_keyboard: keyboard });
};

const buildSelectionMessage = (session: ReportSessionRecord) => {
  let header = "📝 Отчёт";
  if (session.type === "auto") {
    header = "📥 Автоотчёт";
  } else if (session.type === "finance") {
    header = "💰 Финансовый отчёт";
  } else if (session.type === "summary") {
    header = "📝 Краткий отчёт";
  } else if (session.title) {
    header = session.title;
  }
  const period = session.filters?.datePreset
    ? session.filters.datePreset
    : session.filters?.since || session.filters?.until || "today";
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(header)}</b>`);
  lines.push(`Период: <b>${escapeHtml(period)}</b>`);
  lines.push("");
  lines.push("Выберите проекты, которые войдут в отчёт:");
  lines.push("");
  if (!session.projects.length) {
    lines.push("Проекты не найдены. Создайте их через бот.");
  } else {
    for (const project of session.projects) {
      const selected = session.projectIds.includes(project.id);
      const prefix = selected ? "✅" : "☑️";
      lines.push(`${prefix} ${escapeHtml(project.name)}`);
    }
  }
  lines.push("");
  lines.push("Кнопка «📥 Сформировать отчёт» создаст запись в разделе Reports и пришлёт сводку в чат.");

  const projectButtons = session.projects.map((project) => ({
    text: `${session.projectIds.includes(project.id) ? "✅" : "☑️"} ${truncateLabel(project.name)}`,
    callback_data: `report:toggle:${session.id}:${project.id}`,
  }));

  const keyboard: { text: string; callback_data?: string; url?: string }[][] = [];
  projectButtons.forEach((button) => {
    keyboard.push([button]);
  });
  if (session.projects.length) {
    keyboard.push([
      { text: "✅ Все", callback_data: `report:select:${session.id}:all` },
      { text: "🚫 Очистить", callback_data: `report:select:${session.id}:none` },
    ]);
  }
  keyboard.push([
    { text: "📥 Сформировать отчёт", callback_data: `report:confirm:${session.id}` },
    { text: "❌ Отмена", callback_data: `report:cancel:${session.id}` },
  ]);
  keyboard.push([{ text: "⬅ В меню", callback_data: "cmd:menu" }]);

  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: keyboard },
  };
};

const truncateLabel = (label: string, max = 24): string => {
  if (label.length <= max) {
    return label;
  }
  return `${label.slice(0, max - 1)}…`;
};

const loadKpiSelection = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
  objective: string | null | undefined,
): Promise<PortalMetricKey[]> => {
  const base = await resolveCampaignKpis(context.env, projectId, campaignId, objective);
  return ensurePendingKpiSelection(context, projectId, campaignId, base);
};

const handleKpiToggle = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
  metric: PortalMetricKey,
): Promise<void> => {
  if (!context.userId) {
    await sendOrEditMessage(context, "Определите администратора для изменения KPI.", {
      inline_keyboard: [[{ text: "🏗 Проект", callback_data: `proj:view:${projectId}` }]],
    });
    return;
  }
  const summary = await loadProjectSummaryById(context, projectId);
  if (!summary) {
    await sendOrEditMessage(context, "Проект не найден.", {
      inline_keyboard: [[{ text: "📊 Проекты", callback_data: "cmd:projects" }]],
    });
    return;
  }
  const campaigns = await loadProjectCampaigns(context, summary);
  const campaign = campaigns.find((entry) => entry.id === campaignId);
  if (!campaign) {
    await renderKpiProject(context, projectId);
    return;
  }
  const selection = await loadKpiSelection(context, projectId, campaignId, campaign.objective);
  const exists = selection.includes(metric);
  const next = exists ? selection.filter((value) => value !== metric) : [...selection, metric];
  await savePendingKpiSelection(context.env, context.userId, {
    projectId,
    campaignId,
    metrics: next,
    updatedAt: new Date().toISOString(),
  });
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, exists ? "Удалено" : "Добавлено");
  }
  await renderKpiCampaign(context, projectId, campaignId);
};

const handleKpiSave = async (
  context: BotContext,
  projectId: string,
  campaignId: string,
  options: { persist: boolean },
): Promise<void> => {
  const summary = await loadProjectSummaryById(context, projectId);
  if (!summary) {
    await sendOrEditMessage(context, "Проект не найден. Обновите список проектов.", {
      inline_keyboard: [[{ text: "📊 Проекты", callback_data: "cmd:projects" }]],
    });
    return;
  }
  const campaigns = await loadProjectCampaigns(context, summary);
  const campaign = campaigns.find((entry) => entry.id === campaignId);
  if (!campaign) {
    await renderKpiProject(context, projectId);
    return;
  }
  const selection = await loadKpiSelection(context, projectId, campaignId, campaign.objective);
  let applied = selection;
  if (options.persist) {
    applied = await persistCampaignKpis(context.env, projectId, campaignId, selection);
  }
  await applyProjectMetrics(context, summary, applied);
  if (context.userId) {
    await clearPendingKpiSelection(context.env, context.userId).catch((error) =>
      console.warn("Failed to clear KPI selection", error),
    );
  }
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id, "Сохранено");
  }
  await renderKpiCampaign(context, projectId, campaignId);
};

interface ReportWorkflowOptions {
  projectId?: string;
}

const createSession = async (
  context: BotContext,
  mode: "auto" | "summary" | "finance" | "custom",
  options: ReportWorkflowOptions = {},
): Promise<ReportSessionRecord | null> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return null;
  }
  const summaries = sortProjectSummaries(await summarizeProjects(context.env));
  if (!summaries.length) {
    await sendTelegramMessage(context.env, {
      chatId,
      threadId: context.threadId,
      text: "Отчёт пока не из чего формировать: добавьте проекты и лиды через бот.",
    });
    return null;
  }
  const now = Date.now();
  const selectedProjectId =
    options.projectId && summaries.some((summary) => summary.id === options.projectId)
      ? options.projectId
      : undefined;

  const session: ReportSessionRecord = {
    id: createId(10),
    chatId,
    userId: context.userId,
    username: context.username,
    type: mode,
    command:
      mode === "auto"
        ? "auto_report"
        : mode === "finance"
          ? "finance"
          : mode === "custom"
            ? "custom"
            : "summary",
    projectIds: selectedProjectId ? [selectedProjectId] : summaries.map((summary) => summary.id),
    projects: summaries.map((summary) => ({ id: summary.id, name: summary.name })),
    filters: { datePreset: "today" },
    title:
      mode === "auto"
        ? "Автоотчёт по проектам"
        : mode === "finance"
          ? "Финансовый отчёт"
          : mode === "summary"
            ? "Сводка по проектам"
            : options.projectId
              ? "Кастомный отчёт"
              : "Отчёт по проектам",
    format: mode === "auto" ? "pdf" : mode === "finance" ? "html" : "html",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + REPORT_SESSION_TTL_MS).toISOString(),
  };
  await saveReportSession(context.env, session);
  return session;
};

export const startReportWorkflow = async (
  context: BotContext,
  mode: "auto" | "summary" | "finance" | "custom",
  options: ReportWorkflowOptions = {},
): Promise<void> => {
  const session = await createSession(context, mode, options);
  if (!session) {
    return;
  }
  const chatId = session.chatId;
  const { text, replyMarkup } = buildSelectionMessage(session);
  const message = context.update.callback_query?.message;
  if (message && typeof context.messageId === "number" && context.chatId === chatId) {
    await editTelegramMessage(context.env, {
      chatId,
      messageId: context.messageId,
      text,
      replyMarkup,
    });
  } else {
    await sendTelegramMessage(context.env, {
      chatId,
      threadId: context.threadId,
      text,
      replyMarkup,
    });
  }
};

const resolveCallback = (data: string): { action: string; sessionId: string; argument?: string } | null => {
  if (!data.startsWith("report:")) {
    return null;
  }
  const parts = data.split(":");
  const [, action, sessionId, argument] = parts;
  if (!action || !sessionId) {
    return null;
  }
  return { action, sessionId, argument };
};

const editSelectionMessage = async (
  context: BotContext,
  session: ReportSessionRecord,
  options: { status?: string },
): Promise<void> => {
  const message = context.update.callback_query?.message;
  if (!message) {
    return;
  }
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  const { text, replyMarkup } = buildSelectionMessage(session);
  const statusLine = options.status ? `${text}\n\n<i>${escapeHtml(options.status)}</i>` : text;
  await editTelegramMessage(context.env, {
    chatId,
    messageId: message.message_id,
    text: statusLine,
    replyMarkup,
  });
};

const finalizeSelectionMessage = async (
  context: BotContext,
  text: string,
): Promise<void> => {
  const message = context.update.callback_query?.message;
  const chatId = ensureChatId(context);
  if (!message || !chatId) {
    return;
  }
  await editTelegramMessage(context.env, {
    chatId,
    messageId: message.message_id,
    text,
    replyMarkup: { inline_keyboard: [[{ text: "⬅ В меню", callback_data: "cmd:menu" }]] },
  });
};

type GenerateReportResultType = Awaited<ReturnType<typeof generateReport>>;

const sendReportSummary = async (
  context: BotContext,
  result: GenerateReportResultType,
): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  const record = result.record;
  const text = `${result.html}\n\nID отчёта: <code>${escapeHtml(record.id)}</code>`;
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
    replyMarkup: {
      inline_keyboard: [[{ text: "⬇️ Скачать отчёт", callback_data: `report:download:${record.id}` }]],
    },
  });
};

const handleReportKpiCallback = async (context: BotContext, data: string): Promise<boolean> => {
  const parts = data.split(":");
  const action = parts[1];
  const projectId = parts[2];
  if (!action || !projectId) {
    return false;
  }
  switch (action) {
    case "kpi_open":
      await renderKpiProject(context, projectId);
      return true;
    case "kpi_campaign": {
      const campaignId = parts[3];
      if (!campaignId) {
        await renderKpiProject(context, projectId);
        return true;
      }
      await renderKpiCampaign(context, projectId, campaignId);
      return true;
    }
    case "kpi_toggle": {
      const campaignId = parts[3];
      const metricKey = parts[4];
      if (!campaignId || !metricKey || !(metricKey in KPI_LABELS)) {
        if (context.update.callback_query?.id) {
          await answerCallbackQuery(context.env, context.update.callback_query.id, "Выберите KPI из списка");
        }
        if (campaignId) {
          await renderKpiCampaign(context, projectId, campaignId);
        } else {
          await renderKpiProject(context, projectId);
        }
        return true;
      }
      await handleKpiToggle(context, projectId, campaignId, metricKey as PortalMetricKey);
      return true;
    }
    case "kpi_save_default": {
      const campaignId = parts[3];
      if (!campaignId) {
        await renderKpiProject(context, projectId);
        return true;
      }
      await handleKpiSave(context, projectId, campaignId, { persist: true });
      return true;
    }
    case "kpi_save_once": {
      const campaignId = parts[3];
      if (!campaignId) {
        await renderKpiProject(context, projectId);
        return true;
      }
      await handleKpiSave(context, projectId, campaignId, { persist: false });
      return true;
    }
    default:
      return false;
  }
};

export const isReportCallbackData = (data: string | undefined): boolean => {
  return !!data && data.startsWith("report:");
};

export const handleReportCallback = async (context: BotContext, data: string): Promise<boolean> => {
  if (data.startsWith("report:kpi_")) {
    return await handleReportKpiCallback(context, data);
  }
  const parsed = resolveCallback(data);
  if (!parsed) {
    return false;
  }
  if (parsed.action === "download") {
    const reportId = parsed.sessionId;
    const chatId = ensureChatId(context);
    if (!chatId) {
      return true;
    }
    const asset = await getReportAsset(context.env, reportId);
    if (!asset) {
      await sendTelegramMessage(context.env, {
        chatId,
        threadId: context.threadId,
        text: "Файл отчёта не найден. Сформируйте его заново.",
      });
      return true;
    }
    await sendTelegramDocument(context.env, {
      chatId,
      threadId: context.threadId,
      data: asset.body,
      fileName: `report_${reportId}.html`,
      contentType: asset.contentType || "text/html; charset=utf-8",
      caption: "⬇️ Отчёт загружен.",
    });
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Отправлено");
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await sendTelegramMessage(context.env, {
      chatId,
      threadId: context.threadId,
      text: "/admin",
    });
    return true;
  }
  const session = await loadReportSession(context.env, parsed.sessionId);
  if (!session) {
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Сессия истекла. Запустите команду заново.");
    }
    await finalizeSelectionMessage(context, "Сессия отчёта истекла. Запустите команду заново.");
    return true;
  }
  if (parsed.action === "toggle" && parsed.argument) {
    const exists = session.projectIds.includes(parsed.argument);
    session.projectIds = exists
      ? session.projectIds.filter((id) => id !== parsed.argument)
      : [...session.projectIds, parsed.argument];
    session.updatedAt = new Date().toISOString();
    await saveReportSession(context.env, session);
    await editSelectionMessage(context, session, { status: exists ? "Проект исключён из отчёта." : "Проект добавлен." });
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, exists ? "Исключено" : "Добавлено");
    }
    return true;
  }
  if (parsed.action === "select") {
    if (parsed.argument === "all") {
      session.projectIds = session.projects.map((project) => project.id);
    } else if (parsed.argument === "none") {
      session.projectIds = [];
    }
    session.updatedAt = new Date().toISOString();
    await saveReportSession(context.env, session);
    await editSelectionMessage(context, session, {
      status: parsed.argument === "all" ? "Выбраны все проекты." : "Все проекты сняты. Выберите нужные вручную.",
    });
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Обновлено");
    }
    return true;
  }
  if (parsed.action === "cancel") {
    await deleteReportSession(context.env, session.id);
    await finalizeSelectionMessage(context, "Операция отменена. Используйте команду заново при необходимости.");
    if (context.update.callback_query?.id) {
      await answerCallbackQuery(context.env, context.update.callback_query.id, "Отменено");
    }
    return true;
  }
  if (parsed.action === "confirm") {
    if (!session.projectIds.length) {
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Выберите хотя бы один проект");
      }
      return true;
    }
    const message = context.update.callback_query?.message;
    const chatId = ensureChatId(context);
    if (message && chatId) {
      await editTelegramMessage(context.env, {
        chatId,
        messageId: message.message_id,
        text: "⏳ Формируем отчёт…",
        replyMarkup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: `report:cancel:${session.id}` }]] },
      });
    }
    try {
      const result = await generateReport(context.env, {
        type:
          session.type === "auto"
            ? "detailed"
            : session.type === "finance"
              ? "finance"
              : session.type === "custom"
                ? "custom"
                : "summary",
        projectIds: session.projectIds,
        format: session.format === "csv" ? "csv" : session.format === "pdf" ? "pdf" : "html",
        channel: "telegram",
        triggeredBy: context.userId,
        command: session.command,
      });
      await sendReportSummary(context, result);
      await finalizeSelectionMessage(context, "✅ Отчёт сформирован и отправлен в чат.");
      await deleteReportSession(context.env, session.id);
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Отчёт готов");
      }
    } catch (error) {
      console.error("Failed to generate report", error);
      await finalizeSelectionMessage(context, "Не удалось сформировать отчёт. Попробуйте позже.");
      if (context.update.callback_query?.id) {
        await answerCallbackQuery(context.env, context.update.callback_query.id, "Ошибка при формировании отчёта");
      }
    }
    return true;
  }
  return false;
};

