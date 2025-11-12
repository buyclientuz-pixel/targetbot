import { BotContext } from "./types";
import { sendMainMenu } from "./menu";
import { escapeAttribute, escapeHtml } from "../utils/html";
import { summarizeProjects, sortProjectSummaries } from "../utils/projects";
import {
  appendCommandLog,
  listPayments,
  listUsers,
  loadMetaToken,
} from "../utils/storage";
import { createId } from "../utils/ids";
import { sendTelegramMessage, answerCallbackQuery } from "../utils/telegram";
import { fetchAdAccounts, resolveMetaStatus } from "../utils/meta";

const AUTH_URL_FALLBACK = "https://th-reports.buyclientuz.workers.dev/auth/facebook";

const resolveAuthUrl = (env: BotContext["env"]): string => {
  const candidates = [
    env.AUTH_FACEBOOK_URL,
    env.META_AUTH_URL,
    env.FB_AUTH_URL,
    env.PUBLIC_WEB_URL ? `${env.PUBLIC_WEB_URL}/auth/facebook` : null,
    env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/auth/facebook` : null,
    env.WORKER_BASE_URL ? `${env.WORKER_BASE_URL}/auth/facebook` : null,
  ];
  const resolved = candidates.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return resolved ? resolved : AUTH_URL_FALLBACK;
};

const HOME_MARKUP = {
  inline_keyboard: [[{ text: "⬅ Назад", callback_data: "cmd:menu" }]],
};

const COMMAND_ALIASES: Record<string, string> = {
  "/start": "menu",
  "/menu": "menu",
  "меню": "menu",
  "🏠 главное меню": "menu",
  "cmd:menu": "menu",
  "cmd:auth": "auth",
  "cmd:projects": "projects",
  "cmd:users": "users",
  "cmd:meta": "meta",
  "cmd:analytics": "analytics",
  "cmd:finance": "finance",
  "cmd:settings": "settings",
  "🔐 авторизация facebook": "auth",
  "📊 проекты": "projects",
  "👥 пользователи": "users",
  "🔗 meta-аккаунты": "meta",
  "📈 аналитика": "analytics",
  "💰 финансы": "finance",
  "⚙ настройки": "settings",
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "—";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

const ensureChatId = (context: BotContext): string | null => {
  if (!context.chatId) {
    console.warn("telegram command invoked without chatId", context.update);
    return null;
  }
  return context.chatId;
};

const sendMessage = async (
  context: BotContext,
  text: string,
  options: { replyMarkup?: unknown } = {},
): Promise<void> => {
  const chatId = ensureChatId(context);
  if (!chatId) {
    return;
  }
  await sendTelegramMessage(context.env, {
    chatId,
    threadId: context.threadId,
    text,
    replyMarkup: options.replyMarkup ?? HOME_MARKUP,
  });
};

const handleAuth = async (context: BotContext): Promise<void> => {
  const record = await loadMetaToken(context.env);
  const statusInfo = await resolveMetaStatus(context.env, record);
  const status = statusInfo.status;
  const statusLabel =
    status === "valid"
      ? "✅ Токен активен"
      : status === "expired"
        ? "⚠️ Токен истёк"
        : "❌ Токен не подключён";

  const expires = statusInfo.expiresAt ? formatDateTime(statusInfo.expiresAt) : "—";
  const authUrl = resolveAuthUrl(context.env);
  const lines = [
    "<b>🔐 Авторизация Facebook</b>",
    "",
    `${statusLabel}`,
    `Действителен до: <b>${expires}</b>`,
    statusInfo.accountName ? `Аккаунт: <b>${escapeHtml(statusInfo.accountName)}</b>` : "",
    "",
    "Для подключения или обновления токена откройте веб-страницу авторизации.",
    `🌍 <a href="${escapeAttribute(authUrl)}">Открыть форму авторизации</a>`,
    "",
    "После успешного входа данные синхронизируются с веб-панелью и ботом.",
  ].filter(Boolean);

  if (status === "valid") {
    try {
      const accounts = await fetchAdAccounts(context.env, record, {
        includeSpend: true,
        datePreset: "today",
      });
      if (accounts.length) {
        const list = accounts
          .slice(0, 5)
          .map((account) => {
            const spendText = account.spendFormatted
              ? ` — расход ${escapeHtml(account.spendFormatted)}${account.spendPeriod ? ` (${escapeHtml(account.spendPeriod)})` : ""}`
              : "";
            return `• ${escapeHtml(account.name)}${account.currency ? ` (${escapeHtml(account.currency)})` : ""}${spendText}`;
          })
          .join("\n");
        lines.push("", "Подключённые рекламные аккаунты:", list);
        if (accounts.length > 5) {
          lines.push(`и ещё ${accounts.length - 5} аккаунтов…`);
        }
      }
    } catch (error) {
      console.warn("Failed to list Meta accounts", error);
    }
  }

  await sendMessage(context, lines.join("\n"));
};

const formatProjectLines = async (context: BotContext): Promise<string[]> => {
  const summaries = sortProjectSummaries(await summarizeProjects(context.env));
  if (!summaries.length) {
    return [
      "📊 Проекты",
      "",
      "Пока нет активных проектов.",
      "Используйте веб-панель, чтобы создать первый проект и привязать чат.",
    ];
  }
  const items = summaries.map((project, index) => {
    const numberEmoji = `${index + 1}️⃣`;
    const chatLine = project.telegramLink
      ? `📲 <a href="${escapeAttribute(project.telegramLink)}">Чат-группа</a>`
      : "📲 Чат не подключён";
    const adAccountLine = project.adAccountId
      ? `🧩 Meta: <code>${escapeHtml(project.adAccountId)}</code>`
      : "🧩 Meta: не подключено";
    const stats = project.leadStats;
    const statsLine = `💬 Лиды: ${stats.total} (новые ${stats.new}, завершено ${stats.done})`;
    return [
      `${numberEmoji} <b>${escapeHtml(project.name)}</b>`,
      chatLine,
      adAccountLine,
      statsLine,
    ].join("\n");
  });

  return [
    "📊 Проекты",
    "",
    ...items,
    "",
    "➕ Новый проект — откройте веб-панель TargetBot или выполните /project_new (в разработке)",
  ];
};

const handleProjects = async (context: BotContext): Promise<void> => {
  const lines = await formatProjectLines(context);
  await sendMessage(context, lines.join("\n"));
};

const handleUsers = async (context: BotContext): Promise<void> => {
  const users = await listUsers(context.env);
  const total = users.length;
  const roles = users.reduce(
    (acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const lines = [
    "👥 Пользователи",
    "",
    total
      ? `Всего пользователей: <b>${total}</b>`
      : "Пока нет зарегистрированных пользователей.",
    total ? `Администраторы: ${roles.admin ?? 0}` : "",
    total ? `Менеджеры: ${roles.manager ?? 0}` : "",
    total ? `Клиенты: ${roles.client ?? 0}` : "",
    "",
    "Перейдите в веб-панель /admin/users для создания и управления ролями.",
  ].filter(Boolean);

  await sendMessage(context, lines.join("\n"));
};

const handleMetaAccounts = async (context: BotContext): Promise<void> => {
  const record = await loadMetaToken(context.env);
  const status = record?.status ?? "missing";
  const statusLabel =
    status === "valid"
      ? "✅ Подключение к Meta активно."
      : status === "expired"
        ? "⚠️ Токен истёк. Обновите подключение через раздел Авторизация Facebook."
        : "❌ Токен не найден. Авторизуйтесь, чтобы получить список кабинетов.";

  const lines = ["🔗 Meta-аккаунты", "", statusLabel];

  if (status === "valid") {
    try {
      const accounts = await fetchAdAccounts(context.env, record, {
        includeSpend: true,
        includeCampaigns: true,
        campaignsLimit: 3,
        datePreset: "today",
      });
      if (accounts.length) {
        lines.push("", "📊 Сводка по аккаунтам:");
        const sorted = [...accounts].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
        sorted.forEach((account, index) => {
          lines.push("", `${index + 1}️⃣ <b>${escapeHtml(account.name)}</b>${account.currency ? ` (${escapeHtml(account.currency)})` : ""}`);
          lines.push(`ID: <code>${escapeHtml(account.id)}</code>`);
          if (account.spendFormatted) {
            lines.push(`💵 Расход ${escapeHtml(account.spendFormatted)}${account.spendPeriod ? ` (${escapeHtml(account.spendPeriod)})` : ""}`);
          } else {
            lines.push("💵 Расход недоступен.");
          }
          if (account.status) {
            const statusCode = account.statusCode ? ` (код ${account.statusCode})` : "";
            lines.push(`⚙️ Статус: ${escapeHtml(account.status)}${statusCode}`);
          }
          if (account.impressions !== undefined || account.clicks !== undefined) {
            const impressions = account.impressions ?? 0;
            const clicks = account.clicks ?? 0;
            lines.push(`📈 Импрессии: ${impressions.toLocaleString("ru-RU")} · Клики: ${clicks.toLocaleString("ru-RU")}`);
          }
          if (account.campaigns?.length) {
            lines.push("👀 Топ кампаний:");
            account.campaigns.slice(0, 3).forEach((campaign) => {
              const spend = campaign.spendFormatted
                ? ` — ${escapeHtml(campaign.spendFormatted)}${campaign.spendPeriod ? ` (${escapeHtml(campaign.spendPeriod)})` : ""}`
                : "";
              lines.push(`   • ${escapeHtml(campaign.name)}${spend}`);
            });
            if (account.campaigns.length > 3) {
              lines.push("   …");
            }
          }
        });
      } else {
        lines.push("", "Доступные рекламные кабинеты не найдены.");
      }
    } catch (error) {
      console.error("Failed to load Meta accounts", error);
      lines.push("", "Не удалось получить список аккаунтов. Попробуйте обновить токен в разделе Авторизация Facebook.");
    }
  } else {
    lines.push(
      "",
      "После подключения Facebook аккаунта бот автоматически подтянет рекламные кабинеты и покажет статистику расходов.",
    );
  }

  lines.push(
    "",
    "Веб-панель синхронизирует тот же список в разделе Meta Accounts.",
  );

  await sendMessage(context, lines.join("\n"));
};

const handleAnalytics = async (context: BotContext): Promise<void> => {
  const summaries = sortProjectSummaries(await summarizeProjects(context.env));
  const lines: string[] = ["📈 Аналитика", ""];
  if (summaries.length) {
    for (const project of summaries) {
      const cpa = project.leadStats.done
        ? (project.leadStats.total / project.leadStats.done).toFixed(1)
        : "—";
      lines.push(`📊 ${escapeHtml(project.name)} — лидов: ${project.leadStats.total}, закрыто: ${project.leadStats.done}, CPA: ${cpa}`);
    }
  } else {
    lines.push("Нет данных для аналитики. Добавьте проекты и лиды, чтобы сформировать отчёт.");
  }
  lines.push("", "Фильтры по периодам и экспорт появятся в следующих итерациях веб-панели.");

  await sendMessage(context, lines.join("\n"));
};

const handleFinance = async (context: BotContext): Promise<void> => {
  const payments = await listPayments(context.env);
  const total = payments.length;
  const byStatus = payments.reduce(
    (acc, payment) => {
      acc[payment.status] = (acc[payment.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const lines = [
    "💰 Финансы",
    "",
    total
      ? `Всего записей: <b>${total}</b>`
      : "Платёжные данные пока не добавлены.",
    total ? `Активные: ${byStatus.active ?? 0}` : "",
    total ? `Просроченные: ${byStatus.overdue ?? 0}` : "",
    total ? `Ожидают оплаты: ${byStatus.pending ?? 0}` : "",
    "",
    "Оплата через бота и автоматические алерты появятся после интеграции платежного модуля.",
  ].filter(Boolean);

  await sendMessage(context, lines.join("\n"));
};

const handleSettings = async (context: BotContext): Promise<void> => {
  const lines = [
    "⚙ Настройки",
    "",
    "🔄 Обновить вебхуки — выполните после изменения URL воркера.",
    "🧩 Проверить токен Meta — используйте раздел Авторизация Facebook.",
    "⏰ Время автоотчёта — настройка появится вместе с модулем отчётов.",
    "🌐 Язык интерфейса и формат уведомлений можно задать в веб-панели.",
  ];

  await sendMessage(context, lines.join("\n"));
};

const COMMAND_HANDLERS: Record<string, (context: BotContext) => Promise<void>> = {
  menu: sendMainMenu,
  auth: handleAuth,
  projects: handleProjects,
  users: handleUsers,
  meta: handleMetaAccounts,
  analytics: handleAnalytics,
  finance: handleFinance,
  settings: handleSettings,
};

export const resolveCommand = (text: string | undefined): string | null => {
  if (!text) {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("cmd:")) {
    return trimmed.slice(4);
  }
  const normalized = trimmed.toLowerCase();
  return COMMAND_ALIASES[normalized] ?? null;
};

const logCommand = async (
  context: BotContext,
  command: string,
  payload?: string,
): Promise<void> => {
  try {
    await appendCommandLog(context.env, {
      id: createId(),
      userId: context.userId,
      chatId: context.chatId,
      command,
      payload,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("failed to log telegram command", error);
  }
};

export const runCommand = async (command: string, context: BotContext): Promise<boolean> => {
  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    return false;
  }
  await handler(context);
  await logCommand(context, command, context.text);
  if (context.update.callback_query?.id) {
    await answerCallbackQuery(context.env, context.update.callback_query.id);
  }
  return true;
};
