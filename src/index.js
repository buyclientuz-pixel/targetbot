const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
};

const TEXT_HEADERS = {
  'content-type': 'text/plain; charset=utf-8',
  'cache-control': 'no-store',
};

const TELEGRAM_TIMEOUT_MS = 9000;
const DEFAULT_PAGE_SIZE = 8;
const PROJECT_PREFIX = 'project:';
const CHAT_PREFIX = 'chat:';
const STATE_PREFIX = 'state:';
const DEFAULT_ADMIN_IDS = [7623982602];
const STATE_TTL_SECONDS = 600;
const REPORT_ARCHIVE_PREFIX = 'report:';
const REPORT_ARCHIVE_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 дней
const REPORT_ARCHIVE_PAGE_SIZE = 5;
const REPORT_ARCHIVE_MAX_KEYS = 200;
const REPORT_PRESET_PREFIX = 'report_preset:';
const REPORT_PRESET_LIMIT = 12;
const DIGEST_PRESET_PREFIX = 'digest_preset:';
const DIGEST_PRESET_LIMIT = 12;
const REPORT_PREVIEW_MAX_LENGTH = 3600;
const AUTO_REPORT_FLAG_PREFIX = 'flag:auto_report:';
const WEEKLY_REPORT_FLAG_PREFIX = 'flag:weekly_report:';
const REPORT_FLAG_TTL_SECONDS = 60 * 60 * 24 * 3;
const WEEKLY_FLAG_TTL_SECONDS = 60 * 60 * 24 * 14;
const PORTAL_PREFIX = 'portal:';
const PORTAL_SIG_BYTES = 24;
const PROFILE_PREFIX = 'profiles:';
const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROJECT_CODE_PATTERN = /^[a-z0-9_-]{3,32}$/i;
const PERIOD_OPTIONS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'last_7d', label: '7 дней' },
  { value: 'last_week', label: 'Прошлая неделя' },
  { value: 'month_to_date', label: 'С начала месяца' },
];
const QUICK_TIMES = ['09:30', '10:00', '12:00', '19:00'];
const AUTOPAUSE_PRESET_DAYS = [2, 3, 5, 7, 10];
const AUTOPAUSE_MAX_DAYS = 30;
const ALERT_BILLING_DEFAULT_TIMES = ['10:00', '14:00', '18:00'];
const ALERT_BILLING_PRESET_TIMES = ['09:00', '10:00', '12:00', '14:00', '18:00'];
const ALERT_ZERO_PRESET_TIMES = ['11:00', '12:00', '13:00'];
const META_TIMEOUT_MS = 9000;
const META_API_VERSION = 'v19.0';
const REPORT_MAX_PAGES = 25;
const ALERT_FLAG_PREFIX = 'flag:alert:';
const ALERT_DEFAULT_TTL_SECONDS = 60 * 60 * 6;
const ALERT_ZERO_TTL_SECONDS = 60 * 60 * 20;
const ALERT_ANOMALY_TTL_SECONDS = 60 * 60 * 6;
const ANOMALY_CHECK_TIMES = ['11:00', '17:00'];
const CREATIVE_FATIGUE_MIN_SPEND = 30;
const CREATIVE_FATIGUE_MIN_RESULTS = 1;
const CREATIVE_FATIGUE_CTR_THRESHOLD = 0.5; // %
const AUTOPAUSE_STREAK_PREFIX = 'autopause:streak:';
const AUTOPAUSE_CHECK_TIME = '19:30';
const AUTOPAUSE_ALERT_TTL_SECONDS = 60 * 60 * 20;
const REPORT_INSIGHTS_FIELDS = [
  'campaign_id',
  'campaign_name',
  'objective',
  'adset_id',
  'adset_name',
  'date_start',
  'date_stop',
  'spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'frequency',
  'inline_link_clicks',
  'unique_inline_link_clicks',
  'outbound_clicks',
  'unique_outbound_clicks',
  'outbound_clicks_ctr',
  'actions',
  'unique_actions',
  'action_values',
  'cost_per_action_type',
];

const AD_INSIGHTS_FIELDS = [
  'ad_id',
  'ad_name',
  ...REPORT_INSIGHTS_FIELDS,
];

function sanitizeInsightsFields(fields = []) {
  const blacklist = new Set(['landing_page_views']);
  const unique = new Set();
  const safe = [];

  for (const field of Array.isArray(fields) ? fields : []) {
    const trimmed = typeof field === 'string' ? field.trim() : '';
    if (!trimmed || blacklist.has(trimmed) || unique.has(trimmed)) {
      continue;
    }
    unique.add(trimmed);
    safe.push(trimmed);
  }

  return safe;
}

function sanitizeFieldsParamValue(value) {
  if (Array.isArray(value)) {
    const safeList = sanitizeInsightsFields(value);
    return safeList.length ? safeList.join(',') : '';
  }

  if (typeof value === 'string') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const safeList = sanitizeInsightsFields(parts);
    return safeList.length ? safeList.join(',') : '';
  }

  return value;
}
const DEFAULT_REPORT_METRIC = {
  label: 'Результаты',
  short: 'result',
  actions: [
    'lead',
    'messaging_conversation_started',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ],
};
const REPORT_METRIC_MAP = {
  LEAD_GENERATION: { label: 'Лиды', short: 'leads', costLabel: 'CPL', actions: ['lead'] },
  LEADS: { label: 'Лиды', short: 'leads', costLabel: 'CPL', actions: ['lead'] },
  MESSAGES: {
    label: 'Диалоги',
    short: 'dialogs',
    costLabel: 'CPD',
    actions: [
      'messaging_conversation_started',
      'onsite_conversion.messaging_first_reply',
      'messaging_first_reply',
    ],
  },
  CONVERSIONS: {
    label: 'Конверсии',
    short: 'conv',
    costLabel: 'CPA',
    actions: [
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'onsite_conversion.post_save',
      'omni_purchase',
      'complete_registration',
      'initiate_checkout',
    ],
  },
  SALES: { label: 'Конверсии', short: 'conv', costLabel: 'CPA', actions: ['purchase'] },
  TRAFFIC: {
    label: 'Трафик',
    short: 'traffic',
    costLabel: 'CPC',
    actions: ['inline_link_click', 'link_click', 'landing_page_view', 'view_content'],
  },
  ENGAGEMENT: {
    label: 'Вовлечения',
    short: 'engagement',
    costLabel: 'CPE',
    actions: ['post_engagement', 'video_view', 'thruplay', 'page_engagement'],
  },
  POST_ENGAGEMENT: {
    label: 'Вовлечения',
    short: 'engagement',
    costLabel: 'CPE',
    actions: ['post_engagement', 'video_view', 'thruplay', 'page_engagement'],
  },
  VIDEO_VIEWS: {
    label: 'Просмотры',
    short: 'engagement',
    costLabel: 'CPV',
    actions: ['video_view', 'thruplay'],
  },
  TRAFFIC_ENGAGEMENT: {
    label: 'Вовлечения',
    short: 'engagement',
    costLabel: 'CPE',
    actions: ['post_engagement', 'video_view', 'thruplay'],
  },
  AWARENESS: {
    label: 'Охват',
    short: 'reach',
    costLabel: 'CPR',
    actions: ['reach', 'impressions'],
  },
  REACH: {
    label: 'Охват',
    short: 'reach',
    costLabel: 'CPR',
    actions: ['reach', 'impressions'],
  },
};
const REPORT_METRIC_SHORT_MAP = (() => {
  const map = { [DEFAULT_REPORT_METRIC.short.toLowerCase()]: DEFAULT_REPORT_METRIC };
  for (const metric of Object.values(REPORT_METRIC_MAP)) {
    if (!metric?.short) continue;
    map[metric.short.toLowerCase()] = metric;
  }
  return map;
})();
const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  RUB: '₽',
  UZS: 'сум ',
};
const USER_PREFIX = 'tg_user:';
const USER_ACCOUNTS_PREFIX = 'fb_accts:';
const ACCOUNT_META_PREFIX = 'acct:';
const ACCOUNT_META_TTL_SECONDS = 60 * 60 * 24;
const ALERT_DEFAULT_CONFIG = {
  enabled: true,
  billing_times: [...ALERT_BILLING_DEFAULT_TIMES],
  no_spend_by: '12:00',
};
const ALERT_MINIMAL_CONFIG = {
  enabled: true,
  billing_times: ['10:00'],
  no_spend_by: '12:00',
};
const PROJECT_SCHEDULE_PRESETS = {
  workday_morning: {
    label: 'Будни 09:30',
    description: 'Ежедневно по будням в 09:30',
    times: ['09:30'],
    mute_weekends: true,
  },
  daily_evening: {
    label: 'Каждый день 19:00',
    description: 'Отправка ежедневно в 19:00',
    times: ['19:00'],
    mute_weekends: false,
  },
  twice: {
    label: '09:30 + 19:00',
    description: 'Дважды в день без тихих выходных',
    times: ['09:30', '19:00'],
    mute_weekends: false,
  },
};

const CAMPAIGN_EDITOR_PAGE_SIZE = 6;

const KV_WARNINGS = new Set();
const REQUIRED_ENV_KEYS = ['BOT_TOKEN', 'ADMIN_IDS', 'DEFAULT_TZ', 'FB_APP_ID', 'FB_APP_SECRET'];

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

function sanitizeReportPresetName(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input.replace(/\s+/g, ' ').trim().slice(0, 60);
}

function createReportPresetId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeDigestPresetName(input) {
  return sanitizeReportPresetName(input);
}

function createDigestPresetId() {
  return createReportPresetId();
}

function resolveKvBinding(env, bindingName, fallbackBinding = 'DB') {
  if (!env || typeof env !== 'object') {
    return null;
  }

  if (bindingName && env[bindingName]) {
    return env[bindingName];
  }

  if (bindingName && !KV_WARNINGS.has(bindingName) && fallbackBinding && env[fallbackBinding]) {
    console.warn(
      `[kv] Binding ${bindingName} не найден, используется fallback ${fallbackBinding}. Заполните wrangler.toml при первой возможности.`,
    );
    KV_WARNINGS.add(bindingName);
  }

  if (fallbackBinding) {
    return env[fallbackBinding] ?? null;
  }

  return null;
}

function getPrimaryKv(env) {
  return resolveKvBinding(env, 'DB', 'DB');
}

function getReportsKv(env) {
  return resolveKvBinding(env, 'REPORTS_NAMESPACE', 'DB');
}

function getBillingKv(env) {
  return resolveKvBinding(env, 'BILLING_NAMESPACE', 'DB');
}

function getLogsKv(env) {
  return resolveKvBinding(env, 'LOGS_NAMESPACE', 'DB');
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status ?? 200,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

function text(message, init = {}) {
  return new Response(message, {
    status: init.status ?? 200,
    headers: { ...TEXT_HEADERS, ...(init.headers ?? {}) },
  });
}

function html(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { ...HTML_HEADERS, ...(init.headers ?? {}) },
  });
}

function notFound() {
  return json({
    error: 'not_found',
    message: 'Маршрут не реализован. Добавьте обработчик согласно ТЗ.',
  }, { status: 404 });
}

function methodNotAllowed(allowed) {
  return json({
    error: 'method_not_allowed',
    message: `Разрешены методы: ${allowed.join(', ')}`,
  }, { status: 405, headers: { allow: allowed.join(', ') } });
}

function ensureString(value, name, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`env.${name}`);
  }
}

function validateRequiredEnv(env) {
  const missing = [];
  for (const key of REQUIRED_ENV_KEYS) {
    ensureString(env?.[key], key, missing);
  }
  return missing;
}

function renderDebugPage(state) {
  const items = state.missing.length
    ? `<li><strong>Отсутствуют переменные окружения:</strong> ${state.missing.join(', ')}</li>`
    : '<li><strong>Переменные окружения:</strong> OK</li>';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>th-reports debug</title>
    <style>
      body { font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #1f2933; }
      h1 { font-size: 24px; margin-bottom: 16px; }
      ul { padding-left: 20px; }
      code { background: #f5f6f8; padding: 2px 4px; border-radius: 4px; }
      footer { margin-top: 32px; color: #6b7280; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>th-reports — отладка окружения</h1>
    <ul>
      ${items}
      <li><strong>Путь:</strong> ${state.url.pathname}</li>
      <li><strong>Время:</strong> ${new Date().toISOString()}</li>
    </ul>
    <footer>Этот экран временный. Реализуйте полноценный обработчик fb_debug по ТЗ.</footer>
  </body>
</html>`;
}

async function handleHealth(env) {
  const missingEnv = validateRequiredEnv(env);
  const primaryKv = Boolean(getPrimaryKv(env));
  const dedicatedBindings = ['REPORTS_NAMESPACE', 'BILLING_NAMESPACE', 'LOGS_NAMESPACE'];
  const kvWarnings = [];
  const activeDedicated = [];
  for (const binding of dedicatedBindings) {
    if (env && env[binding]) {
      activeDedicated.push(binding);
    } else {
      kvWarnings.push(`Binding ${binding} не найден, будет использован fallback DB.`);
    }
  }

  const status = missingEnv.length === 0 && primaryKv ? 'ok' : 'degraded';
  const response = {
    status,
    timestamp: new Date().toISOString(),
    missingEnv,
    kv: {
      primaryBound: primaryKv,
      dedicatedBound: activeDedicated,
      warnings: kvWarnings,
    },
  };

  const httpStatus = status === 'ok' ? 200 : 503;
  return json(response, { status: httpStatus });
}

function parseAdminIds(env) {
  const configured = String(env.ADMIN_IDS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id));

  const merged = new Set([...DEFAULT_ADMIN_IDS, ...configured]);
  return Array.from(merged.values());
}

function getChatKey(chatId, threadId) {
  return `${CHAT_PREFIX}${chatId}:${threadId ?? 0}`;
}

function getProjectKey(code) {
  return `${PROJECT_PREFIX}${code}`;
}

function getStateKey(uid) {
  return `${STATE_PREFIX}${uid}`;
}

function getUserKey(uid) {
  return `${USER_PREFIX}${uid}`;
}

function getUserAccountsKey(uid) {
  return `${USER_ACCOUNTS_PREFIX}${uid}`;
}

function getAccountMetaKey(accountId) {
  return `${ACCOUNT_META_PREFIX}${accountId}`;
}

function getReportArchiveKey(code, stamp) {
  return `${REPORT_ARCHIVE_PREFIX}${code}:${stamp}`;
}

function getReportPresetKey(uid) {
  return `${REPORT_PRESET_PREFIX}${uid}`;
}

function getDigestPresetKey(uid) {
  return `${DIGEST_PRESET_PREFIX}${uid}`;
}

function getProfileKey(campaignId) {
  return `${PROFILE_PREFIX}${campaignId}`;
}

function getAutoReportFlagKey(code, ymd, hm) {
  return `${AUTO_REPORT_FLAG_PREFIX}${code}:${ymd}:${hm}`;
}

function getWeeklyReportFlagKey(code, ymd) {
  return `${WEEKLY_REPORT_FLAG_PREFIX}${code}:${ymd}`;
}

function getAlertFlagKey(code, type, suffix) {
  return `${ALERT_FLAG_PREFIX}${code}:${type}:${suffix}`;
}

function getAutopauseStreakKey(code) {
  return `${AUTOPAUSE_STREAK_PREFIX}${code}`;
}

function getAutopauseAlertFlagKey(code, suffix) {
  return `${ALERT_FLAG_PREFIX}${code}:autopause:${suffix}`;
}

function getPortalKey(code) {
  return `${PORTAL_PREFIX}${code}`;
}

function buildHelpMessage() {
  return [
    'Привет! Это каркас бота отчётов по Meta Ads.',
    '',
    'Доступные команды:',
    '• /start — показать помощь',
    '• /help — краткая справка',
    '• /register — вызовите внутри нужного топика, чтобы привязать чат',
    '• /admin — открыть панель администратора (для ID из ADMIN_IDS)',
    '',
    'Остальные возможности будут добавляться по мере разработки.',
  ].join('\n');
}

function normalizeProject(raw = {}) {
  const safe = typeof raw === 'object' && raw ? raw : {};
  const period = typeof safe.period === 'string' && safe.period ? safe.period : 'yesterday';
  const rawTimes = Array.isArray(safe.times) && safe.times.length
    ? safe.times.map((value) => String(value))
    : [String(safe.time ?? '09:30')];
  const times = sortUniqueTimes(rawTimes);

  return {
    code: safe.code ?? '',
    act: safe.act ?? '',
    chat_id: safe.chat_id ?? null,
    thread_id: safe.thread_id ?? 0,
    period,
    times,
    mute_weekends: Boolean(safe.mute_weekends),
    active: safe.active !== false,
    billing: typeof safe.billing === 'string' ? safe.billing : 'paid',
    campaigns: Array.isArray(safe.campaigns) ? safe.campaigns.map((value) => String(value)) : [],
    kpi: {
      cpl: safe.kpi?.cpl ?? null,
      leads_per_day: safe.kpi?.leads_per_day ?? null,
      daily_budget: safe.kpi?.daily_budget ?? null,
    },
    weekly: {
      enabled: safe.weekly?.enabled !== false,
      mode: safe.weekly?.mode === 'week_yesterday' ? 'week_yesterday' : 'week_today',
    },
    autopause: {
      enabled: safe.autopause?.enabled === true,
      days: Number.isFinite(safe.autopause?.days) ? Number(safe.autopause.days) : 3,
    },
    alerts: {
      enabled: safe.alerts?.enabled !== false,
      billing_times: sortUniqueTimes(
        Array.isArray(safe.alerts?.billing_times) && safe.alerts.billing_times.length
          ? safe.alerts.billing_times
          : ALERT_BILLING_DEFAULT_TIMES,
      ),
      no_spend_by: (() => {
        if (!safe.alerts || !('no_spend_by' in safe.alerts)) {
          return '12:00';
        }

        const raw = safe.alerts.no_spend_by;
        if (raw === null || raw === '' || raw === false) {
          return null;
        }

        const normalized = normalizeTimeString(raw);
        return normalized ?? null;
      })(),
    },
    anomaly: {
      cpl_jump: typeof safe.anomaly?.cpl_jump === 'number' ? safe.anomaly.cpl_jump : 0.5,
      ctr_drop: typeof safe.anomaly?.ctr_drop === 'number' ? safe.anomaly.ctr_drop : 0.4,
      impr_drop: typeof safe.anomaly?.impr_drop === 'number' ? safe.anomaly.impr_drop : 0.5,
      freq: typeof safe.anomaly?.freq === 'number' ? safe.anomaly.freq : 3.5,
    },
    billing_paid_at: safe.billing_paid_at ?? null,
    billing_next_at: safe.billing_next_at ?? null,
  };
}

function normalizeTimeString(input = '') {
  const value = String(input ?? '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hhRaw, mmRaw] = value.split(':');
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) {
    return null;
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }

  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function sortUniqueTimes(times = []) {
  const unique = new Set();
  for (const entry of times || []) {
    const normalized = normalizeTimeString(entry);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique).sort();
}

function parseTimesList(input = '') {
  const parts = String(input ?? '')
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const normalized = sortUniqueTimes(parts);
  return normalized;
}

function chunkArray(items, chunkSize) {
  const size = Math.max(1, Number(chunkSize) || 1);
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function sanitizeProjectCode(input = '') {
  return String(input ?? '').trim();
}

function isValidProjectCode(value) {
  return PROJECT_CODE_PATTERN.test(value);
}

function normalizeAccountId(input = '') {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (/^act_\d+$/i.test(raw)) {
    return `act_${raw.replace(/^act_/i, '')}`;
  }
  if (/^\d+$/.test(raw)) {
    return `act_${raw}`;
  }
  return raw;
}

function normalizeCampaignId(input = '') {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^act_/i, '');
}

function createProjectDraft(data = {}) {
  return normalizeProject({
    code: data.code ?? '',
    act: data.act ?? '',
    chat_id: data.chat_id ?? null,
    thread_id: data.thread_id ?? 0,
    period: data.period ?? 'yesterday',
    times: Array.isArray(data.times) && data.times.length ? data.times : ['09:30'],
    mute_weekends: Boolean(data.mute_weekends ?? false),
    active: data.active !== false,
    billing: typeof data.billing === 'string' ? data.billing : 'paid',
    campaigns: Array.isArray(data.campaigns) ? data.campaigns : [],
    kpi: data.kpi ?? {},
    weekly: data.weekly ?? { enabled: true, mode: 'week_today' },
    autopause: data.autopause ?? { enabled: false, days: 3 },
    alerts: data.alerts ?? {
      enabled: true,
      billing_times: ['10:00', '14:00', '18:00'],
      no_spend_by: '12:00',
    },
    anomaly: data.anomaly ?? {
      cpl_jump: 0.5,
      ctr_drop: 0.4,
      impr_drop: 0.5,
      freq: 3.5,
    },
    billing_paid_at: data.billing_paid_at ?? null,
    billing_next_at: data.billing_next_at ?? null,
  });
}

function formatProjectSummary(project) {
  const parts = [];
  parts.push(`<b>#${escapeHtml(project.code)}</b> → act <code>${escapeHtml(project.act || '—')}</code>`);
  if (project.chat_id) {
    parts.push(`Чат: <code>${project.chat_id}</code> · thread <code>${project.thread_id ?? 0}</code>`);
  }
  parts.push(`Период: ${escapeHtml(project.period)} · время: ${escapeHtml(project.times.join(', '))}`);
  parts.push(`Статус: ${project.active ? 'активен' : 'выкл.'} · биллинг: ${escapeHtml(project.billing)}`);
  return parts.join('\n');
}

async function buildProjectAlertContext(env, project) {
  const chatRecord = project.chat_id ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0) : null;
  const chatLabel = chatRecord?.title
    ? chatRecord.title
    : project.chat_id
    ? `chat ${project.chat_id}`
    : 'чат не привязан';
  const accountLabel = project.act ? project.act : 'нет аккаунта';

  return {
    chatRecord,
    chatLabel,
    accountLabel,
    header: `#${escapeHtml(project.code)} · ${escapeHtml(chatLabel)} · act <code>${escapeHtml(accountLabel)}</code>`,
  };
}

async function loadProject(env, code) {
  const kv = getPrimaryKv(env);
  if (!kv) return null;
  if (!code) return null;

  try {
    const raw = await kv.get(getProjectKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeProject({ ...parsed, code });
  } catch (error) {
    console.error('loadProject error', error);
    return null;
  }
}

async function saveProject(env, project) {
  const kv = getPrimaryKv(env);
  if (!kv) throw new Error('KV binding DB недоступен.');
  if (!project?.code) throw new Error('Код проекта обязателен.');

  const payload = JSON.stringify(normalizeProject(project));
  await kv.put(getProjectKey(project.code), payload);
}

async function mutateProject(env, code, mutator) {
  if (typeof mutator !== 'function') {
    throw new Error('mutator должен быть функцией');
  }

  const project = await loadProject(env, code);
  if (!project) {
    return null;
  }

  await mutator(project);
  await saveProject(env, project);
  return project;
}

async function listProjects(env, cursor, limit = DEFAULT_PAGE_SIZE) {
  const kv = getPrimaryKv(env);
  if (!kv) {
    return { items: [], cursor: null, listComplete: true };
  }

  const response = await kv.list({ prefix: PROJECT_PREFIX, cursor, limit });
  const items = [];

  for (const key of response.keys || []) {
    const code = key.name.slice(PROJECT_PREFIX.length);
    try {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      items.push(normalizeProject({ ...parsed, code }));
    } catch (error) {
      console.error('listProjects parse error', error, key.name);
    }
  }

  return {
    items,
    cursor: response.cursor ?? null,
    listComplete: response.list_complete ?? true,
  };
}

async function listAllProjects(env, { pageSize = 100, maxPages = 20 } = {}) {
  const collected = [];
  let cursor = undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const { items, cursor: nextCursor, listComplete } = await listProjects(env, cursor, pageSize);
    collected.push(...items);
    if (listComplete || !nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return collected;
}

async function loadUserState(env, uid) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return null;
  try {
    const raw = await kv.get(getStateKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadUserState error', error);
    return null;
  }
}

async function saveUserState(env, uid, state, options = {}) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return;
  const ttl = Number.isFinite(options.ttlSeconds)
    ? Number(options.ttlSeconds)
    : STATE_TTL_SECONDS;
  await kv.put(getStateKey(uid), JSON.stringify(state ?? {}), { expirationTtl: ttl });
}

async function clearUserState(env, uid) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return;
  await kv.delete(getStateKey(uid));
}

function normalizeReportPresetRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const name = sanitizeReportPresetName(raw.name ?? '');
  if (!name) {
    return null;
  }

  const allowedPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const period = allowedPeriods.has(raw.period) ? raw.period : 'yesterday';

  let minSpend = null;
  if (raw.minSpend !== null && typeof raw.minSpend !== 'undefined') {
    const value = Number(raw.minSpend);
    minSpend = Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : null;
  }

  const onlyPositive = raw.onlyPositive === true;
  const createdAt = typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : new Date().toISOString();
  const updatedAt = typeof raw.updated_at === 'string' && raw.updated_at ? raw.updated_at : createdAt;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : createReportPresetId();

  return {
    id,
    name,
    period,
    minSpend,
    onlyPositive,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function sortReportPresets(presets = []) {
  return presets
    .slice()
    .sort((left, right) => {
      const leftStamp = Date.parse(left.updated_at ?? left.created_at ?? 0);
      const rightStamp = Date.parse(right.updated_at ?? right.created_at ?? 0);
      const safeLeft = Number.isFinite(leftStamp) ? leftStamp : 0;
      const safeRight = Number.isFinite(rightStamp) ? rightStamp : 0;
      return safeRight - safeLeft;
    });
}

async function loadReportPresets(env, uid) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return [];
  }

  try {
    const raw = await kv.get(getReportPresetKey(uid));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((entry) => normalizeReportPresetRecord(entry))
      .filter((entry) => entry !== null);

    return sortReportPresets(normalized);
  } catch (error) {
    console.error('loadReportPresets error', error);
    return [];
  }
}

async function saveReportPresets(env, uid, presets) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return;
  }

  const normalized = Array.isArray(presets)
    ? presets.map((entry) => normalizeReportPresetRecord(entry)).filter((entry) => entry !== null)
    : [];

  const ordered = sortReportPresets(normalized).slice(0, REPORT_PRESET_LIMIT);

  await kv.put(getReportPresetKey(uid), JSON.stringify(ordered));
}

async function upsertReportPreset(env, uid, payload) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return null;
  }

  const name = sanitizeReportPresetName(payload?.name ?? '');
  if (!name) {
    return null;
  }

  const allowedPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const period = allowedPeriods.has(payload?.period) ? payload.period : 'yesterday';

  let minSpend = null;
  if (payload?.minSpend !== null && typeof payload?.minSpend !== 'undefined') {
    const value = Number(payload.minSpend);
    minSpend = Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : null;
  }

  const onlyPositive = payload?.onlyPositive === true;
  const now = new Date().toISOString();

  const current = await loadReportPresets(env, uid);
  const existingIndex = current.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());

  if (existingIndex >= 0) {
    const updated = {
      ...current[existingIndex],
      name,
      period,
      minSpend,
      onlyPositive,
      updated_at: now,
    };
    current.splice(existingIndex, 1, updated);
    await saveReportPresets(env, uid, current);
    return updated;
  }

  const entry = {
    id: createReportPresetId(),
    name,
    period,
    minSpend,
    onlyPositive,
    created_at: now,
    updated_at: now,
  };

  const next = [entry, ...current].slice(0, REPORT_PRESET_LIMIT);
  await saveReportPresets(env, uid, next);
  return entry;
}

async function deleteReportPreset(env, uid, presetId) {
  const kv = getReportsKv(env);
  if (!kv || !uid || !presetId) {
    return false;
  }

  const current = await loadReportPresets(env, uid);
  const next = current.filter((entry) => entry.id !== presetId);
  if (next.length === current.length) {
    return false;
  }

  await saveReportPresets(env, uid, next);
  return true;
}

function normalizeDigestPresetRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const name = sanitizeDigestPresetName(raw.name ?? '');
  if (!name) {
    return null;
  }

  const allowedPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const period = allowedPeriods.has(raw.period) ? raw.period : 'yesterday';
  const createdAt = typeof raw.created_at === 'string' && raw.created_at ? raw.created_at : new Date().toISOString();
  const updatedAt = typeof raw.updated_at === 'string' && raw.updated_at ? raw.updated_at : createdAt;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : createDigestPresetId();

  return {
    id,
    name,
    period,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function sortDigestPresets(presets = []) {
  return presets
    .slice()
    .sort((left, right) => {
      const leftStamp = Date.parse(left.updated_at ?? left.created_at ?? 0);
      const rightStamp = Date.parse(right.updated_at ?? right.created_at ?? 0);
      const safeLeft = Number.isFinite(leftStamp) ? leftStamp : 0;
      const safeRight = Number.isFinite(rightStamp) ? rightStamp : 0;
      return safeRight - safeLeft;
    });
}

async function loadDigestPresets(env, uid) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return [];
  }

  try {
    const raw = await kv.get(getDigestPresetKey(uid));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((entry) => normalizeDigestPresetRecord(entry))
      .filter((entry) => entry !== null);

    return sortDigestPresets(normalized);
  } catch (error) {
    console.error('loadDigestPresets error', error);
    return [];
  }
}

async function saveDigestPresets(env, uid, presets) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return;
  }

  const normalized = Array.isArray(presets)
    ? presets.map((entry) => normalizeDigestPresetRecord(entry)).filter((entry) => entry !== null)
    : [];

  const ordered = sortDigestPresets(normalized).slice(0, DIGEST_PRESET_LIMIT);
  await kv.put(getDigestPresetKey(uid), JSON.stringify(ordered));
}

async function upsertDigestPreset(env, uid, payload) {
  const kv = getReportsKv(env);
  if (!kv || !uid) {
    return null;
  }

  const name = sanitizeDigestPresetName(payload?.name ?? '');
  if (!name) {
    return null;
  }

  const allowedPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const period = allowedPeriods.has(payload?.period) ? payload.period : 'yesterday';
  const now = new Date().toISOString();

  const current = await loadDigestPresets(env, uid);
  const existingIndex = current.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());

  if (existingIndex >= 0) {
    const updated = {
      ...current[existingIndex],
      name,
      period,
      updated_at: now,
    };
    current.splice(existingIndex, 1, updated);
    await saveDigestPresets(env, uid, current);
    return updated;
  }

  const entry = {
    id: createDigestPresetId(),
    name,
    period,
    created_at: now,
    updated_at: now,
  };

  const next = [entry, ...current].slice(0, DIGEST_PRESET_LIMIT);
  await saveDigestPresets(env, uid, next);
  return entry;
}

async function deleteDigestPreset(env, uid, presetId) {
  const kv = getReportsKv(env);
  if (!kv || !uid || !presetId) {
    return false;
  }

  const current = await loadDigestPresets(env, uid);
  const next = current.filter((entry) => entry.id !== presetId);
  if (next.length === current.length) {
    return false;
  }

  await saveDigestPresets(env, uid, next);
  return true;
}

async function loadUserProfile(env, uid) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return null;
  try {
    const raw = await kv.get(getUserKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadUserProfile error', error);
    return null;
  }
}

async function saveUserProfile(env, uid, profile) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return;
  await kv.put(getUserKey(uid), JSON.stringify(profile ?? {}));
}

async function loadUserAccounts(env, uid) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return [];
  try {
    const raw = await kv.get(getUserAccountsKey(uid));
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('loadUserAccounts error', error);
    return [];
  }
}

async function saveUserAccounts(env, uid, accounts = []) {
  const kv = getPrimaryKv(env);
  if (!kv || !uid) return;
  await kv.put(getUserAccountsKey(uid), JSON.stringify(accounts ?? []));
}

async function saveAccountMeta(env, accountId, meta, options = {}) {
  const kv = getPrimaryKv(env);
  if (!kv || !accountId) return;
  const ttl = Number.isFinite(options.ttlSeconds) ? Number(options.ttlSeconds) : ACCOUNT_META_TTL_SECONDS;
  await kv.put(getAccountMetaKey(accountId), JSON.stringify(meta ?? {}), { expirationTtl: ttl });
}

async function loadAccountMeta(env, accountId) {
  const kv = getPrimaryKv(env);
  if (!kv || !accountId) return null;
  try {
    const raw = await kv.get(getAccountMetaKey(accountId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadAccountMeta error', error);
    return null;
  }
}

async function loadPortalRecord(env, code) {
  const kv = getPrimaryKv(env);
  if (!kv || !code) return null;
  try {
    const raw = await kv.get(getPortalKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : null;
  } catch (error) {
    console.error('loadPortalRecord error', error);
    return null;
  }
}

async function savePortalRecord(env, code, record = {}) {
  const kv = getPrimaryKv(env);
  if (!kv || !code) return;
  await kv.put(getPortalKey(code), JSON.stringify(record ?? {}));
}

async function deletePortalRecord(env, code) {
  const kv = getPrimaryKv(env);
  if (!kv || !code) return;
  try {
    await kv.delete(getPortalKey(code));
  } catch (error) {
    console.error('deletePortalRecord error', error);
  }
}

function generatePortalSignature() {
  const cryptoObj = globalThis?.crypto;
  const buffer = new Uint8Array(PORTAL_SIG_BYTES);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(buffer, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = META_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  const textBody = await response.text();
  let payload;
  try {
    payload = textBody ? JSON.parse(textBody) : {};
  } catch (error) {
    throw new Error(`Не удалось разобрать ответ Meta: ${error?.message ?? error}`);
  }

  if (!response.ok) {
    const message = payload?.error?.message || textBody || `HTTP ${response.status}`;
    const code = payload?.error?.code ? ` (code ${payload.error.code})` : '';
    throw new Error(`Meta API error${code}: ${message}`);
  }

  if (payload?.error) {
    const { message, code } = payload.error;
    throw new Error(`Meta API error${code ? ` (code ${code})` : ''}: ${message}`);
  }

  return payload;
}

async function graphGet(path, { token, params = {} } = {}) {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${path}`);
  if (token) {
    url.searchParams.set('access_token', token);
  }
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'undefined' || value === null) continue;

    let normalized = value;
    if (key === 'fields') {
      const sanitized = sanitizeFieldsParamValue(value);
      if (!sanitized) {
        continue;
      }
      normalized = sanitized;
    }

    url.searchParams.set(key, String(normalized));
  }

  return fetchJsonWithTimeout(url.toString(), { method: 'GET' }, META_TIMEOUT_MS);
}

async function graphPost(path, { token, params = {}, body = {} } = {}) {
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${path}`);
  if (token) {
    url.searchParams.set('access_token', token);
  }
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'undefined' || value === null) continue;

    let normalized = value;
    if (key === 'fields') {
      const sanitized = sanitizeFieldsParamValue(value);
      if (!sanitized) {
        continue;
      }
      normalized = sanitized;
    }

    url.searchParams.set(key, String(normalized));
  }

  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'undefined' || value === null) continue;
    form.set(key, String(value));
  }

  return fetchJsonWithTimeout(
    url.toString(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    },
    META_TIMEOUT_MS,
  );
}

async function exchangeCodeForLongToken(env, code, redirectUri) {
  const baseParams = new URLSearchParams({
    client_id: env.FB_APP_ID,
    client_secret: env.FB_APP_SECRET,
    redirect_uri: redirectUri,
    code,
  });

  const shortUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${baseParams.toString()}`;
  const short = await fetchJsonWithTimeout(shortUrl, { method: 'GET' }, META_TIMEOUT_MS);
  if (!short?.access_token) {
    throw new Error('Meta не вернула access_token.');
  }

  let token = short.access_token;
  let expires = Number(short.expires_in ?? 0);

  try {
    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: env.FB_APP_ID,
      client_secret: env.FB_APP_SECRET,
      fb_exchange_token: short.access_token,
    });
    const longUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?${longParams.toString()}`;
    const long = await fetchJsonWithTimeout(longUrl, { method: 'GET' }, META_TIMEOUT_MS);
    if (long?.access_token) {
      token = long.access_token;
      if (Number.isFinite(Number(long.expires_in))) {
        expires = Number(long.expires_in);
      }
    }
  } catch (error) {
    console.warn('Не удалось обменять токен на долгоживущий', error);
  }

  return {
    access_token: token,
    expires_in: expires,
  };
}

function normalizeAccountRecord(row = {}) {
  const rawId = String(row.id ?? row.account_id ?? '').replace(/^act_/, '');
  if (!rawId) {
    return null;
  }

  return {
    id: `act_${rawId}`,
    account_id: rawId,
    name: row.name || `Account ${rawId}`,
    account_status: row.account_status ?? null,
    disable_reason: row.disable_reason ?? null,
    currency: row.currency ?? null,
    timezone: row.timezone_name ?? null,
    business: row.business?.name ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function syncUserAdAccounts(env, uid, token) {
  if (!token) {
    return { ok: false, error: 'missing_token' };
  }

  const params = {
    limit: '200',
    fields: 'id,name,account_status,disable_reason,currency,timezone_name,business{name}',
  };

  try {
    let nextUrl = null;
    const collected = [];

    for (let page = 0; page < 25; page += 1) {
      const payload = nextUrl
        ? await fetchJsonWithTimeout(nextUrl, { method: 'GET' }, META_TIMEOUT_MS)
        : await graphGet('me/adaccounts', { token, params });

      if (Array.isArray(payload?.data)) {
        for (const row of payload.data) {
          const normalized = normalizeAccountRecord(row);
          if (normalized) {
            collected.push(normalized);
          }
        }
      }

      if (!payload?.paging?.next) {
        break;
      }

      nextUrl = payload.paging.next;
    }

    const unique = new Map();
    for (const item of collected) {
      unique.set(item.account_id, item);
    }

    const list = Array.from(unique.values()).sort((a, b) => {
      return (a.name || '').localeCompare(b.name || '', 'ru');
    });

    await saveUserAccounts(env, uid, list);

    for (const item of list) {
      await saveAccountMeta(env, item.account_id, item);
    }

    return { ok: true, count: list.length };
  } catch (error) {
    console.error('syncUserAdAccounts error', error);
    return { ok: false, error: error?.message || 'unknown_error' };
  }
}

async function fetchAccountHealthSummary(env, project, token) {
  const actId = normalizeAccountId(project?.act ?? '');
  if (!actId) {
    return null;
  }

  const fields = [
    'id',
    'name',
    'account_status',
    'disable_reason',
    'is_prepay_account',
    'balance',
    'spend_cap',
    'amount_spent',
    'currency',
    'funding_source_details{display_string}',
  ].join(',');

  try {
    const payload = await graphGet(actId, { token, params: { fields } });
    return payload ?? null;
  } catch (error) {
    console.error('fetchAccountHealthSummary error', project?.code, error);
    return null;
  }
}

async function telegramRequest(env, method, payload) {
  if (typeof env.BOT_TOKEN !== 'string' || env.BOT_TOKEN.trim() === '') {
    throw new Error('BOT_TOKEN не задан. Невозможно обратиться к Telegram API.');
  }

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error (${response.status}): ${body}`);
  }

  return response.json();
}

async function telegramSendDocumentToChat(env, { chatId, threadId, filename, content, caption }) {
  if (typeof env.BOT_TOKEN !== 'string' || env.BOT_TOKEN.trim() === '') {
    throw new Error('BOT_TOKEN не задан. Невозможно отправить документ.');
  }
  if (!chatId) {
    throw new Error('Не указан chat_id для отправки документа.');
  }

  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (Number.isFinite(threadId) && threadId > 0) {
    form.append('message_thread_id', String(threadId));
  }
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }

  const blob = new Blob([content ?? ''], { type: 'text/csv; charset=utf-8' });
  form.append('document', blob, filename ?? 'report.csv');

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`,
    {
      method: 'POST',
      body: form,
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendDocument error (${response.status}): ${body}`);
  }

  return response.json();
}

async function telegramSendDocument(env, project, { filename, content, caption }) {
  if (!project?.chat_id) {
    throw new Error('У проекта не привязан чат для отправки документов.');
  }

  return telegramSendDocumentToChat(env, {
    chatId: project.chat_id,
    threadId: project.thread_id,
    filename,
    content,
    caption,
  });
}

async function telegramSendDirect(env, chatId, textContent, extra = {}) {
  if (!chatId) {
    return { ok: false, error: 'chat_id_missing' };
  }

  const payload = {
    chat_id: chatId,
    text: textContent,
    parse_mode: extra.parse_mode ?? 'HTML',
  };

  if (typeof extra.disable_notification !== 'undefined') {
    payload.disable_notification = extra.disable_notification;
  }

  if (typeof extra.reply_markup !== 'undefined') {
    payload.reply_markup = extra.reply_markup;
  }

  if (typeof extra.disable_web_page_preview !== 'undefined') {
    payload.disable_web_page_preview = extra.disable_web_page_preview;
  }

  return telegramRequest(env, 'sendMessage', payload);
}

async function telegramSendDocumentToUser(env, chatId, { filename, content, caption }) {
  return telegramSendDocumentToChat(env, {
    chatId,
    threadId: undefined,
    filename,
    content,
    caption,
  });
}

async function telegramSendMessage(env, message, textContent, extra = {}) {
  if (!message?.chat?.id) {
    return { ok: false, error: 'chat_id_missing' };
  }

  const payload = {
    chat_id: message.chat.id,
    text: textContent,
    parse_mode: extra.parse_mode ?? 'HTML',
  };

  if (message.message_thread_id && typeof extra.message_thread_id === 'undefined') {
    payload.message_thread_id = message.message_thread_id;
  }

  if (
    message.message_id &&
    typeof extra.reply_to_message_id === 'undefined' &&
    extra.disable_reply !== true
  ) {
    payload.reply_to_message_id = message.message_id;
  }

  for (const [key, value] of Object.entries(extra)) {
    if (['disable_reply', 'parse_mode'].includes(key)) continue;
    if (typeof value === 'undefined') continue;
    payload[key] = value;
  }

  try {
    await telegramRequest(env, 'sendMessage', payload);
    return { ok: true };
  } catch (error) {
    console.error('telegramSendMessage error', error);
    return { ok: false, error: String(error) };
  }
}

async function telegramAnswerCallback(env, callbackQuery, textContent) {
  if (!callbackQuery?.id) {
    return { ok: false, error: 'callback_query_missing' };
  }

  try {
    await telegramRequest(env, 'answerCallbackQuery', {
      callback_query_id: callbackQuery.id,
      text: textContent,
      show_alert: false,
    });
    return { ok: true };
  } catch (error) {
    console.error('telegramAnswerCallback error', error);
    return { ok: false, error: String(error) };
  }
}

async function saveRegisteredChat(env, message) {
  const kv = getPrimaryKv(env);
  if (!kv) {
    throw new Error('KV binding DB недоступен.');
  }

  const chatId = message.chat?.id;
  if (!chatId) {
    throw new Error('chat_id отсутствует в сообщении.');
  }

  const threadId = message.message_thread_id ?? 0;
  const record = {
    chat_id: chatId,
    thread_id: threadId,
    title: message.chat?.title ?? message.chat?.username ?? '—',
    thread_name: message.reply_to_message?.forum_topic_created?.name
      ?? message.forum_topic_created?.name
      ?? null,
    added_by: message.from?.id ?? null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  await kv.put(getChatKey(chatId, threadId), JSON.stringify(record));
  return record;
}

async function handleRegisterCommand(env, message) {
  if (!message?.chat?.id) {
    return telegramSendMessage(env, message, 'Не удалось определить чат. Попробуйте ещё раз.');
  }

  if (!message.message_thread_id) {
    return telegramSendMessage(
      env,
      message,
      'Вызовите команду внутри нужного топика (message_thread_id отсутствует).',
    );
  }

  try {
    const record = await saveRegisteredChat(env, message);
    const response = [
      '✅ Чат и топик зарегистрированы.',
      `chat_id: <code>${record.chat_id}</code>`,
      `thread_id: <code>${record.thread_id}</code>`,
    ];
    if (record.thread_name) {
      response.push(`Тема: ${record.thread_name}`);
    }

    return telegramSendMessage(env, message, response.join('\n'));
  } catch (error) {
    console.error('handleRegisterCommand error', error);
    return telegramSendMessage(
      env,
      message,
      'Не удалось сохранить привязку. Проверьте KV binding DB и повторите попытку.',
    );
  }
}

async function handleReportCommand(env, message, args) {
  if (!isAdmin(env, message?.from?.id)) {
    return telegramSendMessage(env, message, 'Нет доступа. Добавьте ваш ID в ADMIN_IDS.');
  }

  const code = sanitizeProjectCode(args[0] ?? '');
  if (!code) {
    return telegramSendMessage(env, message, 'Укажите код проекта: /report <код> [period]');
  }

  const periodRaw = args[1] ?? null;
  const project = await loadProject(env, code);
  if (!project) {
    return telegramSendMessage(env, message, `Проект <b>#${escapeHtml(code)}</b> не найден.`, {
      disable_reply: true,
    });
  }

  const period = periodRaw ?? project.period ?? 'yesterday';
  const periodValid = PERIOD_OPTIONS.some((option) => option.value === period);
  if (!periodValid) {
    const variants = PERIOD_OPTIONS.map((option) => option.value).join(', ');
    return telegramSendMessage(env, message, `Неизвестный период. Используйте один из вариантов: ${variants}`);
  }

  const timezone = env.DEFAULT_TZ || 'UTC';
  const range = getPeriodRange(period, timezone);
  if (!range) {
    return telegramSendMessage(env, message, 'Не удалось вычислить даты для выбранного периода.');
  }

  const { token } = await resolveMetaToken(env);
  if (!token) {
    return telegramSendMessage(env, message, 'Meta не подключена. Откройте /admin и подключите профиль.');
  }

  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);

  try {
    await sendProjectReport(env, project, {
      period,
      range,
      token,
      currency,
      archive: true,
      origin: 'manual',
      dmRecipients: [message.from.id].filter(Boolean),
      dmOptions: { disable_notification: false },
    });
    return telegramSendMessage(env, message, `Отчёт по <b>#${escapeHtml(project.code)}</b> отправлен в привязанный чат.`, {
      disable_reply: true,
    });
  } catch (error) {
    console.error('handleReportCommand error', error);
    return telegramSendMessage(env, message, `Не удалось подготовить отчёт: ${escapeHtml(error?.message ?? 'ошибка')}`);
  }
}

async function handleDigestCommand(env, message, args) {
  if (!isAdmin(env, message?.from?.id)) {
    return telegramSendMessage(env, message, 'Нет доступа. Добавьте ваш ID в ADMIN_IDS.');
  }

  const code = sanitizeProjectCode(args[0] ?? '');
  if (!code) {
    return telegramSendMessage(env, message, 'Укажите код проекта: /digest <код> [period]');
  }

  const periodRaw = args[1] ?? null;
  const project = await loadProject(env, code);
  if (!project) {
    return telegramSendMessage(env, message, `Проект <b>#${escapeHtml(code)}</b> не найден.`, {
      disable_reply: true,
    });
  }

  const period = periodRaw ?? project.period ?? 'yesterday';
  const periodValid = PERIOD_OPTIONS.some((option) => option.value === period);
  if (!periodValid) {
    const variants = PERIOD_OPTIONS.map((option) => option.value).join(', ');
    return telegramSendMessage(env, message, `Неизвестный период. Используйте один из вариантов: ${variants}`);
  }

  const timezone = env.DEFAULT_TZ || 'UTC';
  const range = getPeriodRange(period, timezone);
  if (!range) {
    return telegramSendMessage(env, message, 'Не удалось вычислить даты для выбранного периода.');
  }

  const { token } = await resolveMetaToken(env);
  if (!token) {
    return telegramSendMessage(env, message, 'Meta не подключена. Откройте /admin и подключите профиль.');
  }

  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);

  try {
    await sendProjectDigest(env, project, {
      period,
      range,
      token,
      currency,
      dmRecipients: [message.from.id].filter(Boolean),
      dmOptions: { disable_notification: false },
    });
    return telegramSendMessage(env, message, `Дайджест по <b>#${escapeHtml(project.code)}</b> отправлен в привязанный чат.`, {
      disable_reply: true,
    });
  } catch (error) {
    console.error('handleDigestCommand error', error);
    return telegramSendMessage(env, message, `Не удалось подготовить дайджест: ${escapeHtml(error?.message ?? 'ошибка')}`);
  }
}

async function handleTelegramCommand(env, message, command, args) {
  switch (command) {
    case '/start':
    case '/help':
      return telegramSendMessage(env, message, buildHelpMessage());
    case '/register':
      return handleRegisterCommand(env, message, args);
    case '/admin':
      return handleAdminCommand(env, message);
    case '/report':
      return handleReportCommand(env, message, args);
    case '/digest':
      return handleDigestCommand(env, message, args);
    default:
      if (command.startsWith('/')) {
        return telegramSendMessage(env, message, 'Команда пока не поддерживается.');
      }
      return { ok: true, skipped: true };
  }
}

async function handleUserStateMessage(env, message, textContent) {
  const uid = message?.from?.id;
  if (!uid) {
    return { handled: false, reason: 'no_uid' };
  }

  const state = await loadUserState(env, uid);
  if (!state) {
    return { handled: false, reason: 'no_state' };
  }

  if (state.mode === 'create_project') {
    if (state.step === 'await_code') {
      const code = sanitizeProjectCode(textContent);
      if (!code) {
        await telegramSendMessage(env, message, 'Код проекта не может быть пустым. Введите, например, th-client.', {
          disable_reply: true,
        });
        return { handled: true, step: 'await_code', error: 'empty_code' };
      }
      if (!isValidProjectCode(code)) {
        await telegramSendMessage(
          env,
          message,
          'Код допускает буквы, цифры, дефис и подчёркивание (3-32 символа). Попробуйте ещё раз.',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_code', error: 'invalid_code' };
      }

      const existing = await loadProject(env, code);
      if (existing) {
        await telegramSendMessage(
          env,
          message,
          `Проект <b>#${escapeHtml(code)}</b> уже существует. Введите другой код или отмените создание.`,
          { disable_reply: true },
        );
        return { handled: true, step: 'await_code', error: 'duplicate_code' };
      }

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_chat',
        data: { code },
      });

      const chatsResult = await listRegisteredChats(env, null, DEFAULT_PAGE_SIZE);
      const prompt = buildChatSelectionPrompt(chatsResult.items, {
        nextCursor: chatsResult.cursor ?? null,
        showReset: false,
      });

      await telegramSendMessage(env, message, `Код <b>#${escapeHtml(code)}</b> принят.`, { disable_reply: true });
      await telegramSendMessage(env, message, prompt.text, {
        reply_markup: prompt.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_chat' };
    }

    if (state.step === 'await_act') {
      const act = normalizeAccountId(textContent);
      if (!act) {
        await telegramSendMessage(
          env,
          message,
          'Введите идентификатор рекламного аккаунта (например, act_1234567890).',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_act', error: 'empty_act' };
      }

      const data = state.data ?? {};
      if (!data.code || !data.chat_id) {
        await saveUserState(env, uid, {
          mode: 'create_project',
          step: 'await_code',
          data: {},
        });
        await telegramSendMessage(
          env,
          message,
          'Сессия создания проекта повреждена. Начните заново и введите код проекта.',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_code', error: 'state_corrupted' };
      }

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_period',
        data: {
          ...data,
          act,
        },
      });

      const view = buildProjectPeriodPrompt();
      await telegramSendMessage(env, message, 'Рекламный аккаунт принят.', { disable_reply: true });
      await telegramSendMessage(env, message, view.text, {
        reply_markup: view.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_period' };
    }

    if (state.step === 'choose_chat') {
      await telegramSendMessage(
        env,
        message,
        'Выберите чат с помощью кнопок ниже. Если нужного чата нет, выполните /register в теме клиента.',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_chat', info: 'await_chat_selection' };
    }

    if (state.step === 'choose_period') {
      await telegramSendMessage(
        env,
        message,
        'Выберите период с помощью кнопок. По умолчанию используется «Вчера».',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_period', info: 'await_period_selection' };
    }

    if (state.step === 'await_times_manual') {
      const times = parseTimesList(textContent);
      if (!times.length) {
        await telegramSendMessage(
          env,
          message,
          'Введите время через запятую или пробел: например, "09:30, 13:00, 19:00".',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_times_manual', error: 'invalid_times' };
      }

      const data = { ...(state.data ?? {}) };
      data.times = times;
      data.mute_weekends = Boolean(data.mute_weekends);

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_billing',
        data,
      });

      await telegramSendMessage(env, message, 'Расписание сохранено. Перейдём к настройке биллинга.', {
        disable_reply: true,
      });

      const billingView = buildProjectBillingPrompt(data);
      await telegramSendMessage(env, message, billingView.text, {
        reply_markup: billingView.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_billing' };
    }

    if (state.step === 'choose_billing') {
      await telegramSendMessage(
        env,
        message,
        'Используйте кнопки ниже, чтобы выбрать состояние биллинга. Текст не требуется.',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_billing', info: 'await_billing_buttons' };
    }

    if (state.step === 'await_billing_manual') {
      const rawValue = String(textContent ?? '').trim();
      if (!rawValue) {
        await telegramSendMessage(
          env,
          message,
          'Введите дату оплаты или «нет», чтобы очистить значение.',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_billing_manual', error: 'billing_empty' };
      }

      const lower = rawValue.toLowerCase();
      const tz = env.DEFAULT_TZ || 'UTC';
      const data = { ...(state.data ?? {}) };

      if (['нет', 'none', 'off', 'clear', '-'].includes(lower)) {
        data.billing_paid_at = null;
        data.billing_next_at = null;
      } else {
        const parsed = parseDateInputToYmd(rawValue, tz);
        if (!parsed) {
          await telegramSendMessage(
            env,
            message,
            'Не удалось распознать дату. Введите YYYY-MM-DD или ДД.ММ.ГГГГ.',
            { disable_reply: true },
          );
          return { handled: true, step: 'await_billing_manual', error: 'billing_invalid_date' };
        }

        data.billing_paid_at = parsed;
        data.billing_next_at = addMonthsToYmd(parsed) || parsed;
        data.billing = data.billing || 'paid';
      }

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_billing',
        data,
      });

      await telegramSendMessage(env, message, 'Данные об оплате обновлены.', { disable_reply: true });

      const billingView = buildProjectBillingPrompt(data);
      await telegramSendMessage(env, message, billingView.text, {
        reply_markup: billingView.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_billing' };
    }

    if (state.step === 'choose_kpi') {
      await telegramSendMessage(
        env,
        message,
        'Для ввода KPI используйте кнопки. Текст не требуется.',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_kpi', info: 'await_kpi_buttons' };
    }

    if (state.step === 'await_kpi_field') {
      const field = state.field;
      const allowed = ['cpl', 'leads_per_day', 'daily_budget'];
      if (!field || !allowed.includes(field)) {
        await clearUserState(env, uid);
        await telegramSendMessage(
          env,
          message,
          'Настройка KPI отменена. Начните заново из мастера проекта.',
          { disable_reply: true },
        );
        return { handled: true, error: 'kpi_field_invalid' };
      }

      const rawValue = String(textContent ?? '').trim();
      const lower = rawValue.toLowerCase();
      let normalized = null;
      let cleared = false;

      if (!rawValue || ['нет', 'none', 'off', 'clear', '-'].includes(lower)) {
        normalized = null;
        cleared = true;
      } else {
        const parsed = Number(rawValue.replace(',', '.'));
        if (Number.isNaN(parsed)) {
          await telegramSendMessage(
            env,
            message,
            'Введите число или «нет», чтобы очистить значение.',
            { disable_reply: true },
          );
          return { handled: true, step: 'await_kpi_field', error: 'kpi_invalid_number' };
        }

        if (field === 'leads_per_day') {
          normalized = Math.max(0, Math.round(parsed));
        } else {
          normalized = Math.max(0, Math.round(parsed * 100) / 100);
        }
      }

      const data = { ...(state.data ?? {}) };
      data.kpi = { ...(data.kpi ?? {}) };
      data.kpi[field] = normalized;

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_kpi',
        data,
      });

      const labels = {
        cpl: 'CPL',
        leads_per_day: 'Лидов в день',
        daily_budget: 'Бюджет в день',
      };
      const resultText = cleared
        ? `${labels[field]} очищен.`
        : `${labels[field]} установлен на ${formatKpiValue(normalized)}.`;

      await telegramSendMessage(env, message, resultText, { disable_reply: true });

      const kpiView = buildProjectKpiSetupPrompt(data);
      await telegramSendMessage(env, message, kpiView.text, {
        reply_markup: kpiView.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_kpi' };
    }

    if (state.step === 'choose_alerts') {
      await telegramSendMessage(
        env,
        message,
        'Используйте кнопки мастера, чтобы выбрать настройки алертов.',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_alerts', info: 'await_alert_buttons' };
    }

    if (state.step === 'choose_automation') {
      await telegramSendMessage(
        env,
        message,
        'Настройте автоотчёты, сводник и автопаузу с помощью кнопок. Текст не требуется.',
        { disable_reply: true },
      );
      return { handled: true, step: 'choose_automation', info: 'await_automation_buttons' };
    }

    if (state.step === 'await_autopause_manual') {
      const rawValue = String(textContent ?? '').trim();
      if (!rawValue) {
        await telegramSendMessage(
          env,
          message,
          'Введите число дней (1–30) или «нет», чтобы отключить автопаузу.',
          { disable_reply: true },
        );
        return { handled: true, step: 'await_autopause_manual', error: 'autopause_empty' };
      }

      const lower = rawValue.toLowerCase();
      const payload = { ...(state.data ?? {}) };
      payload.active = payload.active !== false;
      payload.weekly = cloneWeeklyConfig(payload.weekly);
      payload.autopause = cloneAutopauseConfig(payload.autopause);

      if (['нет', 'none', 'off', 'disable', 'stop', 'выкл'].includes(lower)) {
        payload.autopause.enabled = false;
      } else {
        const parsed = Number(rawValue.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          await telegramSendMessage(
            env,
            message,
            'Нужно число дней (1–30) или «нет». Попробуйте снова.',
            { disable_reply: true },
          );
          return { handled: true, step: 'await_autopause_manual', error: 'autopause_invalid_number' };
        }

        payload.autopause.enabled = true;
        payload.autopause.days = normalizeAutopauseDays(parsed);
      }

      await saveUserState(env, uid, { mode: 'create_project', step: 'choose_automation', data: payload });

      const resultText = payload.autopause.enabled
        ? `Автопауза установлена на ${payload.autopause.days} дн.`
        : 'Автопауза отключена.';
      await telegramSendMessage(env, message, resultText, { disable_reply: true });

      const view = buildProjectAutomationSetupPrompt(payload);
      await telegramSendMessage(env, message, view.text, {
        reply_markup: view.reply_markup,
        disable_reply: true,
      });

      return { handled: true, step: 'choose_automation' };
    }

    return { handled: false, reason: 'unknown_step' };
  }

  if (state.mode === 'edit_schedule') {
    if (state.step !== 'await_time') {
      await clearUserState(env, uid);
      return { handled: true, reason: 'schedule_state_reset' };
    }

    const normalized = normalizeTimeString(textContent);
    if (!normalized) {
      await telegramSendMessage(
        env,
        message,
        'Не удалось распознать время. Введите HH:MM, например 08:45.',
        { disable_reply: true },
      );
      return { handled: true, error: 'invalid_time' };
    }

    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Связанного проекта не найдено. Повторите настройку расписания из карточки проекта.',
        { disable_reply: true },
      );
      return { handled: true, error: 'schedule_state_invalid' };
    }

    const project = await mutateProject(env, code, (proj) => {
      proj.times = sortUniqueTimes([...proj.times, normalized]);
    });

    await clearUserState(env, uid);

    if (!project) {
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Перейдите в карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    await telegramSendMessage(
      env,
      message,
      `Добавлено время ${normalized}. Расписание обновлено.`,
      { disable_reply: true },
    );

    if (state.message_chat_id && state.message_id) {
      await editMessageWithSchedule(
        env,
        { chat: { id: state.message_chat_id }, message_id: state.message_id },
        code,
      );
    }

    return { handled: true, step: 'schedule_updated' };
  }

  if (state.mode === 'edit_billing') {
    if (state.step !== 'await_paid' && state.step !== 'await_next') {
      await clearUserState(env, uid);
      return { handled: true, reason: 'billing_state_reset' };
    }

    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'billing_state_invalid' };
    }

    const rawValue = textContent.trim();
    if (!rawValue) {
      await telegramSendMessage(
        env,
        message,
        'Введите дату или используйте кнопки редактора.',
        { disable_reply: true },
      );
      return { handled: true, error: 'billing_empty' };
    }

    const tz = env.DEFAULT_TZ || 'UTC';
    const lower = rawValue.toLowerCase();
    let updatedProject = null;
    let responseText = '';

    if (state.step === 'await_next' && ['нет', 'none', 'off', 'clear', '-'].includes(lower)) {
      updatedProject = await mutateProject(env, code, (proj) => {
        proj.billing_next_at = null;
      });
      responseText = 'Следующая дата оплаты очищена.';
    } else {
      const parsedYmd = parseDateInputToYmd(rawValue, tz);
      if (!parsedYmd) {
        await telegramSendMessage(
          env,
          message,
          'Не удалось распознать дату. Введите YYYY-MM-DD или ДД.ММ.ГГГГ.',
          { disable_reply: true },
        );
        return { handled: true, error: 'billing_invalid_date' };
      }

      updatedProject = await mutateProject(env, code, (proj) => {
        if (state.step === 'await_paid') {
          proj.billing_paid_at = parsedYmd;
          const nextYmd = addMonthsToYmd(parsedYmd) || proj.billing_next_at || parsedYmd;
          proj.billing_next_at = nextYmd;
        } else {
          proj.billing_next_at = parsedYmd;
        }
      });

      responseText =
        state.step === 'await_paid'
          ? `Оплата зафиксирована (${parsedYmd}). Следующая дата обновлена автоматически.`
          : `Следующая дата оплаты установлена на ${parsedYmd}.`;
    }

    await clearUserState(env, uid);

    if (!updatedProject) {
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    await telegramSendMessage(env, message, responseText, { disable_reply: true });

    if (state.message_chat_id && state.message_id) {
      await editMessageWithBilling(
        env,
        { chat: { id: state.message_chat_id }, message_id: state.message_id },
        code,
        { preserveAwait: false },
      );
    }

    return { handled: true, step: 'billing_updated' };
  }

  if (state.mode === 'edit_alerts') {
    if (state.step !== 'await_billing' && state.step !== 'await_zero') {
      await clearUserState(env, uid);
      return { handled: true, reason: 'alerts_state_reset' };
    }

    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'alerts_state_invalid' };
    }

    if (state.step === 'await_billing') {
      const normalized = normalizeTimeString(textContent);
      if (!normalized) {
        await telegramSendMessage(
          env,
          message,
          'Не удалось распознать время. Введите HH:MM, например 08:45.',
          { disable_reply: true },
        );
        return { handled: true, error: 'alerts_invalid_time' };
      }

      const project = await mutateProject(env, code, (proj) => {
        proj.alerts = proj.alerts || {};
        const list = sortUniqueTimes(proj.alerts.billing_times || []);
        proj.alerts.billing_times = sortUniqueTimes([...list, normalized]);
        if (!('no_spend_by' in proj.alerts)) {
          proj.alerts.no_spend_by = '12:00';
        }
      });

      await clearUserState(env, uid);

      if (!project) {
        await telegramSendMessage(
          env,
          message,
          'Проект не найден. Откройте карточку и попробуйте снова.',
          { disable_reply: true },
        );
        return { handled: true, error: 'project_not_found' };
      }

      await telegramSendMessage(
        env,
        message,
        `Добавлено время ${normalized} для уведомлений billing.`,
        { disable_reply: true },
      );

      if (state.message_chat_id && state.message_id) {
        await editMessageWithAlerts(
          env,
          { chat: { id: state.message_chat_id }, message_id: state.message_id },
          code,
          { preserveAwait: false },
        );
      }

      return { handled: true, step: 'alerts_billing_updated' };
    }

    if (state.step === 'await_zero') {
      const rawValue = textContent.trim();
      if (!rawValue) {
        await telegramSendMessage(
          env,
          message,
          'Введите время контроля (HH:MM) или «нет», чтобы отключить zero-spend.',
          { disable_reply: true },
        );
        return { handled: true, error: 'alerts_zero_empty' };
      }

      const lower = rawValue.toLowerCase();
      const disable = ['нет', 'off', 'disable', 'stop', 'выкл'].includes(lower);
      let normalized = null;

      if (!disable) {
        normalized = normalizeTimeString(rawValue);
        if (!normalized) {
          await telegramSendMessage(
            env,
            message,
            'Не удалось распознать время. Введите HH:MM или «нет».',
            { disable_reply: true },
          );
          return { handled: true, error: 'alerts_zero_invalid' };
        }
      }

      const project = await mutateProject(env, code, (proj) => {
        proj.alerts = proj.alerts || {};
        proj.alerts.no_spend_by = disable ? null : normalized;
        proj.alerts.billing_times = sortUniqueTimes(proj.alerts.billing_times || ALERT_BILLING_DEFAULT_TIMES);
      });

      await clearUserState(env, uid);

      if (!project) {
        await telegramSendMessage(
          env,
          message,
          'Проект не найден. Откройте карточку и попробуйте снова.',
          { disable_reply: true },
        );
        return { handled: true, error: 'project_not_found' };
      }

      const responseText = disable
        ? 'Zero-spend уведомление отключено.'
        : `Zero-spend контроль установлен на ${normalized}.`;
      await telegramSendMessage(env, message, responseText, { disable_reply: true });

      if (state.message_chat_id && state.message_id) {
        await editMessageWithAlerts(
          env,
          { chat: { id: state.message_chat_id }, message_id: state.message_id },
          code,
          { preserveAwait: false },
        );
      }

      return { handled: true, step: 'alerts_zero_updated' };
    }

    return { handled: false, reason: 'alerts_state_unknown' };
  }

  if (state.mode === 'edit_autopause') {
    if (state.step !== 'await_days') {
      await clearUserState(env, uid);
      return { handled: true, reason: 'autopause_state_reset' };
    }

    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'autopause_state_invalid' };
    }

    const rawValue = textContent.trim();
    if (!rawValue) {
      await telegramSendMessage(
        env,
        message,
        'Введите число дней или «нет», чтобы отключить автопаузу.',
        { disable_reply: true },
      );
      return { handled: true, error: 'autopause_empty' };
    }

    const lower = rawValue.toLowerCase();
    let disable = false;
    let normalizedDays = null;

    if (['нет', 'off', 'disable', 'stop', 'выкл'].includes(lower)) {
      disable = true;
    } else {
      const parsed = Number(rawValue.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        await telegramSendMessage(
          env,
          message,
          'Нужно число дней (1–30) или «нет». Попробуйте снова.',
          { disable_reply: true },
        );
        return { handled: true, error: 'autopause_invalid_number' };
      }

      normalizedDays = Math.min(AUTOPAUSE_MAX_DAYS, Math.max(1, Math.round(parsed)));
    }

    const project = await mutateProject(env, code, (proj) => {
      proj.autopause = proj.autopause || { enabled: false, days: 3 };
      if (disable) {
        proj.autopause.enabled = false;
      } else {
        proj.autopause.enabled = true;
        proj.autopause.days = normalizedDays;
      }
      if (!Number.isFinite(proj.autopause.days)) {
        proj.autopause.days = 3;
      }
    });

    await clearUserState(env, uid);

    if (!project) {
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    const responseText = disable
      ? 'Автопауза отключена.'
      : `Порог автопаузы установлен на ${project.autopause?.days ?? normalizedDays} дн.`;

    await telegramSendMessage(env, message, responseText, { disable_reply: true });

    if (state.message_chat_id && state.message_id) {
      await editMessageWithAutopause(
        env,
        { chat: { id: state.message_chat_id }, message_id: state.message_id },
        code,
        { preserveAwait: false },
      );
    }

    return { handled: true, step: 'autopause_updated' };
  }

  if (state.mode === 'edit_kpi') {
    if (state.step !== 'await_value' || !state.field) {
      await clearUserState(env, uid);
      return { handled: true, reason: 'kpi_state_reset' };
    }

    const code = sanitizeProjectCode(state.code);
    const field = state.field;
    const allowed = ['cpl', 'leads_per_day', 'daily_budget'];
    if (!isValidProjectCode(code) || !allowed.includes(field)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Настройка KPI отменена. Откройте карточку проекта и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'kpi_state_invalid' };
    }

    const rawValue = textContent.trim();
    const lower = rawValue.toLowerCase();
    let normalized = null;
    let cleared = false;

    if (!rawValue || ['нет', 'none', 'off', 'clear', '-'].includes(lower)) {
      normalized = null;
      cleared = true;
    } else {
      const parsed = Number(rawValue.replace(',', '.'));
      if (Number.isNaN(parsed)) {
        await telegramSendMessage(
          env,
          message,
          'Введите число или «нет», чтобы очистить показатель.',
          { disable_reply: true },
        );
        return { handled: true, error: 'kpi_invalid_number' };
      }

      if (field === 'leads_per_day') {
        normalized = Math.max(0, Math.round(parsed));
      } else {
        normalized = Math.max(0, Math.round(parsed * 100) / 100);
      }
    }

    const project = await mutateProject(env, code, (proj) => {
      proj.kpi = proj.kpi || {};
      proj.kpi[field] = normalized;
    });

    await clearUserState(env, uid);

    if (!project) {
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Вернитесь в карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    const labels = {
      cpl: 'CPL',
      leads_per_day: 'Лидов в день',
      daily_budget: 'Бюджет в день',
    };

    const resultText = cleared
      ? `${labels[field]} очищен.`
      : `${labels[field]} установлен на ${formatKpiValue(normalized)}.`;

    await telegramSendMessage(env, message, resultText, { disable_reply: true });

    if (state.message_chat_id && state.message_id) {
      await editMessageWithKpi(
        env,
        { chat: { id: state.message_chat_id }, message_id: state.message_id },
        code,
        { preserveAwait: false },
      );
    }

    return { handled: true, step: 'kpi_updated' };
  }

  if (state.mode === 'report_options') {
    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и выберите «📤 Отчёт» заново.',
        { disable_reply: true },
      );
      return { handled: true, error: 'report_state_invalid' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    if (state.step === 'await_min_spend') {
      const rawValue = textContent.trim();
      const lower = rawValue.toLowerCase();
      let minSpend = null;
      let cleared = false;

      if (!rawValue || ['нет', 'none', 'off', 'clear', '-'].includes(lower)) {
        minSpend = null;
        cleared = true;
      } else {
        minSpend = sanitizeMinSpend(rawValue);
        if (minSpend === null) {
          await telegramSendMessage(
            env,
            message,
            'Введите число (например, 25 или 12.5) либо «нет» для сброса фильтра.',
            { disable_reply: true },
          );
          return { handled: true, error: 'report_invalid_min_spend' };
        }
      }

      const nextState = createReportState(project, {
        ...state,
        minSpend,
        step: 'menu',
      });
      await saveUserState(env, uid, nextState);

      const responseText = cleared
        ? 'Фильтр по минимальному расходу очищен.'
        : `Мин. расход установлен на ≥ ${formatNumber(minSpend)}.`;
      await telegramSendMessage(env, message, responseText, { disable_reply: true });

      if (state.message_chat_id && state.message_id) {
        await editMessageWithReportOptions(
          env,
          { chat: { id: state.message_chat_id }, message_id: state.message_id },
          code,
          { preserveAwait: true, uid, timezone: env.DEFAULT_TZ || 'UTC' },
        );
      }

      return { handled: true, step: 'report_min_spend_updated' };
    }

    if (state.step === 'await_preset_name') {
      const presetName = sanitizeReportPresetName(textContent);
      if (!presetName || presetName.length < 2) {
        await telegramSendMessage(env, message, 'Название должно содержать от 2 до 60 символов.', {
          disable_reply: true,
        });
        return { handled: true, error: 'report_preset_name_invalid' };
      }

      const normalizedState = createReportState(project, state);
      const preset = await upsertReportPreset(env, uid, {
        name: presetName,
        period: normalizedState.period,
        minSpend: normalizedState.minSpend,
        onlyPositive: normalizedState.onlyPositive,
      });

      const nextState = createReportState(project, {
        ...state,
        step: 'menu',
      });
      await saveUserState(env, uid, nextState);

      if (preset) {
        await telegramSendMessage(env, message, `Пресет «${escapeHtml(preset.name)}» сохранён.`, {
          disable_reply: true,
          parse_mode: 'HTML',
        });
      } else {
        await telegramSendMessage(env, message, 'Не удалось сохранить пресет. Попробуйте ещё раз.', {
          disable_reply: true,
        });
      }

      if (state.message_chat_id && state.message_id) {
        await editMessageWithReportOptions(
          env,
          { chat: { id: state.message_chat_id }, message_id: state.message_id },
          code,
          { preserveAwait: true, uid, timezone: env.DEFAULT_TZ || 'UTC' },
        );
      }

      return { handled: true, step: 'report_preset_saved' };
    }

    await telegramSendMessage(env, message, 'Используйте кнопки меню отчёта для настройки.', {
      disable_reply: true,
    });
    return { handled: true, info: 'report_idle' };
  }

  if (state.mode === 'digest_options') {
    const code = sanitizeProjectCode(state.code);
    if (!isValidProjectCode(code)) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и выберите «📬 Дайджест» заново.',
        { disable_reply: true },
      );
      return { handled: true, error: 'digest_state_invalid' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await clearUserState(env, uid);
      await telegramSendMessage(
        env,
        message,
        'Проект не найден. Откройте карточку и попробуйте снова.',
        { disable_reply: true },
      );
      return { handled: true, error: 'project_not_found' };
    }

    if (state.step === 'await_preset_name') {
      const presetName = sanitizeDigestPresetName(textContent);
      if (!presetName || presetName.length < 2) {
        await telegramSendMessage(env, message, 'Название должно содержать от 2 до 60 символов.', {
          disable_reply: true,
        });
        return { handled: true, error: 'digest_preset_name_invalid' };
      }

      const normalizedState = createDigestState(project, state);
      const preset = await upsertDigestPreset(env, uid, {
        name: presetName,
        period: normalizedState.period,
      });

      const nextState = createDigestState(project, { ...state, step: 'menu' });
      await saveUserState(env, uid, nextState);

      if (preset) {
        await telegramSendMessage(env, message, `Пресет «${escapeHtml(preset.name)}» сохранён.`, {
          disable_reply: true,
          parse_mode: 'HTML',
        });
      } else {
        await telegramSendMessage(env, message, 'Не удалось сохранить пресет. Попробуйте ещё раз.', {
          disable_reply: true,
        });
      }

      if (state.message_chat_id && state.message_id) {
        await editMessageWithDigestOptions(
          env,
          { chat: { id: state.message_chat_id }, message_id: state.message_id },
          code,
          nextState,
          { timezone: env.DEFAULT_TZ || 'UTC', awaitingPresetName: false },
        );
      }

      return { handled: true, step: 'digest_preset_saved' };
    }

    await telegramSendMessage(env, message, 'Используйте кнопки меню дайджеста для настроек и отправки.', {
      disable_reply: true,
    });

    if (state.message_chat_id && state.message_id) {
      await editMessageWithDigestOptions(
        env,
        { chat: { id: state.message_chat_id }, message_id: state.message_id },
        code,
        state,
        { timezone: env.DEFAULT_TZ || 'UTC', awaitingPresetName: state.step === 'await_preset_name' },
      );
    }

    return { handled: true, info: 'digest_prompt_repeat' };
  }

  return { handled: false, reason: 'unknown_mode' };
}

function extractMessage(update) {
  if (update.message) return update.message;
  if (update.edited_message) return update.edited_message;
  if (update.callback_query?.message) return update.callback_query.message;
  return null;
}

function extractText(message) {
  if (!message) return '';
  return message.text ?? message.caption ?? '';
}

async function handleTelegramWebhook(request, env) {
  if (request.method !== 'POST') {
    return methodNotAllowed(['POST']);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: 'bad_request', message: 'Ожидался JSON от Telegram', details: String(error) }, { status: 400 });
  }

  const message = extractMessage(payload);
  const summary = { handled: false };

  if (payload.callback_query) {
    const result = await handleCallbackQuery(env, payload.callback_query);
    summary.handled = true;
    summary.kind = 'callback_query';
    summary.result = result;
    return json({ ok: true, summary });
  }

  if (!message) {
    return json({ ok: true, summary: { handled: false, reason: 'no_message' } });
  }

  const textContent = extractText(message).trim();
  if (!textContent) {
    return json({ ok: true, summary: { handled: false, reason: 'empty_text' } });
  }

  const parts = textContent.split(/\s+/);
  const rawCommand = parts[0];
  const command = rawCommand.split('@')[0].toLowerCase();
  const args = parts.slice(1);

  if (rawCommand.startsWith('/')) {
    const result = await handleTelegramCommand(env, message, command, args);
    summary.handled = true;
    summary.kind = 'command';
    summary.command = command;
    summary.result = result;
    return json({ ok: true, summary });
  }

  const stateResult = await handleUserStateMessage(env, message, textContent);
  summary.kind = 'state';
  summary.result = stateResult;
  summary.handled = Boolean(stateResult.handled);

  return json({ ok: true, summary });
}

async function handleFbAuth(request, env) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid');
  const force = url.searchParams.get('force');

  if (!uid) {
    return json({ error: 'bad_request', message: 'Параметр uid обязателен' }, { status: 400 });
  }

  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || !isAdmin(env, numericUid)) {
    return json({ error: 'forbidden', message: 'UID не имеет доступа к Meta OAuth.' }, { status: 403 });
  }

  const missing = [];
  ensureString(env.FB_APP_ID, 'FB_APP_ID', missing);
  ensureString(env.FB_APP_SECRET, 'FB_APP_SECRET', missing);

  if (missing.length) {
    return json({
      error: 'missing_env',
      message: 'Заполните переменные окружения для OAuth Meta.',
      missing,
    }, { status: 500 });
  }

  const redirectUri = `${env.WORKER_URL ?? url.origin}/fb_cb`;
  const scope = 'ads_read,ads_management,business_management';
  const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
  authUrl.searchParams.set('client_id', env.FB_APP_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', String(numericUid));
  authUrl.searchParams.set('scope', scope);
  if (force === '1') {
    authUrl.searchParams.set('auth_type', 'rerequest');
  }

  return Response.redirect(authUrl.toString(), 302);
}

async function handleFbCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const missing = [];
  ensureString(env.FB_APP_ID, 'FB_APP_ID', missing);
  ensureString(env.FB_APP_SECRET, 'FB_APP_SECRET', missing);

  if (missing.length) {
    return html(renderDebugPage({ missing, url }));
  }

  if (!code || !state) {
    return html('<p>Ошибка OAuth: отсутствуют параметры code или state.</p>', { status: 400 });
  }

  const uid = Number(state);
  if (!Number.isFinite(uid) || !isAdmin(env, uid)) {
    return html('<p>Недостаточно прав для подключения Meta.</p>', { status: 403 });
  }

  const redirectUri = `${env.WORKER_URL ?? url.origin}/fb_cb`;

  try {
    const tokenData = await exchangeCodeForLongToken(env, code, redirectUri);
    const accessToken = tokenData.access_token;
    const expiresIn = Number(tokenData.expires_in ?? 0);
    const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null;

    const profile = await graphGet('me', {
      token: accessToken,
      params: { fields: 'id,name' },
    });

    await saveUserProfile(env, uid, {
      fb_user: profile,
      fb_long_token: accessToken,
      fb_token_exp: expiresAt,
      updated_at: new Date().toISOString(),
    });

    const syncResult = await syncUserAdAccounts(env, uid, accessToken);

    const lines = [
      '<h1>Meta подключена</h1>',
      `<p>Пользователь: <strong>${escapeHtml(profile?.name ?? '—')}</strong></p>`,
      `<p>Найдено рекламных аккаунтов: <strong>${syncResult?.count ?? 0}</strong></p>`,
      '<p>Можно закрыть окно и вернуться в Telegram.</p>',
    ];

    return html(`<!doctype html><html lang="ru"><meta charset="utf-8"><body>${lines.join('')}</body></html>`);
  } catch (error) {
    console.error('handleFbCallback error', error);
    const message = error?.message || 'Неизвестная ошибка при подключении Meta.';
    return html(`<p>Не удалось подключить Meta: ${escapeHtml(message)}</p>`, { status: 500 });
  }
}

async function handleFbDebug(request, env) {
  const url = new URL(request.url);
  const missing = validateRequiredEnv(env);
  const uidParam = url.searchParams.get('uid');
  const uid = uidParam ? Number(uidParam) : null;

  if (uidParam && (!Number.isFinite(uid) || !isAdmin(env, uid))) {
    return html('<p>Указанный uid не имеет доступа к панели.</p>', { status: 403 });
  }

  const profile = Number.isFinite(uid) ? await loadUserProfile(env, uid) : null;
  const accounts = Number.isFinite(uid) ? await loadUserAccounts(env, uid) : [];

  let permissionsInfo = 'Нет данных';
  let adAccountsLive = null;
  let businessesLive = null;

  if (profile?.fb_long_token && Number.isFinite(uid)) {
    try {
      const perms = await graphGet('me/permissions', {
        token: profile.fb_long_token,
        params: { limit: '200' },
      });
      if (Array.isArray(perms?.data) && perms.data.length) {
        permissionsInfo = perms.data
          .map((item) => `${escapeHtml(item.permission ?? '—')}: ${escapeHtml(item.status ?? 'unknown')}`)
          .join(', ');
      } else {
        permissionsInfo = 'Ответ не содержит данных.';
      }
    } catch (error) {
      permissionsInfo = `Ошибка: ${escapeHtml(error?.message ?? String(error))}`;
    }

    try {
      const res = await graphGet('me/adaccounts', {
        token: profile.fb_long_token,
        params: { limit: '200' },
      });
      adAccountsLive = Array.isArray(res?.data) ? res.data.length : 0;
    } catch (error) {
      adAccountsLive = `Ошибка: ${escapeHtml(error?.message ?? String(error))}`;
    }

    try {
      const res = await graphGet('me/businesses', {
        token: profile.fb_long_token,
        params: { limit: '200' },
      });
      businessesLive = Array.isArray(res?.data) ? res.data.length : 0;
    } catch (error) {
      businessesLive = `Ошибка: ${escapeHtml(error?.message ?? String(error))}`;
    }
  }

  const listItems = [];
  if (missing.length) {
    listItems.push(`<li><strong>env:</strong> отсутствуют ${missing.map((item) => `<code>${escapeHtml(item)}</code>`).join(', ')}</li>`);
  } else {
    listItems.push('<li><strong>env:</strong> все обязательные переменные заданы</li>');
  }

  if (Number.isFinite(uid)) {
    listItems.push(`<li><strong>uid:</strong> ${uid}</li>`);
  } else {
    listItems.push('<li>Добавьте параметр <code>?uid=&lt;admin_id&gt;</code>, чтобы увидеть сведения о токене.</li>');
  }

  if (profile?.fb_user?.name) {
    listItems.push(`<li><strong>Meta пользователь:</strong> ${escapeHtml(profile.fb_user.name)}</li>`);
  } else {
    listItems.push('<li><strong>Meta пользователь:</strong> не подключён</li>');
  }

  listItems.push(`<li><strong>Аккаунтов в кеше:</strong> ${accounts.length}</li>`);

  if (adAccountsLive !== null) {
    listItems.push(`<li><strong>/me/adaccounts:</strong> ${escapeHtml(String(adAccountsLive))}</li>`);
  }

  if (businessesLive !== null) {
    listItems.push(`<li><strong>/me/businesses:</strong> ${escapeHtml(String(businessesLive))}</li>`);
  }

  listItems.push(`<li><strong>/me/permissions:</strong> ${permissionsInfo}</li>`);

  const accountsList = accounts
    .slice(0, 10)
    .map((item) => `<li>${escapeHtml(item.name)} — <code>act_${escapeHtml(item.account_id)}</code></li>`)
    .join('');

  const accountsBlock = accounts.length
    ? `<h2>Сохранённые аккаунты (${accounts.length})</h2><ul>${accountsList}${accounts.length > 10 ? '<li>…</li>' : ''}</ul>`
    : '<h2>Сохранённые аккаунты</h2><p>Список пуст. Подключите Meta и нажмите «Пересканировать» в админке.</p>';

  return html(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>th-reports debug</title>
    <style>
      body { font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #1f2933; }
      h1 { font-size: 24px; margin-bottom: 16px; }
      h2 { margin-top: 24px; font-size: 20px; }
      ul { padding-left: 20px; }
      code { background: #f5f6f8; padding: 2px 4px; border-radius: 4px; }
      footer { margin-top: 32px; color: #6b7280; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>th-reports — Meta debug</h1>
    <ul>${listItems.join('')}</ul>
    ${accountsBlock}
    <footer>Страница обновляет данные напрямую из Meta (если токен сохранён).</footer>
  </body>
</html>`);
}

function ensureWorkerUrl(env) {
  if (typeof env.WORKER_URL === 'string' && env.WORKER_URL.trim().length > 0) {
    return env.WORKER_URL.replace(/\/$/, '');
  }
  return 'https://th-reports.obe1kanobe25.workers.dev';
}

function isAdmin(env, userId) {
  if (!userId) return false;
  const admins = parseAdminIds(env);
  return admins.includes(Number(userId));
}

async function listRegisteredChats(env, cursor, limit = DEFAULT_PAGE_SIZE) {
  const kv = getPrimaryKv(env);
  if (!kv) {
    return { items: [], cursor: null, listComplete: true };
  }

  const response = await kv.list({ prefix: CHAT_PREFIX, cursor, limit });
  const items = [];
  for (const key of response.keys || []) {
    try {
      const raw = await kv.get(key.name);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      items.push({ key: key.name, ...parsed });
    } catch (error) {
      console.error('listRegisteredChats parse error', error, key.name);
    }
  }

  return {
    items,
    cursor: response.cursor ?? null,
    listComplete: response.list_complete ?? true,
  };
}

async function buildAdminHome(env, uid) {
  const baseUrl = ensureWorkerUrl(env);
  const safeUid = encodeURIComponent(String(uid ?? ''));
  const authUrl = `${baseUrl}/fb_auth?uid=${safeUid}`;
  const forceUrl = `${authUrl}&force=1`;

  const profile = await loadUserProfile(env, uid);
  const accounts = await loadUserAccounts(env, uid);

  const lines = ['<b>Админ-панель th-reports</b>', ''];

  if (profile?.fb_user?.name) {
    lines.push(`Meta подключена: <b>${escapeHtml(profile.fb_user.name)}</b>.`);
  } else {
    lines.push('Meta не подключена. Нажмите «Подключить Meta».');
  }

  if (profile?.fb_token_exp) {
    const remainingMs = Number(profile.fb_token_exp) - Date.now();
    if (Number.isFinite(remainingMs) && remainingMs > 0) {
      const daysLeft = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
      lines.push(`Токен действует ещё ~${daysLeft} дн.`);
    }
  }

  lines.push(`Аккаунтов в кеше: <b>${accounts.length}</b>.`);
  lines.push('');
  lines.push('Выберите действие:');

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔌 Подключить Meta', url: authUrl },
          { text: '♻️ Переподключить', url: forceUrl },
        ],
        [
          { text: '📈 Аккаунты Meta', callback_data: 'panel:accounts:0' },
          { text: '➕ Новый проект', callback_data: 'proj:create:start' },
        ],
        [
          { text: '🗂 Зарегистрированные чаты', callback_data: 'panel:chats:0' },
          { text: '📋 Проекты', callback_data: 'panel:projects:0' },
        ],
        [
          { text: '🔄 Обновить', callback_data: 'panel:home' },
        ],
      ],
    },
  };
}

function renderChatsPage(items, pagination = {}) {
  const lines = [];
  const inline_keyboard = [];

  if (!items.length) {
    lines.push('Пока нет зарегистрированных топиков. Используйте /register в нужной теме.');
  } else {
    items.forEach((item) => {
      const chatDescriptor = {
        chat_id: item.chat_id,
        thread_id: item.thread_id ?? 0,
        title: item.title ?? null,
      };
      lines.push(formatChatLine(chatDescriptor));

      const link = buildTelegramTopicLink(chatDescriptor.chat_id, chatDescriptor.thread_id);
      if (link) {
        const labelParts = [];
        if (chatDescriptor.title) {
          const short =
            chatDescriptor.title.length > 32
              ? `${chatDescriptor.title.slice(0, 31)}…`
              : chatDescriptor.title;
          labelParts.push(short);
        } else {
          labelParts.push(String(chatDescriptor.chat_id));
        }
        if (chatDescriptor.thread_id > 0) {
          labelParts.push(`#${chatDescriptor.thread_id}`);
        }
        inline_keyboard.push([
          {
            text: labelParts.join(' · '),
            url: link,
          },
        ]);
      }
    });

    if (pagination.nextCursor) {
      lines.push('', 'Показаны первые записи. Нажмите «Далее», чтобы увидеть ещё.');
    }
  }

  if (pagination.nextCursor) {
    inline_keyboard.push([
      { text: '➡️ Далее', callback_data: `panel:chats:next:${encodeURIComponent(pagination.nextCursor)}` },
    ]);
  }
  if (pagination.showReset) {
    inline_keyboard.push([{ text: '↩️ В начало', callback_data: 'panel:chats:0' }]);
  }
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: ['<b>Зарегистрированные чаты</b>', '', ...lines].join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function indexProjectsByAccount(env, { limit = 500 } = {}) {
  const map = new Map();
  let cursor = undefined;

  while (map.size < limit) {
    const pageSize = Math.min(DEFAULT_PAGE_SIZE, limit);
    const { items, cursor: nextCursor, listComplete } = await listProjects(env, cursor, pageSize);

    for (const raw of items) {
      const project = normalizeProject(raw);
      const actId = normalizeAccountId(project.act || '');
      if (!actId) continue;
      const bucket = map.get(actId) ?? [];
      bucket.push(project);
      map.set(actId, bucket);
    }

    if (listComplete || !nextCursor) {
      break;
    }

    cursor = nextCursor;
  }

  return map;
}

function extractGenericResults(actions = []) {
  const value = extractActionCount(actions, DEFAULT_REPORT_METRIC.actions);
  if (value > 0) {
    return value;
  }

  if (!Array.isArray(actions)) {
    return 0;
  }

  return actions.reduce((acc, entry) => {
    const numeric = Number(entry?.value);
    return Number.isFinite(numeric) ? acc + numeric : acc;
  }, 0);
}

async function fetchAccountInsightsRange(env, accountId, token, range) {
  if (!token || !accountId) {
    return null;
  }

  const actId = normalizeAccountId(accountId);
  if (!actId) return null;

  const params = {
    level: 'account',
    fields: 'spend,actions,impressions,clicks,ctr',
    limit: '1',
  };

  if (range?.preset) {
    params.date_preset = range.preset;
  } else if (range?.since && range?.until) {
    params.time_range = JSON.stringify({ since: range.since, until: range.until });
  } else {
    return null;
  }

  try {
    const payload = await graphGet(actId, { token, params });
    const row = Array.isArray(payload?.data) && payload.data.length ? payload.data[0] : null;
    if (!row) return null;
    const spend = Number(row.spend ?? 0);
    const results = extractGenericResults(row.actions ?? []);
    const impressions = Number(row.impressions ?? 0);
    const clicks = Number(row.clicks ?? 0);
    const ctr = Number(row.ctr ?? 0);
    return {
      spend,
      results,
      impressions,
      clicks,
      ctr,
      cpa: results > 0 ? spend / results : null,
    };
  } catch (error) {
    console.error('fetchAccountInsightsRange error', actId, range, error);
    return null;
  }
}

async function fetchAccountBestCampaignCpa(env, accountId, token, range) {
  if (!token || !accountId) {
    return null;
  }

  const actId = normalizeAccountId(accountId);
  if (!actId) return null;

  const params = {
    level: 'campaign',
    fields: 'campaign_name,spend,actions',
    limit: '200',
  };

  if (range?.since && range?.until) {
    params.time_range = JSON.stringify({ since: range.since, until: range.until });
  }

  try {
    const payload = await graphGet(actId, { token, params });
    let best = null;
    for (const row of payload?.data ?? []) {
      const spend = Number(row.spend ?? 0);
      const results = extractGenericResults(row.actions ?? []);
      if (!results || results <= 0) continue;
      const cpa = spend / results;
      if (!Number.isFinite(cpa) || cpa <= 0) continue;
      if (!best || cpa < best.cpa) {
        best = {
          name: row.campaign_name || `ID ${row.campaign_id ?? ''}`,
          cpa,
          spend,
          results,
        };
      }
    }
    return best;
  } catch (error) {
    console.error('fetchAccountBestCampaignCpa error', actId, error);
    return null;
  }
}

function describeAccountStatus(account = {}, health = null, currency = 'USD') {
  const source = health ?? account ?? {};
  const statusCode = Number(source.account_status);
  const disableReason = Number(source.disable_reason);
  const isPrepay = Boolean(source.is_prepay_account);
  const balance = Number(source.balance);
  const spendCap = Number(source.spend_cap);
  const amountSpent = Number(source.amount_spent);
  const funding = source?.funding_source_details?.display_string ?? null;

  if (!Number.isFinite(statusCode)) {
    return { label: 'Неизвестно', tone: 'neutral', detail: funding ?? null };
  }

  let label = 'Активен';
  let tone = 'ok';
  let detail = funding ?? null;

  if ([2, 3, 7, 8, 9, 1002].includes(statusCode)) {
    label = 'Выключен';
    tone = 'error';
  }

  if ([101, 102].includes(statusCode)) {
    label = 'Ошибка доступа';
    tone = 'warning';
  }

  if ([18, 25, 26].includes(disableReason)) {
    label = 'Сбой оплаты';
    tone = 'error';
    detail = 'Проверьте источник оплаты и лимиты.';
  } else if (isPrepay && Number.isFinite(balance) && balance <= 0) {
    label = 'Нужна оплата';
    tone = 'error';
    detail = `Баланс ${formatCurrency(balance, currency)}.`;
  } else if (Number.isFinite(spendCap) && spendCap > 0 && Number.isFinite(amountSpent) && amountSpent >= spendCap) {
    label = 'Достигнут лимит';
    tone = 'warning';
    detail = `Расход ${formatCurrency(amountSpent, currency)} из лимита ${formatCurrency(spendCap, currency)}.`;
  }

  return { label, tone, detail };
}

function evaluateAccountPerformance(snapshot = {}) {
  const primaryCpa = [snapshot.billing?.cpa, snapshot.last7?.cpa, snapshot.today?.cpa].find(
    (value) => Number.isFinite(value) && value > 0,
  );

  if (!Number.isFinite(primaryCpa) || primaryCpa <= 0) {
    return { label: 'Нет данных', emoji: '⚪️' };
  }

  const bestCandidate = [
    snapshot.bestCampaign?.cpa,
    snapshot.billing?.cpa,
    snapshot.last7?.cpa,
    snapshot.today?.cpa,
  ].filter((value) => Number.isFinite(value) && value > 0);

  const reference = bestCandidate.length ? Math.min(...bestCandidate) : primaryCpa;
  const ratio = primaryCpa / reference;

  if (ratio <= 1.3) {
    return { label: 'Отлично', emoji: '🟢' };
  }
  if (ratio <= 1.8) {
    return { label: 'Средне', emoji: '🟡' };
  }
  return { label: 'Плохо', emoji: '🔴' };
}

async function buildAccountSnapshot(env, account, { token, timezone, projects = [] } = {}) {
  if (!token || !account?.id) {
    return {};
  }

  const todayRange = getPeriodRange('today', timezone);
  const last7Range = getPeriodRange('last_7d', timezone);
  const monthRange = getPeriodRange('month_to_date', timezone);

  const [today, last7, month, lifetime, bestCampaign, health] = await Promise.all([
    fetchAccountInsightsRange(env, account.id, token, todayRange),
    fetchAccountInsightsRange(env, account.id, token, last7Range),
    fetchAccountInsightsRange(env, account.id, token, monthRange),
    fetchAccountInsightsRange(env, account.id, token, { preset: 'lifetime' }),
    fetchAccountBestCampaignCpa(env, account.id, token, last7Range),
    (async () => {
      try {
        return await fetchAccountHealthSummary(env, { act: account.id }, token);
      } catch (error) {
        console.error('buildAccountSnapshot health error', account.id, error);
        return null;
      }
    })(),
  ]);

  const billingProjects = Array.isArray(projects) ? projects : [];
  const billingDates = billingProjects
    .map((project) =>
      typeof project?.billing_paid_at === 'string' && isValidYmd(project.billing_paid_at)
        ? project.billing_paid_at
        : null,
    )
    .filter(Boolean)
    .sort();

  let billingSummary = null;

  if (billingDates.length) {
    const since = billingDates[billingDates.length - 1];
    const todayYmd = getTodayYmd(timezone) || null;
    if (since && todayYmd) {
      const normalizedSince = since > todayYmd ? todayYmd : since;
      if (normalizedSince <= todayYmd) {
        try {
          const spendSincePaid = await fetchAccountInsightsRange(env, account.id, token, {
            since: normalizedSince,
            until: todayYmd,
          });
          if (spendSincePaid) {
            billingSummary = {
              since: normalizedSince,
              spend: spendSincePaid.spend ?? 0,
              results: spendSincePaid.results ?? 0,
              cpa: Number.isFinite(spendSincePaid.cpa) ? spendSincePaid.cpa : null,
            };
          }
        } catch (error) {
          console.error('buildAccountSnapshot billing range error', account.id, since, error);
        }
      }
    }
  }

  return {
    today,
    last7,
    month,
    lifetime,
    bestCampaign,
    billing: billingSummary,
    health,
  };
}

async function fetchCampaignMeta(env, campaignId, token) {
  try {
    return await graphGet(campaignId, {
      token,
      params: { fields: 'id,name,status,effective_status,objective' },
    });
  } catch (error) {
    console.error('fetchCampaignMeta error', campaignId, error);
    return null;
  }
}

async function fetchCampaignPerformance(env, project, campaignId, token, timezone) {
  const ranges = {
    today: getPeriodRange('today', timezone),
    last7: getPeriodRange('last_7d', timezone),
    month: getPeriodRange('month_to_date', timezone),
  };

  const promises = Object.entries(ranges).map(async ([key, range]) => {
    try {
      const params = {
        time_range: JSON.stringify({ since: range.since, until: range.until }),
        fields: 'spend,actions,impressions,clicks,ctr',
        limit: '1',
      };
      const payload = await graphGet(`${campaignId}/insights`, { token, params });
      const row = Array.isArray(payload?.data) && payload.data.length ? payload.data[0] : null;
      if (!row) return [key, null];
      const spend = Number(row.spend ?? 0);
      const results = extractGenericResults(row.actions ?? []);
      return [
        key,
        {
          spend,
          results,
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          ctr: Number(row.ctr ?? 0),
          cpa: results > 0 ? spend / results : null,
        },
      ];
    } catch (error) {
      console.error('fetchCampaignPerformance range error', campaignId, key, error);
      return [key, null];
    }
  });

  promises.push(
    (async () => {
      try {
        const params = {
          date_preset: 'lifetime',
          fields: 'spend,actions,impressions,clicks,ctr',
          limit: '1',
        };
        const payload = await graphGet(`${campaignId}/insights`, { token, params });
        const row = Array.isArray(payload?.data) && payload.data.length ? payload.data[0] : null;
        if (!row) return ['lifetime', null];
        const spend = Number(row.spend ?? 0);
        const results = extractGenericResults(row.actions ?? []);
        return [
          'lifetime',
          {
            spend,
            results,
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            ctr: Number(row.ctr ?? 0),
            cpa: results > 0 ? spend / results : null,
          },
        ];
      } catch (error) {
        console.error('fetchCampaignPerformance lifetime error', campaignId, error);
        return ['lifetime', null];
      }
    })(),
  );

  const entries = await Promise.all(promises);
  return Object.fromEntries(entries);
}

async function fetchAdsetsForCampaignDetails(env, campaignId, token) {
  try {
    const params = {
      fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time',
      limit: '200',
    };
    const payload = await graphGet(`${campaignId}/adsets`, { token, params });
    return payload?.data ?? [];
  } catch (error) {
    console.error('fetchAdsetsForCampaignDetails error', campaignId, error);
    return [];
  }
}

async function fetchAdsForCampaign(env, campaignId, token, range) {
  try {
    const params = {
      fields: 'id,name,status,effective_status',
      limit: '50',
    };
    const ads = await graphGet(`${campaignId}/ads`, { token, params });

    const insightsParams = {
      level: 'ad',
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      fields: 'ad_id,spend,actions,impressions,clicks,ctr',
      limit: '200',
    };
    const insightsPayload = await graphGet(`${campaignId}/insights`, { token, params: insightsParams });
    const insightMap = new Map();
    for (const row of insightsPayload?.data ?? []) {
      const spend = Number(row.spend ?? 0);
      const results = extractGenericResults(row.actions ?? []);
      insightMap.set(row.ad_id, {
        spend,
        results,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        cpa: results > 0 ? spend / results : null,
      });
    }

    return (ads?.data ?? []).map((ad) => ({
      ...ad,
      performance: insightMap.get(ad.id) ?? null,
    }));
  } catch (error) {
    console.error('fetchAdsForCampaign error', campaignId, error);
    return [];
  }
}

async function renderAccountsPage(env, uid, profile, accounts = [], options = {}) {
  const pageSize = Number.isFinite(options.pageSize) && options.pageSize > 0 ? options.pageSize : DEFAULT_PAGE_SIZE;
  const total = accounts.length;
  let offset = Math.max(0, Number(options.offset) || 0);
  if (total > 0 && offset >= total) {
    offset = Math.max(0, total - pageSize);
  }
  const slice = accounts.slice(offset, offset + pageSize);

  const baseUrl = ensureWorkerUrl(env);
  const safeUid = encodeURIComponent(String(uid ?? ''));
  const authUrl = `${baseUrl}/fb_auth?uid=${safeUid}`;

  const lines = [];
  if (profile?.fb_user?.name) {
    lines.push(`Подключено как <b>${escapeHtml(profile.fb_user.name)}</b>.`);
  } else {
    lines.push('Meta ещё не подключена. Нажмите «Подключить Meta».');
  }

  let token = null;
  if (profile?.fb_long_token) {
    token = profile.fb_long_token;
  } else {
    const resolved = await resolveMetaToken(env);
    token = resolved.token;
  }

  const timezone = env.DEFAULT_TZ || 'UTC';
  const projectIndex = await indexProjectsByAccount(env);
  const accountSnapshots = new Map();

  if (token) {
    await Promise.all(
      slice.map(async (account) => {
        const related = projectIndex.get(normalizeAccountId(account.id)) || [];
        const snapshot = await buildAccountSnapshot(env, account, {
          token,
          timezone,
          projects: related,
        });
        accountSnapshots.set(account.id, snapshot);
      }),
    );
  }

  if (!total) {
    lines.push('Аккаунтов пока нет. После подключения Meta нажмите «Пересканировать».');
  } else {
    const rangeStart = offset + 1;
    const rangeEnd = offset + slice.length;
    lines.push(`Всего в кеше: <b>${total}</b>. Показаны ${rangeStart}–${rangeEnd}.`);
    lines.push('');
    for (const account of slice) {
      const snapshot = accountSnapshots.get(account.id) ?? {};
      const currency = getCurrencyFromMeta(snapshot.health ?? account);
      const status = describeAccountStatus(account, snapshot.health, currency);
      const score = evaluateAccountPerformance(snapshot);

      const headlineSpendValue = snapshot.billing?.spend ?? snapshot.today?.spend ?? 0;
      const headlineSpend = formatCurrency(headlineSpendValue, currency);

      const cpaCandidates = [
        snapshot.bestCampaign?.cpa,
        snapshot.billing?.cpa,
        snapshot.last7?.cpa,
        snapshot.today?.cpa,
      ].filter((value) => Number.isFinite(value) && value > 0);
      const minCpa = cpaCandidates.length ? Math.min(...cpaCandidates) : null;
      const avgCpaBase = [snapshot.billing?.cpa, snapshot.last7?.cpa, snapshot.today?.cpa].find(
        (value) => Number.isFinite(value) && value > 0,
      );

      const minCpaLabel = Number.isFinite(minCpa) ? formatCpa(minCpa, currency) : '—';
      const avgCpaLabel = Number.isFinite(avgCpaBase) ? formatCpa(avgCpaBase, currency) : '—';

      const summary = [
        `${escapeHtml(account.name)} — ${headlineSpend}`,
        `Мин. CPA: ${minCpaLabel}`,
        `Сред. CPA: ${avgCpaLabel}`,
        status.label,
        `${score.emoji} ${score.label}`,
      ].join(' · ');

      lines.push(`• <b>${summary}</b>`);
      if (snapshot.billing?.since) {
        lines.push(`  с оплаты от ${escapeHtml(formatDateLabel(snapshot.billing.since))}`);
      }
      if (status.detail) {
        lines.push(`  ${escapeHtml(status.detail)}`);
      }
      lines.push('');
    }
    if (slice.length) {
      lines.pop();
    }
  }

  const inline_keyboard = [];

  for (const account of slice) {
    const projects = projectIndex.get(normalizeAccountId(account.id)) || [];
    const snapshot = accountSnapshots.get(account.id) ?? {};
    const currency = getCurrencyFromMeta(snapshot.health ?? account);
    const status = describeAccountStatus(account, snapshot.health, currency);
    const score = evaluateAccountPerformance(snapshot);

    const headlineSpendValue = snapshot.billing?.spend ?? snapshot.today?.spend ?? 0;
    const headlineSpend = formatCurrency(headlineSpendValue, currency);

    const cpaCandidates = [
      snapshot.bestCampaign?.cpa,
      snapshot.billing?.cpa,
      snapshot.last7?.cpa,
      snapshot.today?.cpa,
    ].filter((value) => Number.isFinite(value) && value > 0);
    const minCpa = cpaCandidates.length ? Math.min(...cpaCandidates) : null;
    const avgCpaBase = [snapshot.billing?.cpa, snapshot.last7?.cpa, snapshot.today?.cpa].find(
      (value) => Number.isFinite(value) && value > 0,
    );

    const minCpaLabel = Number.isFinite(minCpa) ? formatCpa(minCpa, currency) : '—';
    const avgCpaLabel = Number.isFinite(avgCpaBase) ? formatCpa(avgCpaBase, currency) : '—';

    const labelParts = [account.name, headlineSpend];
    if (minCpaLabel !== '—') labelParts.push(`Мин ${minCpaLabel}`);
    if (avgCpaLabel !== '—') labelParts.push(`Ср ${avgCpaLabel}`);
    labelParts.push(status.label);
    labelParts.push(`${score.emoji}`);

    if (projects.length === 1) {
      inline_keyboard.push([
        {
          text: labelParts.join(' · ').slice(0, 62),
          callback_data: `proj:detail:${projects[0].code}`,
        },
      ]);
    } else if (projects.length > 1) {
      inline_keyboard.push([
        {
          text: labelParts.join(' · ').slice(0, 62),
          callback_data: `panel:accounts:projects:${encodeURIComponent(account.id)}`,
        },
      ]);
    } else {
      inline_keyboard.push([
        {
          text: labelParts.join(' · ').slice(0, 62),
          callback_data: 'panel:accounts:noop',
        },
      ]);
    }
  }

  if (total > pageSize) {
    const navRow = [];
    if (offset > 0) {
      const prevOffset = Math.max(0, offset - pageSize);
      navRow.push({ text: '◀️ Назад', callback_data: `panel:accounts:page:${prevOffset}` });
    }
    if (offset + pageSize < total) {
      navRow.push({ text: '▶️ Далее', callback_data: `panel:accounts:page:${offset + pageSize}` });
    }
    if (navRow.length) {
      inline_keyboard.push(navRow);
    }
  }

  if (profile?.fb_long_token) {
    inline_keyboard.push([{ text: '🔁 Пересканировать', callback_data: 'panel:accounts:rescan' }]);
  } else {
    inline_keyboard.push([{ text: '🔌 Подключить Meta', url: authUrl }]);
  }

  inline_keyboard.push([{ text: '↩️ В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function collectProjectsForAccount(env, accountId) {
  const normalized = normalizeAccountId(accountId || '');
  if (!normalized) {
    return [];
  }

  const index = await indexProjectsByAccount(env, { limit: 1000 });
  return index.get(normalized) ?? [];
}

function renderAccountProjectsList(env, accountId, projects = []) {
  const normalized = normalizeAccountId(accountId || '');
  const lines = [`<b>Проекты по аккаунту ${escapeHtml(normalized || '—')}</b>`, ''];

  if (!projects.length) {
    lines.push('Проекты с этим аккаунтом не найдены.');
  } else {
    projects.forEach((project) => {
      const chatLabel = project.chat_id
        ? formatChatReference(
            { chat_id: project.chat_id, thread_id: project.thread_id ?? 0, title: project.chat_title ?? null },
            { withLink: true },
          )
        : 'нет привязки';
      lines.push(`• #${escapeHtml(project.code)} — ${chatLabel}`);
    });
  }

  const inline_keyboard = [];

  if (projects.length) {
    projects.slice(0, 8).forEach((project) => {
      const label = project.chat_title
        ? `⚙️ ${project.chat_title.slice(0, 50)} · ${project.code}`
        : `⚙️ ${project.code}`;
      inline_keyboard.push([
        { text: label.length > 62 ? `${label.slice(0, 61)}…` : label, callback_data: `proj:detail:${project.code}` },
      ]);
    });
  }

  inline_keyboard.push([{ text: '↩️ К аккаунтам', callback_data: 'panel:accounts:0' }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildTelegramTopicLink(chatId, threadId = 0) {
  const numericId = Number(chatId);
  if (!Number.isFinite(numericId) || numericId === 0) {
    return null;
  }

  const base = Math.abs(numericId).toString();
  let slug = base;
  if (slug.startsWith('100')) {
    slug = slug.slice(3);
  }
  if (!slug) {
    return null;
  }

  const threadNumeric = Number(threadId);
  const threadSegment = Number.isFinite(threadNumeric) && threadNumeric > 0 ? threadNumeric : 1;
  return `https://t.me/c/${slug}/${threadSegment}`;
}

function formatChatDisplay(chat, { hyperlink = false } = {}) {
  if (!chat?.chat_id) {
    return 'не привязан';
  }

  const thread = Number(chat.thread_id ?? 0);
  const title = chat.title ? String(chat.title) : `Чат ${chat.chat_id}`;
  const labelParts = [title];
  if (thread > 0) {
    labelParts.push(`#${thread}`);
  }
  const label = labelParts.join(' · ');
  let decorated = escapeHtml(label);

  if (hyperlink) {
    const link = buildTelegramTopicLink(chat.chat_id, thread);
    if (link) {
      decorated = `<a href="${escapeHtmlAttribute(link)}">${escapeHtml(label)}</a>`;
    }
  }

  const idParts = [`<code>${chat.chat_id}</code>`];
  if (thread > 0) {
    idParts.push(`thread <code>${thread}</code>`);
  }

  return `${decorated} · ${idParts.join(' · ')}`;
}

function formatChatLine(chat) {
  return `• ${formatChatDisplay(chat, { hyperlink: true })}`;
}

function formatChatReference(chat, options = {}) {
  return formatChatDisplay(chat, { hyperlink: Boolean(options?.withLink) });
}

async function loadChatRecord(env, chatId, threadId = 0) {
  const kv = getPrimaryKv(env);
  if (!kv || !Number.isFinite(Number(chatId))) {
    return null;
  }

  try {
    const raw = await kv.get(getChatKey(chatId, threadId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('loadChatRecord error', error);
    return null;
  }
}

function formatWeeklyLabel(weekly = {}) {
  if (!weekly?.enabled) {
    return 'выкл';
  }

  return weekly.mode === 'week_yesterday'
    ? 'вкл (неделя + вчера)'
    : 'вкл (неделя + сегодня)';
}

function formatAutopauseLabel(autopause = {}) {
  if (!autopause?.enabled) {
    return 'выкл';
  }

  const days = Number.isFinite(autopause.days) ? Number(autopause.days) : 3;
  return `вкл (${days} дн.)`;
}

function formatAlertsLabel(alerts = {}) {
  if (alerts?.enabled === false) {
    return 'выкл';
  }

  const billingTimes = sortUniqueTimes(alerts?.billing_times || []);
  const timesLabel = billingTimes.length ? billingTimes.join(', ') : '—';
  const normalizedZero = alerts?.no_spend_by ? normalizeTimeString(alerts.no_spend_by) : null;
  const zeroLabel = normalizedZero || (alerts?.no_spend_by ? String(alerts.no_spend_by) : null) || 'выкл';
  return `вкл · billing: ${timesLabel} · zero-spend: ${zeroLabel}`;
}

function formatPortalLabel(portalRecord, timezone = 'UTC') {
  if (!portalRecord?.sig) {
    return 'выкл';
  }

  if (portalRecord?.updated_at) {
    return `вкл (обновлено ${formatDateTimeLabel(portalRecord.updated_at, timezone)})`;
  }

  return 'вкл';
}

function buildPortalUrl(env, code, portalRecord) {
  if (!portalRecord?.sig) {
    return null;
  }

  const baseUrl = ensureWorkerUrl(env);
  return `${baseUrl}/p/${encodeURIComponent(code)}?sig=${encodeURIComponent(portalRecord.sig)}`;
}

function formatKpiLabel(kpi = {}) {
  const parts = [];
  parts.push(`CPL: ${kpi?.cpl ?? '—'}`);
  parts.push(`Л/д: ${kpi?.leads_per_day ?? '—'}`);
  parts.push(`Бюд/д: ${kpi?.daily_budget ?? '—'}`);
  return parts.join(' · ');
}

function formatKpiValue(value) {
  if (value === null || typeof value === 'undefined') {
    return '—';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  const parsed = Number(value);
  if (!Number.isNaN(parsed)) {
    return formatKpiValue(parsed);
  }

  return String(value);
}

function formatDateLabel(value) {
  if (!value) {
    return '—';
  }

  try {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch (error) {
    console.error('formatDateLabel error', error);
  }

  return String(value);
}

function formatDateTimeLabel(value, timezone = 'UTC') {
  if (!value) {
    return '—';
  }

  try {
    const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    const formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    return formatter.format(date);
  } catch (error) {
    console.error('formatDateTimeLabel error', error);
    return String(value);
  }
}

function isValidYmd(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return false;
  }

  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === ymd;
}

function getTodayYmd(timezone = 'UTC') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch (error) {
    console.error('getTodayYmd error', error);
    return new Date().toISOString().slice(0, 10);
  }
}

function getLocalHm(date, timezone = 'UTC') {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(date ?? new Date());
  } catch (error) {
    console.error('getLocalHm error', error);
    return new Date(date ?? Date.now()).toISOString().slice(11, 16);
  }
}

function getLocalWeekdayLabel(date, timezone = 'UTC') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    });
    return formatter.format(date ?? new Date());
  } catch (error) {
    console.error('getLocalWeekdayLabel error', error);
    return 'Mon';
  }
}

function isWeekend(date, timezone = 'UTC') {
  const label = getLocalWeekdayLabel(date, timezone);
  return label === 'Sat' || label === 'Sun';
}

function isMonday(date, timezone = 'UTC') {
  return getLocalWeekdayLabel(date, timezone) === 'Mon';
}

function shiftYmd(ymd, deltaDays) {
  if (!isValidYmd(ymd)) {
    return null;
  }

  const [year, month, day] = ymd.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function addMonthsToYmd(ymd, months = 1) {
  if (!isValidYmd(ymd)) {
    return null;
  }

  const [year, month, day] = ymd.split('-').map((part) => Number(part));
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  const result = new Date(Date.UTC(targetYear, normalizedMonthIndex, clampedDay));

  if (Number.isNaN(result.getTime())) {
    return null;
  }

  return result.toISOString().slice(0, 10);
}

function parseDateInputToYmd(rawInput, timezone = 'UTC') {
  if (typeof rawInput !== 'string') {
    return null;
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (['сегодня', 'today', 'today()'].includes(lower)) {
    return getTodayYmd(timezone);
  }

  if (['вчера', 'yesterday'].includes(lower)) {
    const today = getTodayYmd(timezone);
    return shiftYmd(today, -1);
  }

  const isoMatch = trimmed.match(/^(\d{4})[-./](\d{2})[-./](\d{2})$/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return isValidYmd(candidate) ? candidate : null;
  }

  const ruMatch = trimmed.match(/^(\d{2})[-./](\d{2})[-./](\d{4})$/);
  if (ruMatch) {
    const candidate = `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
    return isValidYmd(candidate) ? candidate : null;
  }

  return null;
}

function pickMetricForObjective(objective = '') {
  const key = String(objective || '').toUpperCase();
  return REPORT_METRIC_MAP[key] ?? DEFAULT_REPORT_METRIC;
}

function getMetricByShortCode(shortCode = '') {
  const normalized = String(shortCode || '').toLowerCase();
  return REPORT_METRIC_SHORT_MAP[normalized] ?? DEFAULT_REPORT_METRIC;
}

function extractActionCount(actions = [], actionTypes = []) {
  if (!Array.isArray(actions) || !actions.length) {
    return 0;
  }

  const lookup = new Map();
  for (const entry of actions) {
    if (!entry || typeof entry !== 'object') continue;
    const type = entry.action_type;
    const value = Number(entry.value);
    if (!type || !Number.isFinite(value)) continue;
    lookup.set(type, value);
  }

  for (const type of actionTypes) {
    if (lookup.has(type)) {
      return Number(lookup.get(type)) || 0;
    }
  }

  return 0;
}

function extractActionEntry(collection = [], actionTypes = []) {
  if (!Array.isArray(collection) || !collection.length) {
    return null;
  }

  for (const type of actionTypes) {
    const found = collection.find((entry) => entry?.action_type === type);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractActionValue(collection = [], actionTypes = []) {
  const entry = extractActionEntry(collection, actionTypes);
  if (!entry) {
    return 0;
  }

  const value = Number(entry.value);
  return Number.isFinite(value) ? value : 0;
}

function sumMetricCollection(collection = []) {
  if (!Array.isArray(collection) || !collection.length) {
    return 0;
  }

  let total = 0;
  for (const entry of collection) {
    const numeric = Number(entry?.value);
    if (Number.isFinite(numeric) && numeric > 0) {
      total += numeric;
    }
  }

  return total;
}

function pickMaxMetricValue(candidates = []) {
  let bestValue = 0;
  let bestSource = 'none';

  for (const [source, raw] of candidates) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }
    if (numeric > bestValue) {
      bestValue = numeric;
      bestSource = source;
    }
  }

  return { value: bestValue, source: bestSource };
}

function formatNumber(value) {
  const formatter = new Intl.NumberFormat('ru-RU');
  return formatter.format(Number.isFinite(value) ? value : 0);
}

function sanitizeMinSpend(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  const normalized = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.round(normalized * 100) / 100;
}

function formatCurrency(amount, currency = 'USD') {
  const safe = Number(amount) || 0;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${safe.toFixed(2)}`;
}

function formatCpa(amount, currency = 'USD') {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return formatCurrency(amount, currency);
}

function formatMoney(amount, currency = 'USD') {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return formatCurrency(amount, currency);
}

function formatPercentage(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
}

function formatFrequency(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(2);
}

function normalizeReportFilters(filters = {}) {
  const minSpend = sanitizeMinSpend(filters?.minSpend ?? filters?.min_spend);
  const onlyPositive = Boolean(filters?.onlyPositive ?? filters?.only_positive);
  return { minSpend, onlyPositive };
}

function formatReportFilters(filters = {}, currency = 'USD') {
  if (!filters || typeof filters !== 'object') {
    return '';
  }

  const parts = [];
  if (Number.isFinite(filters.minSpend) && filters.minSpend > 0) {
    parts.push(`расход ≥ ${formatCurrency(filters.minSpend, currency)}`);
  }
  if (filters.onlyPositive) {
    parts.push('только кампании с результатами');
  }

  if (!parts.length) {
    return 'без фильтров';
  }

  return parts.join(', ');
}

function getCurrencyFromMeta(meta) {
  const currency = meta?.currency;
  return typeof currency === 'string' && currency.trim().length ? currency : 'USD';
}

function getWeekdayIndex(ymd, timezone = 'UTC') {
  if (!isValidYmd(ymd)) {
    return 0;
  }

  try {
    const date = new Date(`${ymd}T00:00:00Z`);
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: timezone,
    });
    const label = formatter.format(date);
    const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    return map[label] ?? 0;
  } catch (error) {
    console.error('getWeekdayIndex error', error);
    return 0;
  }
}

function getPeriodRange(period, timezone = 'UTC') {
  const today = getTodayYmd(timezone);
  if (!today) {
    return null;
  }

  switch (period) {
    case 'today':
      return { since: today, until: today, label: 'сегодня' };
    case 'yesterday': {
      const yest = shiftYmd(today, -1);
      return yest ? { since: yest, until: yest, label: 'вчера' } : null;
    }
    case 'last_7d': {
      const since = shiftYmd(today, -6);
      return since ? { since, until: today, label: 'последние 7 дней' } : null;
    }
    case 'last_week': {
      const thisMonday = shiftYmd(today, -getWeekdayIndex(today, timezone));
      if (!thisMonday) return null;
      const lastMonday = shiftYmd(thisMonday, -7);
      const lastSunday = shiftYmd(lastMonday, 6);
      if (!lastMonday || !lastSunday) return null;
      return { since: lastMonday, until: lastSunday, label: 'прошлая неделя' };
    }
    case 'month_to_date': {
      const [year, month] = today.split('-');
      const monthStart = `${year}-${month}-01`;
      return { since: monthStart, until: today, label: 'с начала месяца' };
    }
    default:
      return null;
  }
}

async function resolveMetaToken(env) {
  const admins = parseAdminIds(env);
  for (const adminId of admins) {
    try {
      const profile = await loadUserProfile(env, adminId);
      if (profile?.fb_long_token) {
        return { token: profile.fb_long_token, owner: adminId };
      }
    } catch (error) {
      console.error('resolveMetaToken profile error', error);
    }
  }

  if (typeof env.FB_LONG_TOKEN === 'string' && env.FB_LONG_TOKEN.trim()) {
    return { token: env.FB_LONG_TOKEN.trim(), owner: null };
  }

  return { token: null, owner: null };
}

async function fetchCampaignInsights(env, project, token, range) {
  const actId = normalizeAccountId(project?.act ?? '');
  if (!actId) {
    throw new Error('У проекта не указан рекламный аккаунт.');
  }

  const params = {
    level: 'campaign',
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    fields: sanitizeInsightsFields(REPORT_INSIGHTS_FIELDS).join(','),
    limit: '200',
  };

  if (Array.isArray(project?.campaigns) && project.campaigns.length) {
    params.filtering = JSON.stringify([
      { field: 'campaign.id', operator: 'IN', value: project.campaigns },
    ]);
  }

  const items = [];
  let nextUrl = null;

  for (let page = 0; page < REPORT_MAX_PAGES; page += 1) {
    const payload = nextUrl
      ? await fetchJsonWithTimeout(nextUrl, { method: 'GET' }, META_TIMEOUT_MS)
      : await graphGet(`${actId}/insights`, { token, params });

    if (Array.isArray(payload?.data)) {
      items.push(...payload.data);
    }

    if (!payload?.paging?.next) {
      break;
    }

    nextUrl = payload.paging.next;
  }

  return items;
}

async function fetchCampaignMetadataMap(env, token, campaignIds = []) {
  const ids = Array.from(new Set((campaignIds ?? []).map((value) => normalizeCampaignId(value)).filter(Boolean)));
  const result = new Map();

  if (!ids.length || !token) {
    return result;
  }

  const chunks = chunkArray(ids, 25);

  for (const chunk of chunks) {
    try {
      const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/`);
      url.searchParams.set('access_token', token);
      url.searchParams.set('ids', chunk.join(','));
      url.searchParams.set(
        'fields',
        [
          'id',
          'objective',
          'optimization_goal',
          'promoted_object{custom_event_type,pixel_event,application_id,product_set_id}',
        ].join(','),
      );

      const payload = await fetchJsonWithTimeout(url.toString(), { method: 'GET' }, META_TIMEOUT_MS);
      for (const [rawId, data] of Object.entries(payload ?? {})) {
        const campaignId = normalizeCampaignId(rawId);
        if (!campaignId) continue;
        result.set(campaignId, {
          id: campaignId,
          objective: data?.objective ?? null,
          optimization_goal: data?.optimization_goal ?? null,
          promoted_object: data?.promoted_object ?? null,
        });
      }
    } catch (error) {
      console.error('fetchCampaignMetadataMap error', chunk, error);
    }
  }

  return result;
}

async function fetchAdInsights(env, project, token, range) {
  const actId = normalizeAccountId(project?.act ?? '');
  if (!actId) {
    return [];
  }

  const params = {
    level: 'ad',
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    fields: sanitizeInsightsFields(AD_INSIGHTS_FIELDS).join(','),
    limit: '200',
  };

  if (Array.isArray(project?.campaigns) && project.campaigns.length) {
    params.filtering = JSON.stringify([
      { field: 'campaign.id', operator: 'IN', value: project.campaigns },
    ]);
  }

  const items = [];
  let nextUrl = null;

  for (let page = 0; page < REPORT_MAX_PAGES; page += 1) {
    const payload = nextUrl
      ? await fetchJsonWithTimeout(nextUrl, { method: 'GET' }, META_TIMEOUT_MS)
      : await graphGet(`${actId}/insights`, { token, params });

    if (Array.isArray(payload?.data)) {
      items.push(...payload.data);
    }

    if (!payload?.paging?.next) {
      break;
    }

    nextUrl = payload.paging.next;
  }

  return items;
}

function normalizeObjectiveKey(value) {
  return String(value || '').toUpperCase();
}

function detectMetricKeyFromActions(actions = []) {
  const groups = {
    leads: ['lead', 'onsite_conversion.lead', 'onsite_conversion.lead_grouped'],
    dialogs: ['messaging_conversation_started', 'onsite_conversion.messaging_first_reply', 'messaging_first_reply'],
    conv: [
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'omni_purchase',
      'onsite_conversion.post_save',
      'complete_registration',
      'initiate_checkout',
      'subscribe',
    ],
    traffic: ['inline_link_click', 'link_click', 'landing_page_view', 'view_content'],
    engagement: ['post_engagement', 'video_view', 'thruplay', 'page_engagement'],
  };

  const totals = new Map();
  for (const [group, types] of Object.entries(groups)) {
    totals.set(group, extractActionCount(actions, types));
  }

  let selected = null;
  let bestValue = 0;
  for (const [group, value] of totals.entries()) {
    if (value > bestValue) {
      bestValue = value;
      selected = group;
    }
  }

  if (!selected || bestValue <= 0) {
    return null;
  }

  const mapping = {
    leads: 'leads',
    dialogs: 'dialogs',
    conv: 'conv',
    traffic: 'traffic',
    engagement: 'engagement',
  };

  return mapping[selected] ?? null;
}

function resolveMetricKey({ objective, optimizationGoal, promotedEvent, actions, fallback }) {
  const objectiveKey = normalizeObjectiveKey(objective);
  const goalKey = normalizeObjectiveKey(optimizationGoal);
  const promotedKey = normalizeObjectiveKey(promotedEvent);

  const objectiveMap = {
    LEAD_GENERATION: 'leads',
    LEADS: 'leads',
    MESSAGES: 'dialogs',
    CONVERSIONS: 'conv',
    SALES: 'conv',
    TRAFFIC: 'traffic',
    ENGAGEMENT: 'engagement',
    POST_ENGAGEMENT: 'engagement',
    VIDEO_VIEWS: 'engagement',
    AWARENESS: 'reach',
    REACH: 'reach',
    BRAND_AWARENESS: 'reach',
  };

  if (objectiveMap[objectiveKey]) {
    return objectiveMap[objectiveKey];
  }

  const goalMap = {
    OFFSITE_CONVERSIONS: 'conv',
    LEAD_GENERATION: 'leads',
    MESSAGES: 'dialogs',
    QUALITY_LEAD: 'leads',
    IMPRESSIONS: 'reach',
    REACH: 'reach',
    LINK_CLICKS: 'traffic',
    LANDING_PAGE_VIEWS: 'traffic',
    PAGE_ENGAGEMENT: 'engagement',
    VIDEO_VIEWS: 'engagement',
  };

  if (goalMap[goalKey]) {
    return goalMap[goalKey];
  }

  if (promotedKey && /PURCHASE|CHECKOUT|ORDER|PRODUCT/.test(promotedKey)) {
    return 'conv';
  }

  const detected = detectMetricKeyFromActions(actions);
  if (detected) {
    return detected;
  }

  return fallback ?? DEFAULT_REPORT_METRIC.short;
}

function hasProfileChanged(previous, next) {
  if (!previous) return true;
  if (!next) return false;
  return (
    previous.metric !== next.metric ||
    normalizeObjectiveKey(previous.objective) !== normalizeObjectiveKey(next.objective) ||
    normalizeObjectiveKey(previous.optimization_goal) !== normalizeObjectiveKey(next.optimization_goal) ||
    normalizeObjectiveKey(previous.promoted_event) !== normalizeObjectiveKey(next.promoted_event)
  );
}

async function resolveCampaignProfiles(env, project, insights, token) {
  const kv = getReportsKv(env);
  if (!kv) {
    return new Map();
  }

  const campaignIds = Array.from(
    new Set((insights ?? []).map((item) => normalizeCampaignId(item?.campaign_id)).filter(Boolean)),
  );

  const existing = new Map();
  for (const campaignId of campaignIds) {
    try {
      const raw = await kv.get(getProfileKey(campaignId));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        existing.set(campaignId, parsed);
      }
    } catch (error) {
      console.error('resolveCampaignProfiles load error', campaignId, error);
    }
  }

  const metadataMap = await fetchCampaignMetadataMap(env, token, campaignIds);
  const result = new Map();

  for (const insight of insights ?? []) {
    const campaignId = normalizeCampaignId(insight?.campaign_id);
    if (!campaignId) continue;

    const metadata = metadataMap.get(campaignId) ?? {};
    const stored = existing.get(campaignId) ?? null;
    const metricKey = resolveMetricKey({
      objective: metadata.objective ?? insight?.objective,
      optimizationGoal: metadata.optimization_goal,
      promotedEvent: metadata.promoted_object?.custom_event_type ?? metadata.promoted_object?.pixel_event,
      actions: insight?.actions ?? [],
      fallback: stored?.metric,
    });

    const metricConfig = getMetricByShortCode(metricKey);
    const profile = {
      id: campaignId,
      metric: metricConfig.short,
      metric_label: metricConfig.label,
      cost_label: metricConfig.costLabel ?? null,
      objective: metadata.objective ?? insight?.objective ?? null,
      optimization_goal: metadata.optimization_goal ?? null,
      promoted_event:
        metadata.promoted_object?.custom_event_type ??
        metadata.promoted_object?.pixel_event ??
        metadata.promoted_object?.application_id ??
        metadata.promoted_object?.product_set_id ??
        null,
      updated_at: new Date().toISOString(),
      source: hasProfileChanged(stored, profile) ? 'auto' : stored?.source ?? 'auto',
    };

    result.set(campaignId, profile);

    if (hasProfileChanged(stored, profile)) {
      try {
        await kv.put(getProfileKey(campaignId), JSON.stringify(profile), {
          expirationTtl: PROFILE_TTL_SECONDS,
        });
      } catch (error) {
        console.error('resolveCampaignProfiles save error', campaignId, error);
      }
    }
  }

  return result;
}

async function fetchAccountCampaignList(env, project, token, { limit = 200 } = {}) {
  const actId = normalizeAccountId(project?.act ?? '');
  if (!actId) {
    throw new Error('У проекта не указан рекламный аккаунт.');
  }

  const params = {
    fields: 'id,name,objective,status,configured_status,effective_status,updated_time',
    limit: String(limit),
  };

  const items = new Map();
  let nextUrl = null;

  for (let page = 0; page < REPORT_MAX_PAGES; page += 1) {
    const payload = nextUrl
      ? await fetchJsonWithTimeout(nextUrl, { method: 'GET' }, META_TIMEOUT_MS)
      : await graphGet(`${actId}/campaigns`, { token, params });

    if (Array.isArray(payload?.data)) {
      for (const row of payload.data) {
        const id = normalizeCampaignId(row?.id ?? '');
        if (!id) continue;
        if (!items.has(id)) {
          items.set(id, {
            id,
            name: row?.name ?? `Campaign ${id}`,
            objective: row?.objective ?? null,
            status: row?.status ?? null,
            configured_status: row?.configured_status ?? null,
            effective_status: row?.effective_status ?? null,
            updated_time: row?.updated_time ?? null,
          });
        }
      }
    }

    if (!payload?.paging?.next) {
      break;
    }

    nextUrl = payload.paging.next;
  }

  return Array.from(items.values()).sort((a, b) => {
    const aName = (a?.name ?? '').toLowerCase();
    const bName = (b?.name ?? '').toLowerCase();
    if (aName === bName) {
      return (a?.id ?? '').localeCompare(b?.id ?? '');
    }
    return aName.localeCompare(bName);
  });
}

async function fetchActiveCampaigns(env, project, token, { limit = 200 } = {}) {
  const actId = normalizeAccountId(project?.act ?? '');
  if (!actId) {
    return [];
  }

  const params = {
    fields: 'id,name,status,effective_status',
    limit: String(limit),
  };

  const items = [];
  let nextUrl = null;

  for (let page = 0; page < REPORT_MAX_PAGES; page += 1) {
    const payload = nextUrl
      ? await fetchJsonWithTimeout(nextUrl, { method: 'GET' }, META_TIMEOUT_MS)
      : await graphGet(`${actId}/campaigns`, { token, params });

    if (Array.isArray(payload?.data)) {
      items.push(...payload.data);
    }

    if (!payload?.paging?.next) {
      break;
    }

    nextUrl = payload.paging.next;
  }

  const allowedIds = new Set(
    Array.isArray(project?.campaigns) && project.campaigns.length ? project.campaigns.map(String) : [],
  );

  const normalized = [];
  for (const row of items) {
    const id = String(row?.id ?? '').replace(/^act_/, '');
    if (!id) continue;
    if (allowedIds.size && !allowedIds.has(row.id) && !allowedIds.has(id)) continue;

    normalized.push({
      id: row.id ?? id,
      name: row.name ?? `Campaign ${id}`,
      status: row.status ?? null,
      effective_status: row.effective_status ?? null,
    });
  }

  return normalized;
}

function isCampaignEffectivelyActive(row) {
  const effective = String(row?.effective_status ?? '').toUpperCase();
  if (!effective) return false;
  if (effective.includes('ACTIVE')) return true;
  if (effective.includes('IN_PROCESS')) return true;
  return false;
}

function applyReportFilters(insights = [], filters = {}) {
  const normalized = normalizeReportFilters(filters);
  const result = [];

  for (const item of Array.isArray(insights) ? insights : []) {
    if (!item || typeof item !== 'object') continue;

    const spend = Number(item.spend) || 0;
    if (normalized.minSpend !== null && Number.isFinite(normalized.minSpend) && spend < normalized.minSpend) {
      continue;
    }

    if (normalized.onlyPositive) {
      const metric = pickMetricForObjective(item.objective);
      const results = extractActionCount(item.actions ?? [], metric.actions);
      if (results <= 0) {
        continue;
      }
    }

    result.push(item);
  }

  return result;
}

function getMetricCostLabel(metric) {
  if (!metric) {
    return 'CPA';
  }

  if (metric.costLabel) {
    return metric.costLabel;
  }

  switch (metric.short) {
    case 'leads':
      return 'CPL';
    case 'dialogs':
      return 'CPD';
    default:
      return 'CPA';
  }
}

function computeMetricResults(item, metricConfig) {
  if (!metricConfig) {
    return { value: 0, source: 'none' };
  }

  const actions = Array.isArray(item?.actions) ? item.actions : [];
  const uniqueActions = Array.isArray(item?.unique_actions) ? item.unique_actions : [];
  const actionValues = Array.isArray(item?.action_values) ? item.action_values : [];
  const costPerAction = Array.isArray(item?.cost_per_action_type)
    ? item.cost_per_action_type
    : [];
  const outboundClicks = Array.isArray(item?.outbound_clicks) ? item.outbound_clicks : [];
  const uniqueOutboundClicks = Array.isArray(item?.unique_outbound_clicks)
    ? item.unique_outbound_clicks
    : [];
  switch (metricConfig.short) {
    case 'traffic': {
      const fromActions = extractActionCount(actions, metricConfig.actions ?? []);
      const landingViews = extractActionValue(actions, [
        'landing_page_view',
        'onsite_conversion.landing_page_view',
      ]);
      const inlineClicks = Number(item?.inline_link_clicks) || 0;
      const uniqueInline = Number(item?.unique_inline_link_clicks) || 0;
      const outbound = extractActionValue(outboundClicks, ['outbound_click']);
      const uniqueOutbound = extractActionValue(uniqueOutboundClicks, ['outbound_click']);
      const clicks = Number(item?.clicks) || 0;
      const selected = pickMaxMetricValue([
        ['actions', fromActions],
        ['landing_page_view', landingViews],
        ['inline_link_click', inlineClicks],
        ['unique_inline_link_click', uniqueInline],
        ['outbound_click', outbound],
        ['unique_outbound_click', uniqueOutbound],
        ['click', clicks],
      ]);
      return selected;
    }
    case 'engagement': {
      const fromActions = extractActionCount(actions, metricConfig.actions ?? []);
      const uniqueFromActions = extractActionCount(uniqueActions, metricConfig.actions ?? []);
      const clicks = Number(item?.clicks) || 0;
      const selected = pickMaxMetricValue([
        ['actions', fromActions],
        ['unique_actions', uniqueFromActions],
        ['click', clicks],
      ]);
      if (selected.value > 0) {
        return selected;
      }
      return { value: 0, source: 'engagement' };
    }
    case 'reach': {
      const reach = Number(item?.reach) || 0;
      const impressions = Number(item?.impressions) || 0;
      const fromActions = extractActionCount(actions, metricConfig.actions ?? []);
      if (reach > 0) {
        return { value: reach, source: 'reach' };
      }
      if (impressions > 0) {
        return { value: impressions, source: 'impressions' };
      }
      if (fromActions > 0) {
        return { value: fromActions, source: 'actions' };
      }
      return { value: 0, source: 'reach' };
    }
    default: {
      const fromActions = extractActionCount(actions, metricConfig.actions ?? []);
      if (fromActions > 0) {
        return { value: fromActions, source: 'actions' };
      }

      const fromValues = extractActionValue(actionValues, metricConfig.actions ?? []);
      if (fromValues > 0) {
        return { value: fromValues, source: 'action_values' };
      }

      const costEntry = extractActionEntry(costPerAction, metricConfig.actions ?? []);
      if (costEntry && Number.isFinite(Number(costEntry.value)) && Number(costEntry.value) > 0) {
        const spend = Number(item?.spend) || 0;
        const cost = Number(costEntry.value);
        if (spend > 0 && cost > 0) {
          return { value: spend / cost, source: 'derived_cost' };
        }
      }

      const fallback = sumMetricCollection(actions);
      return { value: fallback, source: 'actions_sum' };
    }
  }
}

function buildReportRows(insights = [], currency = 'USD', profiles = new Map()) {
  const rows = [];
  const metricShortNames = new Set();
  const metricCostCodes = new Set();
  let totalSpend = 0;
  let totalResults = 0;

  for (const item of insights) {
    const spend = Number(item?.spend) || 0;
    const campaignId = normalizeCampaignId(item?.campaign_id);
    const profile = (profiles instanceof Map && profiles.get(campaignId)) || null;
    const metric = profile ? getMetricByShortCode(profile.metric) : pickMetricForObjective(item?.objective);
    const resultInfo = computeMetricResults(item, metric);
    const results = Number(resultInfo.value) || 0;
    const cpa = results > 0 ? spend / results : NaN;
    metricShortNames.add(metric.short);
    metricCostCodes.add(getMetricCostLabel(metric));

    rows.push({
      id: campaignId || item?.campaign_id || '—',
      name: item?.campaign_name ?? '—',
      objective: item?.objective ?? '',
      spend,
      results,
      cpa: Number.isFinite(cpa) ? cpa : null,
      metric,
      costLabel: getMetricCostLabel(metric),
      profile,
      resultSource: resultInfo.source,
    });

    totalSpend += spend;
    totalResults += results;
  }

  const totalCpa = totalResults > 0 ? totalSpend / totalResults : null;

  const sorted = rows.sort((a, b) => b.spend - a.spend);

  const lines = sorted.map((row) => {
    const spendLabel = formatCurrency(row.spend, currency);
    const resultsLabel = formatNumber(row.results);
    const cpaLabel = formatCpa(row.cpa, currency);
    const metricCode = getMetricCostLabel(row.metric);
    return `• <b>${escapeHtml(row.name)}</b> — ${spendLabel} | ${row.metric.label}: ${resultsLabel} | ${metricCode}: ${cpaLabel}`;
  });

  let totalMetricCode = 'CPA';
  if (metricCostCodes.size === 1) {
    totalMetricCode = Array.from(metricCostCodes)[0];
  } else if (metricShortNames.size === 1 && metricShortNames.has('leads')) {
    totalMetricCode = 'CPL';
  }
  const totalLine = `<b>ИТОГО:</b> ${formatCurrency(totalSpend, currency)} | ${formatNumber(totalResults)} | ${totalMetricCode} ср: ${formatCpa(totalCpa, currency)}`;

  return { rows: sorted, lines, totalSpend, totalResults, totalCpa, totalLine };
}

function sumSpend(insights = []) {
  let total = 0;
  for (const row of Array.isArray(insights) ? insights : []) {
    total += Number(row?.spend) || 0;
  }
  return total;
}

function buildReportCardMessage(project, range, reportData, currency = 'USD') {
  const lines = [
    `#${escapeHtml(project.code)}`,
    `<b>Отчёт</b> (${range.since}–${range.until})`,
  ];

  if (!reportData.rows.length) {
    lines.push('Данных за период не найдено.');
    return lines.join('\n');
  }

  const topRows = reportData.rows.slice(0, 3);
  for (const row of topRows) {
    const spendLabel = formatCurrency(row.spend, currency);
    const resultsLabel = formatNumber(row.results);
    const costLabel = formatCpa(row.cpa, currency);
    const code = getMetricCostLabel(row.metric);
    lines.push(`• <b>${escapeHtml(row.name)}</b> — ${spendLabel} | ${row.metric.label}: ${resultsLabel} | ${code}: ${costLabel}`);
  }

  if (reportData.rows.length > topRows.length) {
    lines.push(`… и ещё ${reportData.rows.length - topRows.length} кампаний в списке`);
  }

  lines.push('', reportData.totalLine);
  return lines.filter(Boolean).join('\n');
}

function buildReportDetailMessage(project, range, reportData, currency = 'USD', filters = {}) {
  const lines = [
    `#${escapeHtml(project.code)}`,
    `<b>Подробный отчёт</b> (${range.since}–${range.until})`,
  ];

  const filterLabel = formatReportFilters(filters, currency);
  if (filterLabel) {
    lines.push(`Фильтры: ${escapeHtml(filterLabel)}`);
  }

  if (!reportData.rows.length) {
    lines.push('', 'Кампании не найдены для выбранных условий.');
    return lines.join('\n');
  }

  lines.push('', '<b>Кампании:</b>');
  for (const row of reportData.rows) {
    const spendLabel = formatCurrency(row.spend, currency);
    const resultsLabel = formatNumber(row.results);
    const costLabel = formatCpa(row.cpa, currency);
    const code = getMetricCostLabel(row.metric);
    const metricLabel = row.metric?.label ?? 'Результаты';
    lines.push(
      `• <b>${escapeHtml(row.name)}</b> — ${spendLabel} | ${metricLabel}: ${resultsLabel} | ${code}: ${costLabel}`,
    );
  }

  lines.push('', reportData.totalLine);
  return lines.join('\n');
}

function buildDigestMessage(project, range, reportData, currency = 'USD') {
  const creativeStats = buildCreativeStats([], new Map(), currency);
  const messages = buildDigestMessages(project, range, reportData, creativeStats, currency);
  return messages.chat;
}

function buildDigestMessages(project, range, reportData, creativeStats, currency = 'USD') {
  return {
    chat: buildDigestChatMessage(project, range, reportData, creativeStats, currency),
    detail: buildDigestDetailMessage(project, range, reportData, creativeStats, currency),
  };
}

function uniqueCreativeRows(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    if (!row) continue;
    const key = row.id || row.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function buildCreativeStats(adInsights = [], profiles = new Map(), currency = 'USD') {
  const rows = [];
  const metricCodes = new Set();
  let totalSpend = 0;
  let totalResults = 0;

  for (const item of Array.isArray(adInsights) ? adInsights : []) {
    if (!item) continue;

    const spend = Number(item.spend) || 0;
    const campaignId = normalizeCampaignId(item.campaign_id);
    const profile = profiles instanceof Map ? profiles.get(campaignId) ?? null : null;
    const metric = profile ? getMetricByShortCode(profile.metric) : pickMetricForObjective(item.objective);
    const resultsInfo = computeMetricResults(item, metric);
    const results = Number(resultsInfo.value) || 0;
    const clicks = Number(item.clicks) || 0;
    const impressions = Number(item.impressions) || 0;
    const ctrRaw = Number(item.ctr);
    const ctr = Number.isFinite(ctrRaw) && ctrRaw >= 0 ? ctrRaw : impressions > 0 && clicks > 0 ? (clicks / impressions) * 100 : null;
    const frequency = Number(item.frequency) || 0;
    const cpa = results > 0 ? spend / results : null;
    const cpc = clicks > 0 ? spend / clicks : null;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;

    totalSpend += spend;
    totalResults += results;
    if (metric?.costLabel) {
      metricCodes.add(metric.costLabel);
    }

    const fallbackId =
      item.ad_id ?? item.id ?? `${campaignId || 'unknown'}:${item.ad_name ?? 'ad'}`;
    const fallbackName =
      typeof item.ad_name === 'string' && item.ad_name.trim().length
        ? item.ad_name
        : item.ad_id
        ? `Ad ${item.ad_id}`
        : item.id
        ? `Ad ${item.id}`
        : '—';

    rows.push({
      id: fallbackId,
      name: fallbackName,
      campaignId,
      campaignName: item.campaign_name ?? null,
      spend,
      results,
      cpa,
      cpc,
      cpm,
      ctr,
      clicks,
      impressions,
      frequency,
      metric,
    });
  }

  rows.sort((a, b) => b.spend - a.spend);

  const topCreatives = rows.filter((row) => row.results > 0).slice(0, 3);
  const zeroResults = rows.filter((row) => row.results === 0 && row.spend > 0).slice(0, 3);
  const costly = rows
    .filter((row) => Number.isFinite(row.cpa) && row.results > 0)
    .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))
    .slice(0, 5);
  const underperforming = uniqueCreativeRows([...zeroResults, ...costly]).slice(0, 5);

  const totalCpa = totalResults > 0 ? totalSpend / totalResults : null;
  const metricCode = metricCodes.size === 1 ? Array.from(metricCodes)[0] : 'CPA';

  return {
    rows,
    totalSpend,
    totalResults,
    totalCpa,
    metricCode,
    topCreatives,
    zeroResults,
    underperforming,
    currency,
  };
}

function formatCreativeLine(row, currency = 'USD') {
  const metricLabel = row.metric?.label ?? 'Результаты';
  const costLabel = getMetricCostLabel(row.metric);
  return `• <b>${escapeHtml(row.name)}</b> — ${formatCurrency(row.spend, currency)} | ${metricLabel}: ${formatNumber(
    row.results,
  )} | ${costLabel}: ${formatCpa(row.cpa, currency)}`;
}

function describeCreativeAttention(row, currency = 'USD') {
  if (!row) {
    return '';
  }

  if (row.results === 0) {
    return 'нет результатов при расходе';
  }

  if (Number.isFinite(row.cpa)) {
    return `CPA ${formatCpa(row.cpa, currency)}`;
  }

  if (row.ctr && row.ctr > 0) {
    return `CTR ${formatPercentage(row.ctr)}`;
  }

  return 'требует проверки';
}

function buildDigestChatMessage(project, range, reportData, creativeStats, currency = 'USD') {
  const lines = [
    `#${escapeHtml(project.code)}`,
    `<b>Дайджест</b> (${range.since}–${range.until})`,
  ];

  if (reportData?.totalLine) {
    lines.push(reportData.totalLine);
  }

  if (creativeStats.topCreatives.length) {
    lines.push('', '<b>Топ креативы</b>');
    creativeStats.topCreatives.forEach((row) => {
      lines.push(formatCreativeLine(row, currency));
    });
  } else {
    lines.push('', 'Креативы с положительными результатами не найдены.');
  }

  const attentionList = creativeStats.underperforming;
  if (attentionList.length) {
    lines.push('', '<b>Нуждаются во внимании</b>');
    attentionList.forEach((row) => {
      const reason = describeCreativeAttention(row, currency);
      lines.push(
        `• <b>${escapeHtml(row.name)}</b> — ${formatCurrency(row.spend, currency)} · ${escapeHtml(reason)}`,
      );
    });
  }

  return lines.filter(Boolean).join('\n');
}

function buildDigestDetailMessage(project, range, reportData, creativeStats, currency = 'USD') {
  const lines = [
    `#${escapeHtml(project.code)}`,
    `<b>Детальный дайджест</b> (${range.since}–${range.until})`,
  ];

  if (reportData?.totalLine) {
    lines.push(reportData.totalLine);
  }

  const detailed = creativeStats.rows.slice(0, 10);
  if (!detailed.length) {
    lines.push('', 'Креативы за выбранный период отсутствуют.');
  } else {
    lines.push('', '<b>Креативы</b>');
    detailed.forEach((row) => {
      lines.push(formatCreativeLine(row, currency));

      const extras = [
        `CTR ${formatPercentage(row.ctr)}`,
        `CPC ${formatMoney(row.cpc, currency)}`,
        `CPM ${formatMoney(row.cpm, currency)}`,
        `Freq ${formatFrequency(row.frequency)}`,
      ];
      const campaignNote = row.campaignName ? `${escapeHtml(row.campaignName)} · ` : '';
      lines.push(`  ${campaignNote}${extras.join(' · ')}`);
    });
  }

  if (creativeStats.underperforming.length) {
    lines.push('', '<b>Проблемные креативы</b>');
    creativeStats.underperforming.forEach((row) => {
      const reason = describeCreativeAttention(row, currency);
      lines.push(`• ${escapeHtml(row.name)} — ${escapeHtml(reason)}`);
    });
  }

  return lines.filter(Boolean).join('\n');
}

function buildDigestCsv(project, range, creativeStats, currency = 'USD') {
  const header = [
    'Ad',
    'Campaign',
    'Metric',
    'Spend',
    'Results',
    creativeStats.metricCode || 'CPA',
    'CTR %',
    'Clicks',
    'CPC',
    'CPM',
    'Frequency',
  ];

  const rows = [header];

  for (const row of creativeStats.rows) {
    rows.push([
      row.name,
      row.campaignName ?? row.campaignId ?? '—',
      row.metric?.label ?? 'Результаты',
      Number(row.spend || 0).toFixed(2),
      row.results ?? 0,
      Number.isFinite(row.cpa) ? Number(row.cpa).toFixed(2) : '',
      Number.isFinite(row.ctr) ? row.ctr.toFixed(2) : '',
      row.clicks ?? 0,
      Number.isFinite(row.cpc) ? Number(row.cpc).toFixed(2) : '',
      Number.isFinite(row.cpm) ? Number(row.cpm).toFixed(2) : '',
      Number.isFinite(row.frequency) ? row.frequency.toFixed(2) : '',
    ]);
  }

  rows.push([
    'TOTAL',
    '',
    '',
    Number(creativeStats.totalSpend || 0).toFixed(2),
    creativeStats.totalResults ?? 0,
    Number.isFinite(creativeStats.totalCpa) ? Number(creativeStats.totalCpa).toFixed(2) : '',
    '',
    '',
    '',
    '',
    '',
  ]);

  return rows.map((line) => line.map(escapeCsvValue).join(';')).join('\n');
}

async function telegramSendToProject(env, project, textContent, extra = {}) {
  const chatId = project?.chat_id;
  if (!chatId) {
    throw new Error('У проекта не привязан чат. Используйте /register и обновите проект.');
  }

  const payload = {
    chat_id: chatId,
    text: textContent,
    parse_mode: extra.parse_mode ?? 'HTML',
  };

  if (Number.isFinite(project?.thread_id) && project.thread_id > 0) {
    payload.message_thread_id = project.thread_id;
  }

  for (const [key, value] of Object.entries(extra)) {
    if (['parse_mode'].includes(key)) continue;
    if (typeof value === 'undefined') continue;
    payload[key] = value;
  }

  await telegramRequest(env, 'sendMessage', payload);
  return { ok: true };
}

async function sendProjectReport(
  env,
  project,
  {
    period,
    range,
    token,
    currency,
    filters,
    deliverToChat = true,
    origin = 'manual',
    archive = false,
    sendCsv = false,
    pushSheets = false,
    dmRecipients = [],
    dmOptions = {},
  },
) {
  const payload = await buildProjectReport(env, project, { period, range, token, currency, filters });
  let delivered = false;
  let archiveKey = null;
  let csvInfo = null;
  let sheetsInfo = null;
  let csvFilename = null;
  let csvContent = null;
  const dmResults = [];

  if (deliverToChat !== false) {
    await telegramSendToProject(env, project, payload.chatMessage ?? payload.message, {});
    delivered = true;
  }

  if (sendCsv) {
    try {
      csvContent = buildReportCsv(project, range, payload, currency);
      csvFilename = `report_${project.code}_${range?.since ?? 'from'}_${range?.until ?? 'to'}.csv`;
      await telegramSendDocument(env, project, {
        filename: csvFilename,
        content: csvContent,
        caption: `CSV отчёт #${escapeHtml(project.code)} (${range?.since ?? ''}–${range?.until ?? ''})`,
      });
      csvInfo = { rows: payload.reportData.rows.length };
    } catch (error) {
      console.error('sendProjectReport csv error', error);
    }
  }

  if (archive) {
    try {
      archiveKey = await archiveReportRecord(env, project, {
        payload,
        period,
        range,
        origin,
        csvFilename,
      });
    } catch (error) {
      console.error('sendProjectReport archive error', error);
    }
  }

  if (pushSheets) {
    sheetsInfo = await pushReportToSheets(env, project, payload, { period, range });
  }

  if (Array.isArray(dmRecipients) && dmRecipients.length) {
    const text = payload.detailMessage ?? payload.chatMessage ?? payload.message;
    if (!csvContent && payload.reportData?.rows?.length) {
      try {
        csvContent = buildReportCsv(project, range, payload, currency);
        csvFilename = csvFilename ?? `report_${project.code}_${range?.since ?? 'from'}_${range?.until ?? 'to'}.csv`;
      } catch (error) {
        console.error('sendProjectReport dm csv build error', error);
        csvContent = null;
      }
    }

    for (const recipient of dmRecipients) {
      try {
        await telegramSendDirect(env, recipient, text, {
          disable_notification: dmOptions.disable_notification ?? true,
          disable_web_page_preview: dmOptions.disable_web_page_preview ?? true,
        });

        if (csvContent) {
          await telegramSendDocumentToUser(env, recipient, {
            filename: csvFilename ?? `report_${project.code}.csv`,
            content: csvContent,
            caption: `CSV отчёт #${escapeHtml(project.code)} (${range?.since ?? ''}–${range?.until ?? ''})`,
          });
        }

        dmResults.push({ chatId: recipient, ok: true });
      } catch (error) {
        console.error('sendProjectReport dm error', recipient, error);
        dmResults.push({ chatId: recipient, ok: false, error: error?.message ?? String(error) });
      }
    }
  }

  return {
    payload,
    delivered,
    archiveKey,
    csvInfo,
    sheets: sheetsInfo,
    dm: dmResults,
  };
}

async function buildProjectDigest(env, project, { period, range, token, currency }) {
  const insights = await fetchCampaignInsights(env, project, token, range);
  const profiles = await resolveCampaignProfiles(env, project, insights, token);
  const reportData = buildReportRows(insights, currency, profiles);
  const adInsights = await fetchAdInsights(env, project, token, range);
  const creativeStats = buildCreativeStats(adInsights, profiles, currency);
  const messages = buildDigestMessages(project, range, reportData, creativeStats, currency);
  const csv = buildDigestCsv(project, range, creativeStats, currency);

  return {
    period,
    range,
    currency,
    insights,
    reportData,
    adInsights,
    creativeStats,
    chatMessage: messages.chat,
    detailMessage: messages.detail,
    csv,
  };
}

async function sendProjectDigest(
  env,
  project,
  { period, range, token, currency, deliverToChat = true, dmRecipients = [], dmOptions = {}, sendCsvToChat = false },
) {
  const payload = await buildProjectDigest(env, project, { period, range, token, currency });
  const dmResults = [];

  if (deliverToChat !== false) {
    await telegramSendToProject(env, project, payload.chatMessage, {});
    if (sendCsvToChat && payload.csv) {
      try {
        const filename = `digest_${project.code}_${range?.since ?? 'from'}_${range?.until ?? 'to'}.csv`;
        await telegramSendDocument(env, project, {
          filename,
          content: payload.csv,
          caption: `CSV дайджест #${escapeHtml(project.code)} (${range?.since ?? ''}–${range?.until ?? ''})`,
        });
      } catch (error) {
        console.error('sendProjectDigest chat csv error', error);
      }
    }
  }

  if (Array.isArray(dmRecipients) && dmRecipients.length) {
    for (const recipient of dmRecipients) {
      try {
        await telegramSendDirect(env, recipient, payload.detailMessage ?? payload.chatMessage, {
          disable_notification: dmOptions.disable_notification ?? true,
          disable_web_page_preview: dmOptions.disable_web_page_preview ?? true,
        });
        if (payload.csv) {
          const filename = `digest_${project.code}_${range?.since ?? 'from'}_${range?.until ?? 'to'}_detail.csv`;
          await telegramSendDocumentToUser(env, recipient, {
            filename,
            content: payload.csv,
            caption: `CSV дайджест #${escapeHtml(project.code)} (${range?.since ?? ''}–${range?.until ?? ''})`,
          });
        }
        dmResults.push({ chatId: recipient, ok: true });
      } catch (error) {
        console.error('sendProjectDigest dm error', recipient, error);
        dmResults.push({ chatId: recipient, ok: false, error: error?.message ?? String(error) });
      }
    }
  }

  return { insightsCount: payload.insights.length, payload, dm: dmResults };
}

async function telegramNotifyAdmins(env, textContent, extra = {}) {
  const admins = parseAdminIds(env);
  if (!admins.length) {
    return [];
  }

  const results = [];
  for (const adminId of admins) {
    try {
      await telegramRequest(env, 'sendMessage', {
        chat_id: adminId,
        text: textContent,
        parse_mode: extra.parse_mode ?? 'HTML',
        disable_notification: extra.disable_notification ?? false,
        reply_markup: extra.reply_markup ?? undefined,
      });
      results.push({ adminId, ok: true });
    } catch (error) {
      console.error('telegramNotifyAdmins error', adminId, error);
      results.push({ adminId, ok: false, error: error?.message ?? String(error) });
    }
  }

  return results;
}

async function buildProjectReport(env, project, { period, range, token, currency, filters }) {
  const insights = await fetchCampaignInsights(env, project, token, range);
  const profiles = await resolveCampaignProfiles(env, project, insights, token);
  const appliedFilters = normalizeReportFilters(filters ?? {});
  const filteredInsights = applyReportFilters(insights, appliedFilters);
  const reportData = buildReportRows(filteredInsights, currency, profiles);
  const chatMessage = buildReportCardMessage(project, range, reportData, currency);
  const detailMessage = buildReportDetailMessage(project, range, reportData, currency, appliedFilters);
  return {
    message: chatMessage,
    chatMessage,
    detailMessage,
    reportData,
    insights,
    filteredInsights,
    filters: appliedFilters,
    profiles,
  };
}

function escapeCsvValue(value) {
  const safe = value === null || typeof value === 'undefined' ? '' : String(value);
  if (/[";\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function buildReportCsv(project, range, payload, currency = 'USD') {
  const rows = [
    ['Campaign', 'Metric', 'Spend', 'Results', 'CPA', 'PeriodSince', 'PeriodUntil', 'ProjectCode'],
  ];

  for (const row of payload.reportData.rows) {
    rows.push([
      row.name,
      row.metric?.label ?? '—',
      Number(row.spend || 0).toFixed(2),
      row.results ?? 0,
      Number.isFinite(row.cpa) ? Number(row.cpa).toFixed(2) : '',
      range?.since ?? '',
      range?.until ?? '',
      project.code ?? '',
    ]);
  }

  rows.push([
    'TOTAL',
    '',
    Number(payload.reportData.totalSpend || 0).toFixed(2),
    payload.reportData.totalResults ?? 0,
    Number.isFinite(payload.reportData.totalCpa)
      ? Number(payload.reportData.totalCpa).toFixed(2)
      : '',
    range?.since ?? '',
    range?.until ?? '',
    project.code ?? '',
  ]);

  return rows.map((line) => line.map(escapeCsvValue).join(';')).join('\n');
}

function buildCsvFromArchiveRecord(record, { projectCode } = {}) {
  if (!record) {
    return '';
  }

  const rows = [
    ['Campaign', 'Metric', 'Spend', 'Results', 'CPA', 'PeriodSince', 'PeriodUntil', 'ProjectCode'],
  ];

  for (const row of Array.isArray(record.rows) ? record.rows : []) {
    const metric = getMetricByShortCode(row?.metric);
    rows.push([
      row?.name ?? '—',
      metric.label,
      Number(row?.spend ?? 0).toFixed(2),
      Number(row?.results ?? 0),
      Number.isFinite(row?.cpa) ? Number(row.cpa).toFixed(2) : '',
      record.range?.since ?? '',
      record.range?.until ?? '',
      projectCode ?? '',
    ]);
  }

  const totals = record.totals ?? {};
  rows.push([
    'TOTAL',
    '',
    Number(totals.spend ?? 0).toFixed(2),
    Number(totals.results ?? 0),
    Number.isFinite(totals.cpa) ? Number(totals.cpa).toFixed(2) : '',
    record.range?.since ?? '',
    record.range?.until ?? '',
    projectCode ?? '',
  ]);

  return rows.map((line) => line.map(escapeCsvValue).join(';')).join('\n');
}

function getArchiveCsvFilename(project, record, stamp) {
  if (record?.csv_filename) {
    return record.csv_filename;
  }

  const since = record?.range?.since ?? record?.period ?? 'period';
  const until = record?.range?.until ?? record?.period ?? 'period';
  const safeSince = String(since || 'start').replace(/[^0-9A-Za-z_-]/g, '');
  const safeUntil = String(until || 'end').replace(/[^0-9A-Za-z_-]/g, '');
  const suffix = Number.isFinite(stamp) ? String(stamp) : Date.now().toString();
  return `report_${project?.code ?? 'project'}_${safeSince}_${safeUntil}_${suffix}.csv`;
}

async function archiveReportRecord(env, project, { payload, period, range, origin, csvFilename }) {
  const reportsKv = getReportsKv(env);
  if (!reportsKv || !project?.code) {
    return null;
  }

  const record = {
    code: project.code,
    created_at: new Date().toISOString(),
    origin: origin ?? 'manual',
    period,
    range,
    filters: payload.filters ?? {},
    totals: {
      spend: payload.reportData?.totalSpend ?? 0,
      results: payload.reportData?.totalResults ?? 0,
      cpa: payload.reportData?.totalCpa ?? null,
    },
    rows: (payload.reportData?.rows ?? []).map((row) => ({
      name: row.name,
      spend: row.spend,
      results: row.results,
      cpa: row.cpa,
      metric: row.metric?.short ?? null,
    })),
    message: payload.chatMessage ?? payload.message ?? '',
  };

  if (csvFilename) {
    record.csv_filename = csvFilename;
  }

  const key = getReportArchiveKey(project.code, Date.now());
  await reportsKv.put(key, JSON.stringify(record), { expirationTtl: REPORT_ARCHIVE_TTL_SECONDS });
  return key;
}

async function listReportArchiveStamps(env, code, { limit = REPORT_ARCHIVE_MAX_KEYS } = {}) {
  const reportsKv = getReportsKv(env);
  if (!reportsKv || !code) {
    return [];
  }

  const prefix = `${REPORT_ARCHIVE_PREFIX}${code}:`;
  const stamps = [];
  let cursor = undefined;

  while (stamps.length < limit) {
    const pageSize = Math.min(100, limit - stamps.length);
    const response = await reportsKv.list({ prefix, limit: pageSize, cursor });

    for (const entry of response.keys ?? []) {
      const parts = entry.name.split(':');
      const rawStamp = parts[parts.length - 1];
      const stamp = Number(rawStamp);
      if (Number.isFinite(stamp)) {
        stamps.push(stamp);
      }
    }

    if (response.list_complete || !response.cursor) {
      break;
    }

    cursor = response.cursor;
  }

  stamps.sort((a, b) => b - a);
  return stamps.slice(0, limit);
}

async function loadReportArchiveRecord(env, code, stamp) {
  const reportsKv = getReportsKv(env);
  if (!reportsKv || !code || !Number.isFinite(stamp)) {
    return null;
  }

  try {
    const key = getReportArchiveKey(code, stamp);
    const raw = await reportsKv.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error('loadReportArchiveRecord error', code, stamp, error);
    return null;
  }
}

function createArchiveState(project, overrides = {}) {
  const state = {
    mode: 'report_archive',
    code: project.code,
    page: Number.isFinite(overrides.page) ? Math.max(0, Number(overrides.page)) : 0,
    keys: Array.isArray(overrides.keys)
      ? overrides.keys
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
          .slice(0, REPORT_ARCHIVE_MAX_KEYS)
      : [],
  };

  if (typeof overrides.message_chat_id !== 'undefined') {
    state.message_chat_id = overrides.message_chat_id;
  }

  if (typeof overrides.message_id !== 'undefined') {
    state.message_id = overrides.message_id;
  }

  if (typeof overrides.timezone === 'string' && overrides.timezone.trim().length) {
    state.timezone = overrides.timezone;
  }

  if (Number.isFinite(overrides.viewStamp)) {
    state.viewStamp = Number(overrides.viewStamp);
  }

  if (typeof overrides.step === 'string') {
    state.step = overrides.step;
  }

  return state;
}

async function buildArchivePageData(env, project, { stamps, page, timezone, currency }) {
  const total = Array.isArray(stamps) ? stamps.length : 0;
  const pageSize = REPORT_ARCHIVE_PAGE_SIZE;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const safePage = Math.min(Math.max(page ?? 0, 0), Math.max(totalPages - 1, 0));
  const start = safePage * pageSize;
  const slice = (stamps ?? []).slice(start, start + pageSize);
  const entries = [];

  for (const stamp of slice) {
    const record = await loadReportArchiveRecord(env, project.code, stamp);
    if (!record) {
      continue;
    }

    const createdLabel = formatDateTimeLabel(record.created_at ?? stamp, timezone);
    const rowsCount = Array.isArray(record.rows) ? record.rows.length : 0;
    const totals = record.totals ?? {};
    const period = record.period ?? project.period ?? 'yesterday';

    entries.push({
      stamp,
      record,
      createdLabel,
      rowsCount,
      totals,
      period,
      rangeLabel: formatRangeLabel(record.range),
      filters: record.filters ?? {},
      origin: record.origin ?? 'manual',
    });
  }

  return {
    entries,
    total,
    page: safePage,
    totalPages: Math.max(totalPages, 1),
    currency,
  };
}

function renderReportArchiveList(project, data, options = {}) {
  const lines = [`<b>Архив #${escapeHtml(project.code)}</b>`];

  if (data.total === 0) {
    lines.push('Архив пока пуст. История появится после первых автоотчётов или ручных отправок.');
  } else {
    lines.push(`Всего записей: ${data.total}`);
    lines.push(`Страница ${data.page + 1} из ${data.totalPages}`);
    lines.push('');

    for (const entry of data.entries) {
      const totals = entry.totals ?? {};
      const spendLabel = Number.isFinite(totals.spend)
        ? formatCurrency(totals.spend, data.currency)
        : formatNumber(totals.spend ?? 0);
      const resultsLabel = formatNumber(totals.results ?? 0);
      const cpaLabel = Number.isFinite(totals.cpa)
        ? formatCpa(totals.cpa, data.currency)
        : '—';

      lines.push(
        `• ${escapeHtml(entry.createdLabel)} · ${escapeHtml(getPeriodLabel(entry.period))} (${escapeHtml(entry.rangeLabel)}) · ` +
          `кампаний: ${entry.rowsCount} · расход: ${escapeHtml(spendLabel)} · результаты: ${escapeHtml(resultsLabel)} · CPA: ${escapeHtml(cpaLabel)}`,
      );
      lines.push(`  Источник: ${entry.origin === 'auto' ? 'авто' : entry.origin === 'weekly' ? 'weekly' : 'ручной'}, фильтры: ${escapeHtml(describeReportFilters(entry.filters))}`);
    }
  }

  const inline_keyboard = [];

  for (const entry of data.entries) {
    inline_keyboard.push([
      {
        text: `👁 ${entry.createdLabel}`,
        callback_data: `proj:archive:view:${project.code}:${entry.stamp}`,
      },
    ]);
  }

  if (data.totalPages > 1) {
    inline_keyboard.push([
      { text: '◀️', callback_data: `proj:archive:page:${project.code}:prev` },
      { text: `Стр ${data.page + 1}/${data.totalPages}`, callback_data: 'noop' },
      { text: '▶️', callback_data: `proj:archive:page:${project.code}:next` },
    ]);
  }

  if (data.total === 0) {
    inline_keyboard.push([
      { text: '🔄 Обновить', callback_data: `proj:archive:refresh:${project.code}` },
    ]);
  }

  inline_keyboard.push([
    { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderReportArchivePreview(project, record, { stamp, createdLabel, currency }) {
  const totals = record.totals ?? {};
  const rowsCount = Array.isArray(record.rows) ? record.rows.length : 0;
  const spendLabel = Number.isFinite(totals.spend)
    ? formatCurrency(totals.spend, currency)
    : formatNumber(totals.spend ?? 0);
  const resultsLabel = formatNumber(totals.results ?? 0);
  const cpaLabel = Number.isFinite(totals.cpa) ? formatCpa(totals.cpa, currency) : '—';
  const message = String(record.message ?? '');
  const truncated = message.length > REPORT_PREVIEW_MAX_LENGTH;
  const previewBody = truncated ? message.slice(0, REPORT_PREVIEW_MAX_LENGTH) : message;

  const lines = [
    `<b>Архивный отчёт #${escapeHtml(project.code)}</b>`,
    `Создан: ${escapeHtml(createdLabel)} (${stamp})`,
    `Источник: ${record.origin === 'auto' ? 'авто' : record.origin === 'weekly' ? 'weekly' : 'ручной'}`,
    `Период: ${escapeHtml(getPeriodLabel(record.period ?? project.period ?? 'yesterday'))} (${escapeHtml(formatRangeLabel(record.range))})`,
    `Кампаний: ${rowsCount}`,
    `Расход: ${escapeHtml(spendLabel)} · Результаты: ${escapeHtml(resultsLabel)} · CPA: ${escapeHtml(cpaLabel)}`,
    `Фильтры: ${escapeHtml(describeReportFilters(record.filters ?? {}))}`,
    '',
    record.csv_filename
      ? `CSV: ${escapeHtml(record.csv_filename)} (сохранён при исходной отправке)`
      : 'CSV генерируется на лету при повторной отправке.',
    '',
    'Сообщение для клиента:',
    `<code>${escapeHtml(previewBody)}</code>`,
  ];

  if (truncated) {
    lines.push('… (усечено для предпросмотра)');
  }

  const inline_keyboard = [
    [
      { text: '📤 Отправить в чат', callback_data: `proj:archive:send:${project.code}:${stamp}` },
      { text: '📎 CSV в чат', callback_data: `proj:archive:csvchat:${project.code}:${stamp}` },
    ],
    [
      { text: '📥 CSV сюда', callback_data: `proj:archive:csvhere:${project.code}:${stamp}` },
      { text: '🗂 К списку', callback_data: `proj:archive:back:${project.code}` },
    ],
    [
      { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
      { text: '← В панель', callback_data: 'panel:home' },
    ],
  ];

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithArchiveList(env, message, code, { uid, refresh = false, page = null } = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const timezone = project?.timezone ?? env.DEFAULT_TZ ?? 'UTC';
  const state = await loadUserState(env, uid);
  let archiveState;

  if (!refresh && state?.mode === 'report_archive' && state.code === code && Array.isArray(state.keys)) {
    archiveState = createArchiveState(project, {
      ...state,
      message_chat_id: chatId,
      message_id: messageId,
      timezone,
    });
  } else {
    const stamps = await listReportArchiveStamps(env, code, { limit: REPORT_ARCHIVE_MAX_KEYS });
    archiveState = createArchiveState(project, {
      keys: stamps,
      page: 0,
      message_chat_id: chatId,
      message_id: messageId,
      timezone,
      step: 'list',
    });
  }

  if (page !== null && Number.isFinite(page)) {
    archiveState.page = Math.max(0, Number(page));
  }

  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);

  const pageData = await buildArchivePageData(env, project, {
    stamps: archiveState.keys,
    page: archiveState.page ?? 0,
    timezone,
    currency,
  });

  archiveState.page = pageData.page;
  archiveState.step = 'list';
  await saveUserState(env, uid, archiveState);

  const view = renderReportArchiveList(project, pageData, { currency, timezone });
  await telegramEditMessage(env, chatId, messageId, view.text, { reply_markup: view.reply_markup });
  return { ok: true, project, state: archiveState };
}

async function editMessageWithArchivePreview(env, message, code, stamp, { uid } = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const record = await loadReportArchiveRecord(env, code, stamp);
  if (!record) {
    await telegramSendMessage(env, message, 'Запись архива не найдена или истекла TTL.', { disable_reply: true });
    return editMessageWithArchiveList(env, message, code, { uid, refresh: true });
  }

  const timezone = project?.timezone ?? env.DEFAULT_TZ ?? 'UTC';
  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);
  const createdLabel = formatDateTimeLabel(record.created_at ?? stamp, timezone);

  const view = renderReportArchivePreview(project, record, { stamp, createdLabel, currency });
  await telegramEditMessage(env, chatId, messageId, view.text, { reply_markup: view.reply_markup });

  const current = await loadUserState(env, uid);
  const nextState = createArchiveState(project, {
    ...(current?.mode === 'report_archive' && current.code === code ? current : {}),
    message_chat_id: chatId,
    message_id: messageId,
    timezone,
    viewStamp: stamp,
    step: 'preview',
  });
  await saveUserState(env, uid, nextState);

  return { ok: true, project, record };
}

async function clearReportArchiveState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'report_archive' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

async function loadAutopauseState(env, code) {
  const kv = getLogsKv(env);
  if (!kv) {
    return { count: 0, last_ymd: null };
  }

  try {
    const raw = await kv.get(getAutopauseStreakKey(code));
    if (!raw) {
      return { count: 0, last_ymd: null };
    }
    const parsed = JSON.parse(raw);
    return {
      count: Number.isFinite(parsed?.count) ? Number(parsed.count) : 0,
      last_ymd: typeof parsed?.last_ymd === 'string' ? parsed.last_ymd : null,
    };
  } catch (error) {
    console.error('loadAutopauseState error', code, error);
    return { count: 0, last_ymd: null };
  }
}

async function saveAutopauseState(env, code, state) {
  const kv = getLogsKv(env);
  if (!kv) {
    return;
  }

  try {
    await kv.put(
      getAutopauseStreakKey(code),
      JSON.stringify({
        count: Number.isFinite(state?.count) ? Number(state.count) : 0,
        last_ymd: typeof state?.last_ymd === 'string' ? state.last_ymd : null,
      }),
    );
  } catch (error) {
    console.error('saveAutopauseState error', code, error);
  }
}

async function hasReportFlag(env, key) {
  const kv = getLogsKv(env);
  if (!kv) {
    return false;
  }
  try {
    const value = await kv.get(key);
    return Boolean(value);
  } catch (error) {
    console.error('hasReportFlag error', error);
    return false;
  }
}

async function setReportFlag(env, key, ttlSeconds) {
  const kv = getLogsKv(env);
  if (!kv) {
    return;
  }
  try {
    await kv.put(key, '1', { expirationTtl: ttlSeconds });
  } catch (error) {
    console.error('setReportFlag error', error);
  }
}

async function pushReportToSheets(env, project, payload, { period, range }) {
  if (typeof env.GS_WEBHOOK !== 'string' || !env.GS_WEBHOOK.trim()) {
    return { ok: false, skipped: 'webhook_missing' };
  }

  try {
    const body = {
      project: project.code,
      period,
      range,
      totals: payload.reportData
        ? {
            spend: payload.reportData.totalSpend,
            results: payload.reportData.totalResults,
            cpa: payload.reportData.totalCpa,
          }
        : null,
      filters: payload.filters ?? {},
      rows: payload.reportData?.rows ?? [],
      created_at: new Date().toISOString(),
    };

    const response = await fetchWithTimeout(env.GS_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const textBody = await response.text();
      throw new Error(`Sheets webhook error (${response.status}): ${textBody}`);
    }

    return { ok: true };
  } catch (error) {
    console.error('pushReportToSheets error', error);
    return { ok: false, error: error?.message ?? String(error) };
  }
}

async function sendWeeklyDigest(env, project, { token, timezone, currency }) {
  const weekRange = getPeriodRange('last_week', timezone);
  if (!weekRange) {
    throw new Error('Не удалось определить диапазон прошлой недели.');
  }

  const dayPeriod = project.weekly?.mode === 'week_yesterday' ? 'yesterday' : 'today';
  const dayRange = getPeriodRange(dayPeriod, timezone);

  const weekPayload = await buildProjectReport(env, project, {
    period: 'last_week',
    range: weekRange,
    token,
    currency,
  });

  const dayPayload = dayRange
    ? await buildProjectReport(env, project, {
        period: dayPeriod,
        range: dayRange,
        token,
        currency,
      })
    : null;

  const lines = [
    `#${escapeHtml(project.code)}`,
    '<b>Сводник (понедельник)</b>',
    '',
    `<b>Прошлая неделя (${weekRange.since}–${weekRange.until})</b>`,
  ];

  if (weekPayload.reportData.lines.length) {
    lines.push(...weekPayload.reportData.lines);
    lines.push('', weekPayload.reportData.totalLine);
  } else {
    lines.push('Данных за прошлую неделю нет.');
  }

  if (dayPayload) {
    const title = dayPeriod === 'week_yesterday' ? 'Вчера' : 'Сегодня';
    lines.push('', `<b>${title} (${dayRange.since}–${dayRange.until})</b>`);
    if (dayPayload.reportData.lines.length) {
      lines.push(...dayPayload.reportData.lines);
      lines.push('', dayPayload.reportData.totalLine);
    } else {
      lines.push('Данных за выбранный день нет.');
    }
  }

  const message = lines.join('\n');
  await telegramSendToProject(env, project, message, {});

  try {
    await archiveReportRecord(env, project, {
      payload: { ...weekPayload, message },
      period: 'last_week',
      range: { since: weekRange.since, until: dayRange?.until ?? weekRange.until },
      origin: 'weekly',
    });
  } catch (error) {
    console.error('sendWeeklyDigest archive error', error);
  }

  return { ok: true };
}

function shouldCheckBillingNow(project, hm) {
  if (!project?.alerts || project.alerts.enabled === false) {
    return false;
  }

  const times = Array.isArray(project.alerts.billing_times) && project.alerts.billing_times.length
    ? project.alerts.billing_times
    : ALERT_BILLING_DEFAULT_TIMES;
  return times.includes(hm);
}

function shouldCheckZeroSpendNow(project, hm) {
  if (!project?.alerts || project.alerts.enabled === false) {
    return false;
  }

  const target = typeof project.alerts.no_spend_by === 'string' ? project.alerts.no_spend_by : null;
  if (!target || !target.trim()) {
    return false;
  }

  return target === hm;
}

function shouldRunAnomalyChecksNow(project, hm) {
  if (!project?.alerts || project.alerts.enabled === false) {
    return false;
  }
  return ANOMALY_CHECK_TIMES.includes(hm);
}

async function runProjectAlerts(env, project, { token, timezone, hm, force = false }) {
  const summary = {
    ran: false,
    billing: false,
    zero: false,
    anomaly: false,
    fatigue: false,
    skipped: null,
  };

  if (!project?.alerts || project.alerts.enabled === false) {
    summary.skipped = 'alerts_disabled';
    return summary;
  }

  if (!project?.act) {
    summary.skipped = 'missing_act';
    return summary;
  }

  const currencyCache = runProjectAlerts.currencyCache || new Map();
  const currency = await resolveProjectCurrency(env, project, currencyCache);

  const shouldBilling = force || shouldCheckBillingNow(project, hm);
  const shouldZero = force || shouldCheckZeroSpendNow(project, hm);
  const shouldAnomaly = force || shouldRunAnomalyChecksNow(project, hm);

  if (shouldBilling) {
    summary.ran = true;
    try {
      summary.billing = Boolean(await runBillingAlert(env, project, { token, timezone }));
    } catch (error) {
      console.error('billing alert error', project.code, error);
    }
  }

  if (shouldZero) {
    summary.ran = true;
    try {
      summary.zero = Boolean(await runZeroSpendAlert(env, project, { token, timezone }));
    } catch (error) {
      console.error('zero-spend alert error', project.code, error);
    }
  }

  if (shouldAnomaly) {
    summary.ran = true;
    try {
      summary.anomaly = Boolean(await runAnomalyAlert(env, project, { token, timezone, hm, currency }));
    } catch (error) {
      console.error('anomaly alert error', project.code, error);
    }
    try {
      summary.fatigue = Boolean(await runCreativeFatigueAlert(env, project, { token, timezone, hm, currency }));
    } catch (error) {
      console.error('fatigue alert error', project.code, error);
    }
  }

  summary.anyTriggered = summary.billing || summary.zero || summary.anomaly || summary.fatigue;
  return summary;
}

runProjectAlerts.currencyCache = new Map();

async function runBillingAlert(env, project, { token, timezone }) {
  const summary = await fetchAccountHealthSummary(env, project, token);
  if (!summary) {
    return;
  }

  const issues = [];
  const statusCode = Number(summary.account_status);
  const disableReason = summary.disable_reason;
  const isPrepay = summary.is_prepay_account === true || summary.is_prepay_account === 'true';
  const balance = Number(summary.balance ?? 0);
  const spendCap = Number(summary.spend_cap ?? 0);
  const amountSpent = Number(summary.amount_spent ?? 0);

  const problematicStatuses = new Set([2, 3, 7, 8, 9, 1002]);
  if (Number.isFinite(statusCode) && problematicStatuses.has(statusCode)) {
    issues.push(`Статус аккаунта: ${statusCode}`);
  }

  if (disableReason && String(disableReason) !== '0') {
    issues.push(`Disable reason: ${disableReason}`);
  }

  if (isPrepay && balance <= 0) {
    issues.push('Баланс предоплаты ≤ 0');
  }

  if (spendCap > 0 && amountSpent >= spendCap) {
    issues.push('Достигнут spend cap');
  }

  if (!issues.length) {
    return false;
  }

  const today = getTodayYmd(timezone);
  const digest = JSON.stringify({ statusCode, disableReason, isPrepay, balance, spendCap, amountSpent });
  const flagKey = getAlertFlagKey(project.code, 'billing', today);

  const billingKv = getBillingKv(env);
  if (billingKv) {
    const previous = await billingKv.get(flagKey);
    if (previous === digest) {
      return false;
    }
  }

  const context = await buildProjectAlertContext(env, project);
  const lines = [
    '⚠️ <b>Проблема биллинга/доставки</b>',
    context.header,
    '',
    ...issues.map((line) => `• ${escapeHtml(line)}`),
    '',
    `Статус: ${escapeHtml(String(summary.account_status ?? '—'))}`,
  ];

  if (summary.funding_source_details?.display_string) {
    lines.push(`Источник: ${escapeHtml(summary.funding_source_details.display_string)}`);
  }

  await telegramNotifyAdmins(env, lines.join('\n'));

  if (billingKv) {
    await billingKv.put(flagKey, digest, { expirationTtl: ALERT_DEFAULT_TTL_SECONDS });
  }

  return true;
}

async function runZeroSpendAlert(env, project, { token, timezone }) {
  const range = getPeriodRange('today', timezone);
  if (!range) {
    return false;
  }

  const insights = await fetchCampaignInsights(env, project, token, range);
  const totalSpend = sumSpend(insights);
  if (totalSpend > 0.1) {
    return false;
  }

  const campaigns = await fetchActiveCampaigns(env, project, token);
  const active = campaigns.filter(isCampaignEffectivelyActive);
  if (!active.length) {
    return false;
  }

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'zero', today);
  const logsKv = getLogsKv(env);
  if (logsKv) {
    const seen = await logsKv.get(flagKey);
    if (seen) {
      return false;
    }
  }

  const context = await buildProjectAlertContext(env, project);
  const listed = active.slice(0, 5).map((row) => `• ${escapeHtml(row.name || row.id)} (${escapeHtml(row.effective_status || '—')})`);

  const lines = [
    '⚠️ <b>После контрольного времени расход = 0</b>',
    context.header,
    '',
    'Сегодня расход по выбранным кампаниям не обнаружен, несмотря на активный статус.',
  ];

  if (listed.length) {
    lines.push('', '<b>Активные кампании:</b>', ...listed);
    if (active.length > listed.length) {
      lines.push('…');
    }
  }

  await telegramNotifyAdmins(env, lines.join('\n'));

  if (logsKv) {
    await logsKv.put(flagKey, '1', { expirationTtl: ALERT_ZERO_TTL_SECONDS });
  }

  return true;
}

async function runAnomalyAlert(env, project, { token, timezone, hm, currency = 'USD' }) {
  const todayRange = getPeriodRange('today', timezone);
  const yesterdayRange = getPeriodRange('yesterday', timezone);
  if (!todayRange || !yesterdayRange) {
    return;
  }

  const [todayInsights, yesterdayInsights] = await Promise.all([
    fetchCampaignInsights(env, project, token, todayRange),
    fetchCampaignInsights(env, project, token, yesterdayRange),
  ]);

  if (!todayInsights.length) {
    return;
  }

  const prevById = new Map();
  for (const row of yesterdayInsights) {
    if (!row?.campaign_id) continue;
    prevById.set(row.campaign_id, row);
  }

  const threshold = {
    cpl: Number.isFinite(project?.anomaly?.cpl_jump) ? Number(project.anomaly.cpl_jump) : 0.5,
    ctr: Number.isFinite(project?.anomaly?.ctr_drop) ? Number(project.anomaly.ctr_drop) : 0.4,
    impr: Number.isFinite(project?.anomaly?.impr_drop) ? Number(project.anomaly.impr_drop) : 0.5,
    freq: Number.isFinite(project?.anomaly?.freq) ? Number(project.anomaly.freq) : 3.5,
  };

  const alerts = [];

  for (const row of todayInsights) {
    const prev = row?.campaign_id ? prevById.get(row.campaign_id) : null;
    const metric = pickMetricForObjective(row?.objective);
    const todaySpend = Number(row?.spend) || 0;
    const prevSpend = Number(prev?.spend) || 0;
    const todayResults = extractActionCount(row?.actions ?? [], metric.actions);
    const prevResults = extractActionCount(prev?.actions ?? [], metric.actions);
    const todayCpa = todayResults > 0 ? todaySpend / todayResults : Number.POSITIVE_INFINITY;
    const prevCpa = prevResults > 0 ? prevSpend / prevResults : Number.POSITIVE_INFINITY;
    const todayCtr = Number(row?.ctr) || 0;
    const prevCtr = Number(prev?.ctr) || 0;
    const todayImpr = Number(row?.impressions) || 0;
    const prevImpr = Number(prev?.impressions) || 0;
    const todayFreq = Number(row?.frequency) || 0;

    const triggers = [];

    if (Number.isFinite(prevCpa) && prevCpa > 0 && Number.isFinite(todayCpa)) {
      const delta = (todayCpa - prevCpa) / prevCpa;
      if (delta >= threshold.cpl) {
        triggers.push(`CPA ↑ на ${(delta * 100).toFixed(0)}% (до ${formatCpa(todayCpa, currency)})`);
      }
    } else if (!Number.isFinite(todayCpa) && todaySpend > 0) {
      triggers.push('CPA отсутствует при расходе');
    }

    if (prevCtr > 0) {
      const dropCtr = (prevCtr - todayCtr) / prevCtr;
      if (dropCtr >= threshold.ctr) {
        triggers.push(`CTR ↓ на ${(dropCtr * 100).toFixed(0)}% (до ${todayCtr.toFixed(2)}%)`);
      }
    }

    if (prevImpr > 0) {
      const dropImpr = (prevImpr - todayImpr) / prevImpr;
      if (dropImpr >= threshold.impr) {
        triggers.push(`Показы ↓ на ${(dropImpr * 100).toFixed(0)}%`);
      }
    }

    if (todayFreq > threshold.freq) {
      triggers.push(`Frequency ${todayFreq.toFixed(2)} > ${threshold.freq}`);
    }

    if (triggers.length) {
      alerts.push({
        name: row?.campaign_name ?? row?.campaign_id ?? '—',
        spend: todaySpend,
        triggers,
      });
    }
  }

  if (!alerts.length) {
    return false;
  }

  alerts.sort((a, b) => b.spend - a.spend);
  const top = alerts.slice(0, 5);

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'anomaly', `${today}:${hm}`);
  const logsKv = getLogsKv(env);
  if (logsKv) {
    const seen = await logsKv.get(flagKey);
    if (seen) {
      return false;
    }
  }

  const context = await buildProjectAlertContext(env, project);
  const lines = [
    '⚠️ <b>Аномалии метрик кампаний</b>',
    context.header,
    '',
    ...top.map((item) => `• ${escapeHtml(item.name)} — ${escapeHtml(item.triggers.join('; '))}`),
  ];

  if (alerts.length > top.length) {
    lines.push('…');
  }

  await telegramNotifyAdmins(env, lines.join('\n'));

  if (logsKv) {
    await logsKv.put(flagKey, '1', { expirationTtl: ALERT_ANOMALY_TTL_SECONDS });
  }

  return true;
}

async function runCreativeFatigueAlert(env, project, { token, timezone, hm, currency = 'USD' }) {
  const range = getPeriodRange('last_7d', timezone);
  if (!range) {
    return false;
  }

  const insights = await fetchCampaignInsights(env, project, token, range);
  if (!insights.length) {
    return false;
  }

  const freqThreshold = Number.isFinite(project?.anomaly?.freq) ? Number(project.anomaly.freq) : 3.5;
  const kpiCpl = Number(project?.kpi?.cpl);

  const fatigued = [];

  for (const row of insights) {
    const freq = Number(row?.frequency) || 0;
    const ctr = Number(row?.ctr) || 0;
    const spend = Number(row?.spend) || 0;
    const metric = pickMetricForObjective(row?.objective);
    const results = extractActionCount(row?.actions ?? [], metric.actions);
    const cpa = results > 0 ? spend / results : Number.POSITIVE_INFINITY;

    if (spend < CREATIVE_FATIGUE_MIN_SPEND) {
      continue;
    }

    if (freq <= freqThreshold || ctr > CREATIVE_FATIGUE_CTR_THRESHOLD) {
      continue;
    }

    let cpaProblem = false;
    if (Number.isFinite(kpiCpl) && kpiCpl > 0) {
      cpaProblem = !Number.isFinite(cpa) || cpa > kpiCpl * 1.2;
    } else {
      cpaProblem = !Number.isFinite(cpa) || results <= CREATIVE_FATIGUE_MIN_RESULTS;
    }

    if (!cpaProblem) {
      continue;
    }

    fatigued.push({
      name: row?.campaign_name ?? row?.campaign_id ?? '—',
      freq,
      ctr,
      cpa,
      spend,
      results,
    });
  }

  if (!fatigued.length) {
    return false;
  }

  fatigued.sort((a, b) => b.freq - a.freq || b.spend - a.spend);
  const top = fatigued.slice(0, 5);

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'fatigue', `${today}:${hm}`);
  const logsKv = getLogsKv(env);
  if (logsKv) {
    const seen = await logsKv.get(flagKey);
    if (seen) {
      return false;
    }
  }

  const context = await buildProjectAlertContext(env, project);
  const lines = [
    '⚠️ <b>Усталость креативов</b>',
    context.header,
    '',
    ...top.map((item) =>
      `• ${escapeHtml(item.name)} — freq ${item.freq.toFixed(2)}, CTR ${item.ctr.toFixed(2)}%, CPA ${formatCpa(item.cpa, currency)}`,
    ),
  ];

  if (fatigued.length > top.length) {
    lines.push('…');
  }

  await telegramNotifyAdmins(env, lines.join('\n'));

  if (logsKv) {
    await logsKv.put(flagKey, '1', { expirationTtl: ALERT_ANOMALY_TTL_SECONDS });
  }

  return true;
}

async function pauseProjectCampaigns(env, project, { token } = {}) {
  if (!token) {
    throw new Error('Meta токен недоступен.');
  }

  const campaigns = Array.isArray(project?.campaigns) ? project.campaigns : [];
  const ids = Array.from(new Set(campaigns.map((value) => normalizeCampaignId(value)).filter(Boolean)));

  if (!ids.length) {
    return { ok: [], failed: [], reason: 'no_campaigns' };
  }

  const ok = [];
  const failed = [];

  for (const campaignId of ids) {
    try {
      const response = await graphPost(campaignId, { token, body: { status: 'PAUSED' } });
      if (response?.success === false) {
        throw new Error('Meta не подтвердила паузу кампании');
      }
      ok.push(campaignId);
    } catch (error) {
      console.error('pauseProjectCampaigns error', project.code, campaignId, error);
      failed.push({ id: campaignId, error: error?.message ?? String(error) });
    }
  }

  return { ok, failed };
}

async function resumeProjectCampaigns(env, project, { token } = {}) {
  if (!token) {
    throw new Error('Meta токен недоступен.');
  }

  const campaigns = Array.isArray(project?.campaigns) ? project.campaigns : [];
  const ids = Array.from(new Set(campaigns.map((value) => normalizeCampaignId(value)).filter(Boolean)));

  if (!ids.length) {
    return { ok: [], failed: [], reason: 'no_campaigns' };
  }

  const ok = [];
  const failed = [];

  for (const campaignId of ids) {
    try {
      const response = await graphPost(campaignId, { token, body: { status: 'ACTIVE' } });
      if (response?.success === false) {
        throw new Error('Meta не подтвердила включение кампании');
      }
      ok.push(campaignId);
    } catch (error) {
      console.error('resumeProjectCampaigns error', project.code, campaignId, error);
      failed.push({ id: campaignId, error: error?.message ?? String(error) });
    }
  }

  return { ok, failed };
}

function formatPauseSummary(project, result) {
  if (!result || (result.ok.length === 0 && result.failed.length === 0)) {
    return 'Нет кампаний, которые можно поставить на паузу. Проверьте настройки проекта.';
  }

  const lines = [
    '⏸ <b>Автопауза кампаний</b>',
    `Проект #${escapeHtml(project.code)} — кампаний на паузе: ${result.ok.length}.`,
  ];

  if (result.failed.length) {
    lines.push('Ошибки:');
    for (const item of result.failed.slice(0, 5)) {
      lines.push(`• ${escapeHtml(item.id)} — ${escapeHtml(item.error)}`);
    }
    if (result.failed.length > 5) {
      lines.push('…');
    }
  }

  return lines.join('\n');
}

function formatResumeSummary(project, result) {
  if (!result || (result.ok.length === 0 && result.failed.length === 0)) {
    return 'Нет кампаний, которые можно включить. Убедитесь, что они выбраны в проекте.';
  }

  const lines = [
    '▶️ <b>Возобновление кампаний</b>',
    `Проект #${escapeHtml(project.code)} — кампаний включено: ${result.ok.length}.`,
  ];

  if (result.failed.length) {
    lines.push('Ошибки:');
    for (const item of result.failed.slice(0, 5)) {
      lines.push(`• ${escapeHtml(item.id)} — ${escapeHtml(item.error)}`);
    }
    if (result.failed.length > 5) {
      lines.push('…');
    }
  }

  return lines.join('\n');
}

async function adjustAdsetBudgets(env, adsets, { token, percent }) {
  const results = { ok: [], failed: [] };
  for (const adset of adsets) {
    const currentBudget = Number(adset.daily_budget);
    if (!Number.isFinite(currentBudget) || currentBudget <= 0) {
      continue;
    }
    const multiplier = 1 + Number(percent || 0) / 100;
    const updatedBudget = Math.max(100, Math.round(currentBudget * multiplier));
    try {
      await graphPost(adset.id, { token, body: { daily_budget: String(updatedBudget) } });
      results.ok.push({ id: adset.id, before: currentBudget, after: updatedBudget });
    } catch (error) {
      console.error('adjustAdsetBudgets error', adset.id, error);
      results.failed.push({ id: adset.id, error: error?.message ?? String(error) });
    }
  }
  return results;
}

async function extendAdsetSchedules(env, adsets, { token, days }) {
  const results = { ok: [], failed: [] };
  const increment = Math.max(1, Number(days) || 1);

  for (const adset of adsets) {
    if (!adset.end_time) continue;
    const current = new Date(adset.end_time);
    if (Number.isNaN(current.getTime())) continue;
    const updated = new Date(current.getTime() + increment * 24 * 60 * 60 * 1000);
    try {
      await graphPost(adset.id, { token, body: { end_time: updated.toISOString() } });
      results.ok.push({ id: adset.id, before: adset.end_time, after: updated.toISOString() });
    } catch (error) {
      console.error('extendAdsetSchedules error', adset.id, error);
      results.failed.push({ id: adset.id, error: error?.message ?? String(error) });
    }
  }

  return results;
}

async function toggleEntityStatus(token, id, status) {
  try {
    const response = await graphPost(id, { token, body: { status } });
    if (response?.success === false) {
      throw new Error('Meta вернула ошибку');
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}

async function runAutopauseCheck(env, project, { token, timezone, hm, force = false }) {
  const summary = {
    ran: false,
    triggered: false,
    streak: 0,
    threshold: null,
    processedDay: null,
    skipped: null,
  };

  if (!project?.autopause?.enabled) {
    summary.skipped = 'autopause_disabled';
    return summary;
  }

  if (!force && hm !== AUTOPAUSE_CHECK_TIME) {
    summary.skipped = 'time_window';
    return summary;
  }

  const kpiCpl = Number(project?.kpi?.cpl);
  if (!Number.isFinite(kpiCpl) || kpiCpl <= 0) {
    summary.skipped = 'missing_kpi';
    return summary;
  }

  if (!project?.act) {
    summary.skipped = 'missing_act';
    return summary;
  }

  const range = getPeriodRange('yesterday', timezone);
  if (!range) {
    summary.skipped = 'range_unavailable';
    return summary;
  }

  const currencyCache = runAutopauseCheck.currencyCache || new Map();
  const currency = await resolveProjectCurrency(env, project, currencyCache);
  const payload = await buildProjectReport(env, project, {
    period: 'yesterday',
    range,
    token,
    currency,
    filters: {},
  });

  const spend = payload.reportData?.totalSpend ?? 0;
  const results = payload.reportData?.totalResults ?? 0;
  const cpa = results > 0 ? spend / results : Number.POSITIVE_INFINITY;
  const processedDay = range.until;

  summary.ran = true;
  summary.processedDay = processedDay;

  const state = await loadAutopauseState(env, project.code);
  if (state.last_ymd === processedDay && !force) {
    summary.skipped = 'already_processed';
    summary.streak = state.count ?? 0;
    return summary;
  }

  let streak = 0;
  if (!Number.isFinite(cpa) || cpa > kpiCpl) {
    const expectedPrev = shiftYmd(processedDay, -1);
    if (state.last_ymd === expectedPrev) {
      streak = (state.count ?? 0) + 1;
    } else {
      streak = 1;
    }
  } else {
    streak = 0;
  }

  summary.streak = streak;

  await saveAutopauseState(env, project.code, { count: streak, last_ymd: processedDay });

  const threshold = Number.isFinite(project?.autopause?.days) && project.autopause.days > 0
    ? Number(project.autopause.days)
    : 3;
  summary.threshold = threshold;

  if (streak >= threshold) {
    const alertKey = getAutopauseAlertFlagKey(project.code, processedDay);
    const logsKv = getLogsKv(env);
    if (logsKv) {
      const seen = await logsKv.get(alertKey);
      if (seen && !force) {
        summary.skipped = 'alert_sent_recently';
        return summary;
      }
    }

    const context = await buildProjectAlertContext(env, project);
    const lines = [
      '⚠️ <b>CPA выше KPI несколько дней подряд</b>',
      context.header,
      '',
      `Последние ${streak} дн. подряд CPA ${formatCpa(cpa, currency)} > KPI ${formatCpa(kpiCpl, currency)}.`,
      'Проверьте кампании и рассмотрите автопаузу в карточке проекта.',
    ];

    let extra = {};
    if (Array.isArray(project?.campaigns) && project.campaigns.length > 0) {
      lines.push('');
      lines.push('Можно сразу поставить выбранные кампании на паузу.');
      extra = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '⏸ Поставить кампании на паузу',
                callback_data: `proj:autopause:apply:${project.code}`,
              },
            ],
          ],
        },
      };
    }

    await telegramNotifyAdmins(env, lines.join('\n'), extra);

    if (logsKv) {
      await logsKv.put(alertKey, '1', { expirationTtl: AUTOPAUSE_ALERT_TTL_SECONDS });
    }

    summary.triggered = true;
  }

  return summary;
}

runAutopauseCheck.currencyCache = new Map();

async function resetProjectReportFlags(env, project, { timezone, includeWeekly = true } = {}) {
  const kv = getLogsKv(env);
  if (!kv) {
    throw new Error('KV для служебных флагов недоступен.');
  }

  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const today = getTodayYmd(tz);
  const times = Array.isArray(project?.times) ? project.times : [];
  const keys = times.map((hm) => getAutoReportFlagKey(project.code, today, hm));

  if (includeWeekly !== false) {
    keys.push(getWeeklyReportFlagKey(project.code, today));
  }

  let removed = 0;
  for (const key of keys) {
    try {
      await kv.delete(key);
      removed += 1;
    } catch (error) {
      console.error('resetProjectReportFlags delete error', project.code, key, error);
    }
  }

  return { removed, keys };
}

async function runManualAutoReportAction(env, project, { timezone } = {}) {
  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const { token } = await resolveMetaToken(env);
  if (!token) {
    throw new Error('Meta токен не найден. Подключите Meta в админ-панели.');
  }

  const period = project.period ?? 'yesterday';
  const range = getPeriodRange(period, tz);
  if (!range) {
    throw new Error('Не удалось определить период для отчёта. Проверьте настройки проекта.');
  }

  const currency = await resolveProjectCurrency(env, project, processAutoReport.currencyCache);
  const result = await sendProjectReport(env, project, {
    period,
    range,
    token,
    currency,
    filters: {},
    deliverToChat: true,
    origin: 'manual_action',
    archive: true,
    sendCsv: false,
    pushSheets: false,
  });

  const rows = result.payload?.filteredInsights?.length ?? 0;
  const spend = result.payload?.reportData?.totalSpend ?? 0;
  return { rows, spend, range, currency };
}

async function runManualWeeklyDigestAction(env, project, { timezone } = {}) {
  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const { token } = await resolveMetaToken(env);
  if (!token) {
    throw new Error('Meta токен не найден. Подключите Meta в админ-панели.');
  }

  const currency = await resolveProjectCurrency(env, project, processAutoReport.currencyCache);
  await sendWeeklyDigest(env, project, { token, timezone: tz, currency });
  return { ok: true };
}

async function runManualDigestAction(env, project, { timezone } = {}) {
  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const { token } = await resolveMetaToken(env);
  if (!token) {
    throw new Error('Meta токен не найден. Подключите Meta в админ-панели.');
  }

  const period = project.period ?? 'today';
  const range = getPeriodRange(period, tz);
  if (!range) {
    throw new Error('Не удалось определить период для дайджеста. Проверьте настройки проекта.');
  }

  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);
  await sendProjectDigest(env, project, { period, range, token, currency });

  return { period, range, currency };
}

async function runManualAlertsAction(env, project, { timezone } = {}) {
  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const { token } = await resolveMetaToken(env);
  if (!token) {
    throw new Error('Meta токен не найден. Подключите Meta в админ-панели.');
  }

  const hm = getLocalHm(new Date(), tz);
  return runProjectAlerts(env, project, { token, timezone: tz, hm, force: true });
}

async function runManualAutopauseAction(env, project, { timezone } = {}) {
  const tz = timezone || env.DEFAULT_TZ || 'UTC';
  const { token } = await resolveMetaToken(env);
  if (!token) {
    throw new Error('Meta токен не найден. Подключите Meta в админ-панели.');
  }

  const hm = getLocalHm(new Date(), tz);
  return runAutopauseCheck(env, project, { token, timezone: tz, hm, force: true });
}

async function resolveProjectCurrency(env, project, cache) {
  const accountId = project?.act ? String(project.act).replace(/^act_/i, '') : '';
  if (!accountId) {
    return 'USD';
  }

  if (cache && cache.has(accountId)) {
    return cache.get(accountId);
  }

  const meta = await loadAccountMeta(env, accountId) ?? {};
  const currency = getCurrencyFromMeta(meta);

  if (cache) {
    cache.set(accountId, currency);
  }

  return currency;
}

function shouldSendAutoReportNow(project, { now, hm, timezone }) {
  if (!project || !project.active) return false;
  if (!project.chat_id) return false;
  if (!project.act) return false;
  if (project.billing === 'paused') return false;
  if (!Array.isArray(project.times) || project.times.length === 0) return false;
  if (!project.times.includes(hm)) return false;
  if (project.mute_weekends && isWeekend(now, timezone)) return false;
  return true;
}

function getWeeklyTriggerTime(project) {
  if (Array.isArray(project?.times) && project.times.length > 0) {
    return project.times[0];
  }
  return '09:30';
}

function shouldSendWeeklyDigestNow(project, { now, hm, timezone }) {
  if (!project?.weekly || project.weekly.enabled === false) {
    return false;
  }
  if (!project.chat_id || !project.act) {
    return false;
  }
  if (!isMonday(now, timezone)) {
    return false;
  }
  const trigger = getWeeklyTriggerTime(project);
  return hm === trigger;
}

async function processAutoReport(env, project, { token, timezone, hm }) {
  const today = getTodayYmd(timezone);
  const flagKey = getAutoReportFlagKey(project.code, today, hm);
  if (await hasReportFlag(env, flagKey)) {
    return { skipped: 'already_sent' };
  }

  const period = project.period ?? 'yesterday';
  const range = getPeriodRange(period, timezone);
  if (!range) {
    return { skipped: 'range_unavailable' };
  }

  const currency = await resolveProjectCurrency(env, project, processAutoReport.currencyCache);

  const result = await sendProjectReport(env, project, {
    period,
    range,
    token,
    currency,
    origin: 'auto',
    archive: true,
    sendCsv: true,
    pushSheets: Boolean(env.GS_WEBHOOK),
  });

  await setReportFlag(env, flagKey, REPORT_FLAG_TTL_SECONDS);
  return { ok: true, rows: result.payload?.filteredInsights?.length ?? 0 };
}
processAutoReport.currencyCache = new Map();

async function processWeeklyReport(env, project, { token, timezone }) {
  const today = getTodayYmd(timezone);
  const flagKey = getWeeklyReportFlagKey(project.code, today);
  if (await hasReportFlag(env, flagKey)) {
    return { skipped: 'already_sent' };
  }

  const currency = await resolveProjectCurrency(env, project, processAutoReport.currencyCache);
  await sendWeeklyDigest(env, project, { token, timezone, currency });
  await setReportFlag(env, flagKey, WEEKLY_FLAG_TTL_SECONDS);
  return { ok: true };
}

function describeDisableReason(reasonCode) {
  const code = Number(reasonCode);
  switch (code) {
    case 1:
      return 'Отклонения Facebook';
    case 2:
      return 'Платёж не прошёл';
    case 3:
      return 'Фрод или жалобы';
    case 18:
      return 'Проблема оплаты';
    case 21:
      return 'Ограничения политики';
    case 26:
      return 'Платёж не подтверждён';
    default:
      if (Number.isFinite(code)) {
        return `Код ${code}`;
      }
      return null;
  }
}

function renderProjectDetails(project, chatRecord, portalRecord = null, options = {}) {
  const timezone = options.timezone || 'UTC';
  const accountMeta = options.accountMeta ?? null;
  const accountHealth = options.accountHealth ?? null;
  const timesLabel = project.times.length ? project.times.join(', ') : '—';
  const chatInfo = project.chat_id
    ? formatChatReference(
        {
          chat_id: project.chat_id,
          thread_id: project.thread_id ?? 0,
          title: chatRecord?.title ?? null,
        },
        { withLink: true },
      )
    : 'не привязан';

  const accountName = accountMeta?.name || project.act || '—';

  const lines = [
    `<b>Проект #${escapeHtml(project.code)}</b>`,
    `Аккаунт: <code>${escapeHtml(project.act || '—')}</code> · ${escapeHtml(accountName)}`,
    `Чат: ${chatInfo}`,
  ];

  if (chatRecord?.thread_name) {
    lines.push(`Тема: ${escapeHtml(chatRecord.thread_name)}`);
  }

  if (accountHealth) {
    const currency = getCurrencyFromMeta(accountHealth);
    const status = describeAccountStatus(accountHealth, accountHealth, currency);
    const reason = describeDisableReason(accountHealth.disable_reason);
    const fragments = [status.label];
    if (reason) fragments.push(reason);
    if (accountHealth.funding_source_details?.display_string) {
      fragments.push(accountHealth.funding_source_details.display_string);
    }
    if (status.detail) {
      fragments.push(status.detail);
    }
    lines.push(`Статус аккаунта: ${escapeHtml(fragments.join(' · '))}`);
  } else {
    lines.push('Статус аккаунта: данных нет (проверьте Meta токен)');
  }

  lines.push(`Период: ${escapeHtml(project.period)} · расписание: ${escapeHtml(timesLabel)}`);
  lines.push(`Тихие выходные: ${project.mute_weekends ? 'вкл' : 'выкл'}`);
  lines.push(`Статус автоотчёта: ${project.active ? 'активен' : 'выключен'}`);
  lines.push(`Статус биллинга: ${escapeHtml(project.billing)}`);
  lines.push(`Выбрано кампаний: ${project.campaigns.length}`);
  lines.push(`KPI: ${escapeHtml(formatKpiLabel(project.kpi))}`);
  lines.push(`Сводник: ${escapeHtml(formatWeeklyLabel(project.weekly))}`);
  lines.push(`Автопауза: ${escapeHtml(formatAutopauseLabel(project.autopause))}`);
  lines.push(`Alerts: ${escapeHtml(formatAlertsLabel(project.alerts))}`);
  lines.push(`Портал: ${escapeHtml(formatPortalLabel(portalRecord, timezone))}`);
  lines.push(`Оплата: ${escapeHtml(formatDateLabel(project.billing_paid_at))}`);
  lines.push(`Следующая оплата: ${escapeHtml(formatDateLabel(project.billing_next_at))}`);
  const inline_keyboard = [];

  const chatLink = project.chat_id ? buildTelegramTopicLink(project.chat_id, project.thread_id ?? 0) : null;
  if (chatLink) {
    inline_keyboard.push([{ text: '💬 Перейти в чат проекта', url: chatLink }]);
  }

  inline_keyboard.push([
    {
      text: project.active ? '⏹ Выключить отчёты' : '▶️ Включить отчёты',
      callback_data: `proj:detail:toggle_active:${project.code}`,
    },
    {
      text: project.billing === 'paused' ? '💳 Возобновить биллинг' : '⏸ Приостановить биллинг',
      callback_data: `proj:detail:toggle_billing:${project.code}`,
    },
  ]);

  inline_keyboard.push([
    { text: '⏱ Расписание', callback_data: `proj:schedule:open:${project.code}` },
    {
      text: project.mute_weekends ? '🗓 Включить выходные' : '🧘 Тихие выходные',
      callback_data: `proj:detail:toggle_mute:${project.code}`,
    },
  ]);

  inline_keyboard.push([
    {
      text: project.weekly?.enabled !== false ? '🔕 Выключить сводник' : '🔔 Включить сводник',
      callback_data: `proj:detail:weekly_toggle:${project.code}`,
    },
    {
      text: project.weekly?.mode === 'week_today' ? 'Режим: неделя+сегодня' : 'Режим: неделя+вчера',
      callback_data: `proj:detail:weekly_mode:${project.code}`,
    },
  ]);

  inline_keyboard.push([
    {
      text: project.autopause?.enabled ? '🤖 Автопауза: выкл' : '🤖 Автопауза: вкл',
      callback_data: `proj:detail:autopause_toggle:${project.code}`,
    },
    {
      text: `Порог: ${Number.isFinite(project.autopause?.days) ? project.autopause.days : 3} дн.`,
      callback_data: `proj:autopause:open:${project.code}`,
    },
  ]);

  if (project.campaigns.length) {
    inline_keyboard.push([
      {
        text: '⏸ Поставить кампании на паузу',
        callback_data: `proj:autopause:prompt:${project.code}:pause`,
      },
      {
        text: '▶️ Возобновить кампании',
        callback_data: `proj:autopause:prompt:${project.code}:resume`,
      },
    ]);
  }

  inline_keyboard.push([
    { text: '🎯 KPI', callback_data: `proj:kpi:open:${project.code}` },
    { text: '📊 Alerts', callback_data: `proj:alerts:open:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '💵 Оплата', callback_data: `proj:billing:open:${project.code}` },
    { text: '📤 Отчёт', callback_data: `proj:report:open:${project.code}` },
    { text: '📬 Дайджест', callback_data: `proj:digest:open:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '🗂 Архив', callback_data: `proj:archive:open:${project.code}` },
    { text: '🌐 Портал', callback_data: `proj:portal:open:${project.code}` },
  ]);
  inline_keyboard.push([
    {
      text:
        project.campaigns.length > 0
          ? `📦 Кампании (${project.campaigns.length})`
          : '📦 Кампании',
      callback_data: `proj:campaigns:open:${project.code}`,
    },
  ]);
  inline_keyboard.push([
    { text: '⚡ Массовые действия', callback_data: `proj:actions:open:${project.code}` },
  ]);
  inline_keyboard.push([{ text: '📋 К списку проектов', callback_data: 'panel:projects:0' }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderAutopausePrompt(project, mode = 'pause') {
  const isResume = mode === 'resume';
  const emoji = isResume ? '▶️' : '⏸';
  const actionLabel = isResume ? 'возобновить' : 'поставить на паузу';
  const header = `${emoji} ${isResume ? 'Возобновить кампании' : 'Поставить кампании на паузу'}`;
  const lines = [
    `<b>${header}</b>`,
    `Проект #${escapeHtml(project.code)} · кампаний выбранo: ${project.campaigns.length}.`,
    '',
    isResume
      ? 'Кампании будут переведены в статус ACTIVE. Убедитесь, что бюджеты и расписание актуальны.'
      : 'Все выбранные кампании будут переведены в статус PAUSED. Продолжить?',
  ];

  const inline_keyboard = [
    [
      {
        text: isResume ? '✅ Да, возобновить' : '✅ Да, поставить на паузу',
        callback_data: `proj:autopause:execute:${project.code}:${isResume ? 'resume' : 'pause'}`,
      },
      { text: '↩️ Отмена', callback_data: `proj:detail:${project.code}` },
    ],
  ];

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderProjectActionsMenu(project, options = {}) {
  const lines = [`<b>Массовые действия #${escapeHtml(project.code)}</b>`, '', 'Выберите операцию:'];

  if (options.noticeHtml) {
    lines.push('', options.noticeHtml);
  }

  const inline_keyboard = [];
  inline_keyboard.push([
    { text: '📤 Автоотчёт в чат', callback_data: `proj:actions:auto:${project.code}` },
    { text: '📬 Дайджест в чат', callback_data: `proj:actions:digest:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '📅 Сводник', callback_data: `proj:actions:weekly:${project.code}` },
    { text: '⚠ Проверить алерты', callback_data: `proj:actions:alerts:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '🤖 Проверить автопаузу', callback_data: `proj:actions:autopause:${project.code}` },
    { text: '🧹 Сбросить флаги отчётов', callback_data: `proj:actions:reset:${project.code}` },
  ]);
  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderPortalMenu(env, project, portalRecord, options = {}) {
  const timezone = options.timezone || 'UTC';
  const link = buildPortalUrl(env, project.code, portalRecord);
  const updatedLabel = portalRecord?.updated_at ? formatDateTimeLabel(portalRecord.updated_at, timezone) : null;
  const defaultPeriod = getPeriodLabel(project.period ?? 'yesterday');

  const lines = [`<b>Клиентский портал #${escapeHtml(project.code)}</b>`];

  if (link) {
    lines.push('Статус: активен.');
    lines.push(`Ссылка: <code>${escapeHtml(link)}</code>`);
    lines.push(`Период по умолчанию: ${escapeHtml(defaultPeriod)}.`);
    if (updatedLabel) {
      lines.push(`Обновлено: ${escapeHtml(updatedLabel)}.`);
    }
    lines.push('');
    lines.push('У кого есть ссылка — у того есть доступ к отчётам без внутренних KPI. При обновлении токена старая ссылка перестанет работать.');
  } else {
    lines.push('Портал выключен. Создайте ссылку, чтобы поделиться дашбордом с клиентом.');
  }

  const inline_keyboard = [];

  if (link) {
    inline_keyboard.push([
      { text: '♻️ Обновить ссылку', callback_data: `proj:portal:rotate:${project.code}` },
      { text: '🚫 Отключить', callback_data: `proj:portal:disable:${project.code}` },
    ]);
    inline_keyboard.push([
      { text: '📤 В чат клиента', callback_data: `proj:portal:send:${project.code}` },
      { text: '📨 Получить ссылку здесь', callback_data: `proj:portal:dm:${project.code}` },
    ]);
    inline_keyboard.push([
      { text: '🌐 Открыть', url: link },
      { text: '🔄 Обновить экран', callback_data: `proj:portal:refresh:${project.code}` },
    ]);
  } else {
    inline_keyboard.push([
      { text: '🔗 Создать ссылку', callback_data: `proj:portal:create:${project.code}` },
    ]);
  }

  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithPortal(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Возможно, он был удалён.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const chatRecord = project.chat_id
    ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
    : null;
  const portalRecord = await loadPortalRecord(env, project.code);
  const timezone = options.timezone || env.DEFAULT_TZ || 'UTC';
  const view = renderPortalMenu(env, project, portalRecord, { timezone });

  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project, portalRecord };
}

function getPeriodLabel(period) {
  const option = PERIOD_OPTIONS.find((item) => item.value === period);
  return option ? option.label : period;
}

function describeReportFilters(filters = {}) {
  const parts = [];
  parts.push(
    `мин. расход ${filters.minSpend !== null && Number.isFinite(filters.minSpend)
      ? `≥ ${formatNumber(filters.minSpend)}`
      : 'не задан'}`,
  );
  parts.push(filters.onlyPositive ? 'только с результатом' : 'включая 0 результатов');
  return parts.join(', ');
}

function formatRangeLabel(range) {
  if (!range || (!range.since && !range.until)) {
    return '—';
  }

  const since = range.since ?? range.until ?? '—';
  const until = range.until ?? since;
  return since === until ? since : `${since}–${until}`;
}

function createReportState(project, overrides = {}) {
  const normalized = normalizeReportOptions(project, overrides);
  const state = {
    mode: 'report_options',
    code: project.code,
    step: overrides.step ?? 'menu',
    period: normalized.period,
    minSpend: normalized.minSpend,
    onlyPositive: normalized.onlyPositive,
  };

  if (typeof overrides.message_chat_id !== 'undefined') {
    state.message_chat_id = overrides.message_chat_id;
  }

  if (typeof overrides.message_id !== 'undefined') {
    state.message_id = overrides.message_id;
  }

  return state;
}

function normalizeReportOptions(project, options = {}) {
  const defaults = {
    period: project.period ?? 'yesterday',
    minSpend: null,
    onlyPositive: false,
  };

  const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const periodCandidate = typeof options.period === 'string' ? options.period : defaults.period;
  const period = allowed.has(periodCandidate) ? periodCandidate : defaults.period;

  const filters = normalizeReportFilters({
    minSpend: options.minSpend ?? options.min_spend ?? defaults.minSpend,
    onlyPositive: options.onlyPositive ?? options.only_positive ?? defaults.onlyPositive,
  });

  return {
    period,
    minSpend: filters.minSpend,
    onlyPositive: filters.onlyPositive,
  };
}

function renderReportOptions(project, options = {}, context = {}) {
  const timezone = context.timezone || 'UTC';
  const normalized = normalizeReportOptions(project, options);
  const range = getPeriodRange(normalized.period, timezone);
  const periodLabel = getPeriodLabel(normalized.period);
  const awaitingMinSpend = context.awaitingMinSpend === true;
  const awaitingPresetName = context.awaitingPresetName === true;

  const lines = [
    `<b>Отчёт #${escapeHtml(project.code)}</b>`,
    `Период: ${escapeHtml(periodLabel)}${range ? ` (${range.since}–${range.until})` : ''}`,
    '',
    'Фильтры:',
    `• Мин. расход: ${normalized.minSpend !== null ? `≥ ${formatNumber(normalized.minSpend)}` : 'не задан'}`,
    `• Только с результатами: ${normalized.onlyPositive ? 'да' : 'нет'}`,
  ];

  if (awaitingMinSpend) {
    lines.push('');
    lines.push('Отправьте минимальный расход числом, например <code>25</code> или <code>12.5</code>.');
  } else if (awaitingPresetName) {
    lines.push('');
    lines.push('Отправьте название пресета (2–60 символов). Оно будет доступно только вам.');
  } else {
    lines.push('');
    lines.push('Выберите период, настройте фильтры и решите, куда отправить отчёт.');
  }

  const inline_keyboard = [];
  const periodButtons = PERIOD_OPTIONS.map((option) => ({
    text: option.value === normalized.period ? `✅ ${option.label}` : option.label,
    callback_data: `proj:report:period:${project.code}:${option.value}`,
  }));

  for (const chunk of chunkArray(periodButtons, 3)) {
    inline_keyboard.push(chunk);
  }

  inline_keyboard.push([
    { text: '✏️ Мин. расход', callback_data: `proj:report:min:${project.code}:set` },
    {
      text:
        normalized.minSpend !== null && Number.isFinite(normalized.minSpend)
          ? `Очистить (${formatNumber(normalized.minSpend)})`
          : 'Сбросить фильтр',
      callback_data: `proj:report:min:${project.code}:clear`,
    },
  ]);

  inline_keyboard.push([
    { text: '⭐ Сохранить пресет', callback_data: `proj:report:preset:save:${project.code}` },
    { text: '📚 Пресеты', callback_data: `proj:report:preset:list:${project.code}` },
  ]);

  inline_keyboard.push([
    {
      text: normalized.onlyPositive ? '✅ Только с результатом' : 'Включая 0 результатов',
      callback_data: `proj:report:positive:${project.code}`,
    },
  ]);

  inline_keyboard.push([
    { text: '👁 Просмотр в панели', callback_data: `proj:report:preview:${project.code}` },
    { text: '📤 В чат', callback_data: `proj:report:send:${project.code}` },
  ]);

  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  if (awaitingMinSpend) {
    inline_keyboard.unshift([
      { text: '❌ Отменить ввод', callback_data: `proj:report:min:${project.code}:cancel` },
    ]);
  } else if (awaitingPresetName) {
    inline_keyboard.unshift([
      { text: '❌ Отменить ввод', callback_data: `proj:report:preset:cancel:${project.code}` },
    ]);
  }

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithReportOptions(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingMinSpend = options.awaitingMinSpend === true;
  let awaitingPresetName = options.awaitingPresetName === true;
  let currentOptions = options.values ?? {};

  if (options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'report_options' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      currentOptions = {
        period: state.period,
        minSpend: state.minSpend,
        onlyPositive: state.onlyPositive,
      };
      awaitingMinSpend = awaitingMinSpend || state.step === 'await_min_spend';
      awaitingPresetName = awaitingPresetName || state.step === 'await_preset_name';
    }
  }

  const timezone = options.timezone || env.DEFAULT_TZ || 'UTC';
  const view = renderReportOptions(project, currentOptions, { timezone, awaitingMinSpend, awaitingPresetName });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

function renderReportPresetMenu(project, presets = [], context = {}) {
  const timezone = context.timezone || 'UTC';
  const lines = [`<b>Пресеты отчётов #${escapeHtml(project.code)}</b>`];

  if (!presets.length) {
    lines.push('Пока нет сохранённых пресетов. Настройте фильтры и нажмите «⭐ Сохранить пресет».');
  } else {
    lines.push('Выберите пресет, чтобы применить фильтры, либо удалите лишние.');
    lines.push('');
    for (const preset of presets) {
      const periodLabel = getPeriodLabel(preset.period ?? project.period ?? 'yesterday');
      const filtersLabel = describeReportFilters({
        minSpend: preset.minSpend,
        onlyPositive: preset.onlyPositive,
      });
      const updatedAt = preset.updated_at ?? preset.created_at ?? null;
      const updatedLabel = updatedAt ? formatDateTimeLabel(updatedAt, timezone) : null;
      const parts = [`• <b>${escapeHtml(preset.name)}</b> — ${escapeHtml(periodLabel)}`, filtersLabel];
      if (updatedLabel) {
        parts.push(`обновлён: ${escapeHtml(updatedLabel)}`);
      }
      lines.push(parts.join(', '));
    }
  }

  const inline_keyboard = [];

  for (const preset of presets) {
    inline_keyboard.push([
      {
        text: `✅ ${preset.name.length > 16 ? `${preset.name.slice(0, 15)}…` : preset.name}`,
        callback_data: `proj:report:preset:apply:${project.code}:${preset.id}`,
      },
      {
        text: '🗑 Удалить',
        callback_data: `proj:report:preset:delete:${project.code}:${preset.id}`,
      },
    ]);
  }

  inline_keyboard.push([
    { text: '➕ Новый пресет', callback_data: `proj:report:preset:save:${project.code}` },
    { text: '↩️ К отчёту', callback_data: `proj:report:open:${project.code}` },
  ]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithReportPresetMenu(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь к списку проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const uid = options.uid;
  const presets = Array.isArray(options.presets) && options.presets.length
    ? options.presets
    : uid
      ? await loadReportPresets(env, uid)
      : [];

  const timezone = options.timezone || env.DEFAULT_TZ || 'UTC';
  const view = renderReportPresetMenu(project, presets, { timezone });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project, presets };
}

function normalizeDigestOptions(project, options = {}) {
  const defaults = {
    period: project.period ?? 'yesterday',
  };

  const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value));
  const periodCandidate = typeof options.period === 'string' ? options.period : defaults.period;
  const period = allowed.has(periodCandidate) ? periodCandidate : defaults.period;

  return { period };
}

function createDigestState(project, overrides = {}) {
  const normalized = normalizeDigestOptions(project, overrides);
  const state = {
    mode: 'digest_options',
    code: project.code,
    step: overrides.step ?? 'menu',
    period: normalized.period,
  };

  if (typeof overrides.message_chat_id !== 'undefined') {
    state.message_chat_id = overrides.message_chat_id;
  }

  if (typeof overrides.message_id !== 'undefined') {
    state.message_id = overrides.message_id;
  }

  return state;
}

function renderDigestOptions(project, options = {}, context = {}) {
  const timezone = context.timezone || 'UTC';
  const normalized = normalizeDigestOptions(project, options);
  const range = getPeriodRange(normalized.period, timezone);
  const periodLabel = getPeriodLabel(normalized.period);
  const awaitingPresetName = context.awaitingPresetName === true;

  const lines = [
    `<b>Дайджест #${escapeHtml(project.code)}</b>`,
    `Период: ${escapeHtml(periodLabel)}${range ? ` (${range.since}–${range.until})` : ''}`,
    '',
    'Выберите период, сохраните пресет или сразу отправьте дайджест.',
  ];

  if (awaitingPresetName) {
    lines.push('', 'Отправьте название пресета (2–60 символов). Оно будет доступно только вам.');
  }

  const periodButtons = PERIOD_OPTIONS.map((option) => ({
    text: option.value === normalized.period ? `✅ ${option.label}` : option.label,
    callback_data: `proj:digest:period:${project.code}:${option.value}`,
  }));

  const inline_keyboard = [];
  for (const chunk of chunkArray(periodButtons, 3)) {
    inline_keyboard.push(chunk);
  }

  const saveLabel = awaitingPresetName ? '⌛ Жду название…' : '💾 Сохранить пресет';
  inline_keyboard.push([
    { text: saveLabel, callback_data: `proj:digest:preset_save:${project.code}` },
    { text: '🎛 Мои пресеты', callback_data: `proj:digest:preset_menu:${project.code}` },
  ]);

  inline_keyboard.push([
    { text: '👁 Просмотр в панели', callback_data: `proj:digest:preview:${project.code}` },
    { text: '📬 В чат', callback_data: `proj:digest:send:${project.code}` },
  ]);

  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderDigestPresetMenu(project, presets = [], context = {}) {
  const timezone = context.timezone || 'UTC';
  const notice = context.notice ? String(context.notice) : null;
  const lines = [`<b>Пресеты дайджестов #${escapeHtml(project.code)}</b>`];

  if (notice) {
    lines.push('', escapeHtml(notice));
  }

  if (!presets.length) {
    lines.push('', 'Пока нет сохранённых пресетов. Нажмите «💾 Сохранить пресет» в меню дайджеста.');
  } else {
    lines.push('', 'Сохранённые пресеты:');
    for (const preset of presets) {
      const label = getPeriodLabel(preset.period);
      const updated = preset.updated_at
        ? formatDateTimeLabel(preset.updated_at, timezone)
        : null;
      const suffix = updated ? ` · ${escapeHtml(updated)}` : '';
      lines.push(`• <b>${escapeHtml(preset.name)}</b> — ${escapeHtml(label)}${suffix}`);
    }
  }

  const inline_keyboard = [];
  for (const preset of presets) {
    inline_keyboard.push([
      {
        text: `▶️ ${preset.name}`,
        callback_data: `proj:digest:preset_apply:${project.code}:${preset.id}`,
      },
      {
        text: '🗑 Удалить',
        callback_data: `proj:digest:preset_delete:${project.code}:${preset.id}`,
      },
    ]);
  }

  inline_keyboard.push([{ text: '↩️ К настройкам дайджеста', callback_data: `proj:digest:open:${project.code}` }]);
  inline_keyboard.push([{ text: '← К проекту', callback_data: `proj:detail:${project.code}` }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithDigestOptions(env, message, code, options = {}, context = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Возможно, он был удалён.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const timezone = context.timezone || env.DEFAULT_TZ || 'UTC';
  const view = renderDigestOptions(project, options, { ...context, timezone });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true };
}

async function clearPendingReportState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'report_options' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

function prettifyCampaignLabel(value) {
  if (!value) return null;
  const text = String(value).replace(/_/g, ' ').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function renderCampaignEditor(project, options = {}) {
  const items = Array.isArray(options.items) ? options.items : [];
  const timezone = options.timezone || 'UTC';
  const updatedAt = options.updatedAt || null;
  const selectedSet = new Set(
    Array.isArray(project?.campaigns) ? project.campaigns.map((value) => normalizeCampaignId(value)).filter(Boolean) : [],
  );

  const totalPages = Math.max(1, Math.ceil(items.length / CAMPAIGN_EDITOR_PAGE_SIZE));
  const rawPage = Number.isFinite(options.page) ? Number(options.page) : 0;
  const page = Math.min(Math.max(rawPage, 0), totalPages - 1);
  const startIndex = page * CAMPAIGN_EDITOR_PAGE_SIZE;
  const slice = items.slice(startIndex, startIndex + CAMPAIGN_EDITOR_PAGE_SIZE);

  const lines = [
    `<b>Кампании #${escapeHtml(project.code)}</b>`,
    project?.act
      ? `Аккаунт: <code>${escapeHtml(project.act)}</code>`
      : 'Аккаунт не указан. Задайте рекламный аккаунт, чтобы выбрать кампании.',
    `Выбрано кампаний: ${selectedSet.size}`,
  ];

  if (updatedAt) {
    lines.push(`Обновлено: ${escapeHtml(formatDateTimeLabel(updatedAt, timezone))}`);
  }

  lines.push('');

  if (!items.length) {
    lines.push('Список пуст. Нажмите «Обновить список», чтобы получить кампании из Meta Ads.');
  } else {
    for (const row of slice) {
      const selected = selectedSet.has(row.id);
      const mark = selected ? '✅' : '▫️';
      const title = row?.name && row.name.trim().length ? row.name.trim() : `ID ${row.id}`;
      const status =
        prettifyCampaignLabel(row?.effective_status) ||
        prettifyCampaignLabel(row?.status) ||
        '—';
      const objective = prettifyCampaignLabel(row?.objective);
      const suffixParts = [status];
      if (objective) {
        suffixParts.push(objective);
      }
      lines.push(
        `${mark} ${escapeHtml(title)} · ${escapeHtml(suffixParts.filter(Boolean).join(' · ') || '—')}`,
      );
    }

    lines.push('');
    lines.push(
      `Показаны ${items.length ? `${startIndex + 1}–${Math.min(startIndex + slice.length, items.length)}` : '0'} из ${
        items.length
      } кампаний.`,
    );
  }

  lines.push('');
  lines.push('Отметьте кампании для отчётов и алертов или воспользуйтесь пресетами ниже.');

  const inline_keyboard = [];

  const makeButtonLabel = (row, selected) => {
    const mark = selected ? '✅' : '▫️';
    const title = row?.name && row.name.trim().length ? row.name.trim() : `ID ${row.id}`;
    const maxLength = 28;
    const shortTitle = title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title;
    return `${mark} ${shortTitle}`;
  };

  if (slice.length) {
    for (const row of slice) {
      inline_keyboard.push([
        {
          text: makeButtonLabel(row, selectedSet.has(row.id)),
          callback_data: `proj:campaigns:toggle:${project.code}:${row.id}`,
        },
        {
          text: '⚙️',
          callback_data: `proj:campaigns:manage:${project.code}:${row.id}`,
        },
      ]);
    }
  }

  if (totalPages > 1) {
    inline_keyboard.push([
      { text: '⬅️', callback_data: `proj:campaigns:page:${project.code}:prev` },
      { text: `${page + 1}/${totalPages}`, callback_data: 'proj:campaigns:noop' },
      { text: '➡️', callback_data: `proj:campaigns:page:${project.code}:next` },
    ]);
  }

  inline_keyboard.push([
    { text: '🔄 Обновить список', callback_data: `proj:campaigns:refresh:${project.code}` },
  ]);

  inline_keyboard.push([
    { text: '✅ Все активные', callback_data: `proj:campaigns:select:${project.code}:active` },
    { text: '🎯 Все кампании', callback_data: `proj:campaigns:select:${project.code}:all` },
  ]);

  inline_keyboard.push([
    { text: '♻️ Очистить выбор', callback_data: `proj:campaigns:select:${project.code}:clear` },
  ]);

  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithCampaignEditor(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  let project = options.projectOverride ?? null;
  if (!project) {
    project = await loadProject(env, code);
  }
  if (!project) {
    await telegramEditMessage(
      env,
      chatId,
      messageId,
      'Проект не найден. Вернитесь в список проектов и выберите его заново.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
        },
      },
    );
    return { ok: false, error: 'project_not_found' };
  }

  let items = Array.isArray(options.items) ? options.items : null;
  let page = Number.isFinite(options.page) ? Number(options.page) : null;
  let updatedAt = options.updatedAt ?? null;

  if (!items && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (state?.mode === 'campaign_editor' && state.code === code && Array.isArray(state.items)) {
      items = state.items;
      if (!Number.isFinite(page) && Number.isFinite(state.page)) {
        page = state.page;
      }
      if (!updatedAt && Number.isFinite(state.updated_at)) {
        updatedAt = state.updated_at;
      }
    }
  }

  const resolvedItems = Array.isArray(items) ? items : [];
  const resolvedPage = Number.isFinite(page) ? page : 0;
  const timezone = options.timezone ?? env.DEFAULT_TZ ?? 'UTC';

  const view = renderCampaignEditor(project, {
    items: resolvedItems,
    page: resolvedPage,
    timezone,
    updatedAt,
  });

  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  if (options.uid) {
    await saveUserState(env, options.uid, {
      mode: 'campaign_editor',
      code,
      items: resolvedItems,
      page: resolvedPage,
      updated_at: updatedAt ?? Date.now(),
    });
  }

  return { ok: true, project };
}
editMessageWithCampaignEditor.currencyCache = new Map();

function renderCampaignManager(project, campaignMeta, performance, adsets, options = {}) {
  const currency = options.currency || 'USD';
  const timezone = options.timezone || 'UTC';
  const lines = [
    `<b>Кампания ${escapeHtml(campaignMeta?.name || project.code)}</b>`,
    `ID: <code>${escapeHtml(campaignMeta?.id || '—')}</code> · Статус: ${escapeHtml(
      prettifyCampaignLabel(campaignMeta?.effective_status) || prettifyCampaignLabel(campaignMeta?.status) || '—',
    )}`,
    '',
    'Показатели:',
  ];

  const perfOrder = [
    ['today', 'Сегодня'],
    ['last7', '7 дней'],
    ['month', 'С начала месяца'],
    ['lifetime', 'За всё время'],
  ];

  for (const [key, label] of perfOrder) {
    const snapshot = performance?.[key];
    if (!snapshot) continue;
    const spendLabel = formatCurrency(snapshot.spend ?? 0, currency);
    const resultsLabel = formatNumber(snapshot.results ?? 0);
    const cpaLabel = Number.isFinite(snapshot.cpa) ? formatCpa(snapshot.cpa, currency) : '—';
    lines.push(`• ${label}: ${spendLabel} · Результаты ${resultsLabel} · CPA ${cpaLabel}`);
  }

  if (!adsets.length) {
    lines.push('', 'Адсеты не найдены.');
  } else {
    lines.push('', 'Адсеты:');
    for (const adset of adsets.slice(0, 6)) {
      const status = prettifyCampaignLabel(adset.effective_status) || prettifyCampaignLabel(adset.status) || '—';
      const budget = adset.daily_budget
        ? `${formatCurrency(Number(adset.daily_budget) / 100, currency)}/д`
        : adset.lifetime_budget
        ? `${formatCurrency(Number(adset.lifetime_budget) / 100, currency)} общий`
        : '—';
      const endTime = adset.end_time ? formatDateTimeLabel(adset.end_time, timezone) : '—';
      lines.push(
        `• ${escapeHtml(adset.name || adset.id)} · ${status} · бюджет ${budget} · окончание ${endTime}`,
      );
    }
    if (adsets.length > 6) {
      lines.push(`… и ещё ${adsets.length - 6} адсетов`);
    }
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: '⏸ Пауза кампании',
      callback_data: `proj:campaigns:action:${project.code}:${campaignMeta?.id}:pause`,
    },
    {
      text: '▶️ Включить кампанию',
      callback_data: `proj:campaigns:action:${project.code}:${campaignMeta?.id}:resume`,
    },
  ]);

  inline_keyboard.push([
    {
      text: '💰 +10% бюджета',
      callback_data: `proj:campaigns:action:${project.code}:${campaignMeta?.id}:budget:+10`,
    },
    {
      text: '📆 +7 дней',
      callback_data: `proj:campaigns:action:${project.code}:${campaignMeta?.id}:extend:7`,
    },
  ]);

  if (adsets.length) {
    for (const adset of adsets.slice(0, 6)) {
      inline_keyboard.push([
        {
          text: `${prettifyCampaignLabel(adset.effective_status) || '▫️'} ${
            adset.name?.length > 24 ? `${adset.name.slice(0, 23)}…` : adset.name || adset.id
          }`,
          callback_data: `proj:adsets:toggle:${project.code}:${campaignMeta?.id}:${adset.id}`,
        },
      ]);
    }
  }

  inline_keyboard.push([
    {
      text: '📣 Объявления',
      callback_data: `proj:campaigns:ads:${project.code}:${campaignMeta?.id}`,
    },
  ]);

  inline_keyboard.push([{ text: '↩️ К кампаниям', callback_data: `proj:campaigns:open:${project.code}` }]);
  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderCampaignAdsView(project, campaignMeta, ads = [], options = {}) {
  const currency = options.currency || 'USD';
  const lines = [
    `<b>Объявления кампании ${escapeHtml(campaignMeta?.name || project.code)}</b>`,
    '',
  ];

  if (!ads.length) {
    lines.push('Объявления не найдены.');
  } else {
    for (const ad of ads.slice(0, 10)) {
      const perf = ad.performance ?? {};
      const spend = formatCurrency(perf.spend ?? 0, currency);
      const results = formatNumber(perf.results ?? 0);
      const cpa = Number.isFinite(perf.cpa) ? formatCpa(perf.cpa, currency) : '—';
      lines.push(
        `• ${escapeHtml(ad.name || ad.id)} · ${escapeHtml(
          prettifyCampaignLabel(ad.effective_status) || prettifyCampaignLabel(ad.status) || '—',
        )}\n  ${spend} · Результаты ${results} · CPA ${cpa}`,
      );
    }
    if (ads.length > 10) {
      lines.push(`… и ещё ${ads.length - 10} объявлений`);
    }
  }

  const inline_keyboard = [];

  for (const ad of ads.slice(0, 10)) {
    inline_keyboard.push([
      {
        text: `${prettifyCampaignLabel(ad.effective_status) || '▫️'} ${
          ad.name?.length > 20 ? `${ad.name.slice(0, 19)}…` : ad.name || ad.id
        }`,
        callback_data: `proj:ads:toggle:${project.code}:${campaignMeta?.id}:${ad.id}`,
      },
    ]);
  }

  inline_keyboard.push([{ text: '↩️ К кампании', callback_data: `proj:campaigns:manage:${project.code}:${campaignMeta?.id}` }]);
  inline_keyboard.push([{ text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderScheduleEditor(project, options = {}) {
  const times = sortUniqueTimes(project.times);
  const lines = [
    `<b>Расписание #${escapeHtml(project.code)}</b>`,
    `Период: <code>${escapeHtml(project.period)}</code>`,
    '',
  ];

  if (times.length) {
    lines.push('Текущие значения:');
    lines.push(...times.map((time) => `• ${time}`));
  } else {
    lines.push('Текущие значения: —');
  }

  lines.push('');
  lines.push(`Тихие выходные: ${project.mute_weekends ? 'включены' : 'выключены'}`);

  if (options.awaitingTime) {
    lines.push('');
    lines.push('Отправьте сообщением время в формате HH:MM. Например: <code>21:15</code>.');
  }

  const inline_keyboard = [];

  if (times.length) {
    for (const chunk of chunkArray(times, 2)) {
      inline_keyboard.push(chunk.map((time) => ({
        text: `🗑 ${time}`,
        callback_data: `proj:schedule:del:${project.code}:${time.replace(':', '-')}`,
      })));
    }
  }

  const quickButtons = QUICK_TIMES.map((time) => ({
    text: times.includes(time) ? `• ${time}` : `➕ ${time}`,
    callback_data: `proj:schedule:add:${project.code}:${time.replace(':', '-')}`,
  }));
  for (const chunk of chunkArray(quickButtons, 2)) {
    inline_keyboard.push(chunk);
  }

  if (options.awaitingTime) {
    inline_keyboard.push([
      { text: '❌ Отменить ввод', callback_data: `proj:schedule:cancel:${project.code}` },
    ]);
  } else {
    inline_keyboard.push([
      { text: '➕ Другое время', callback_data: `proj:schedule:addcustom:${project.code}` },
    ]);
  }

  const periodRow = [];
  for (const option of PERIOD_OPTIONS) {
    const isActive = project.period === option.value;
    periodRow.push({
      text: `${isActive ? '✅' : '▫️'} ${option.label}`,
      callback_data: `proj:schedule:period:${project.code}:${option.value}`,
    });
    if (periodRow.length === 2) {
      inline_keyboard.push([...periodRow]);
      periodRow.length = 0;
    }
  }
  if (periodRow.length) {
    inline_keyboard.push([...periodRow]);
  }

  inline_keyboard.push([
    {
      text: project.mute_weekends ? '🗓 Включить выходные' : '🧘 Тихие выходные',
      callback_data: `proj:schedule:togglemute:${project.code}`,
    },
  ]);

  inline_keyboard.push([
    { text: '↩️ К карточке', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function renderBillingEditor(project, options = {}) {
  const awaitingPaid = options.awaitingPaid === true;
  const awaitingNext = options.awaitingNext === true;

  const lines = [
    `<b>Оплата #${escapeHtml(project.code)}</b>`,
    `Последняя оплата: <code>${escapeHtml(formatDateLabel(project.billing_paid_at))}</code>`,
    `Следующая оплата: <code>${escapeHtml(formatDateLabel(project.billing_next_at))}</code>`,
    '',
    'Отметьте оплату сегодня или задайте дату вручную. Следующая дата по умолчанию рассчитывается как +1 месяц.',
  ];

  if (awaitingPaid) {
    lines.push('');
    lines.push('Отправьте дату оплаты в формате <code>YYYY-MM-DD</code>, <code>ДД.ММ.ГГГГ</code> или слово «сегодня».');
  }

  if (awaitingNext) {
    lines.push('');
    lines.push('Введите дату следующего платежа (<code>YYYY-MM-DD</code> или <code>ДД.ММ.ГГГГ</code>). Можно отправить «нет», чтобы очистить.');
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    { text: '✅ Оплата сегодня', callback_data: `proj:billing:today:${project.code}` },
    { text: '✏️ Ввести дату', callback_data: `proj:billing:manual:${project.code}` },
  ]);

  inline_keyboard.push([
    { text: '🗓 Изменить следующую', callback_data: `proj:billing:next:${project.code}` },
    { text: '♻️ Очистить', callback_data: `proj:billing:clear:${project.code}` },
  ]);

  if (awaitingPaid || awaitingNext) {
    inline_keyboard.push([
      { text: '❌ Отменить ввод', callback_data: `proj:billing:cancel:${project.code}` },
    ]);
  }

  inline_keyboard.push([
    { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithBilling(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingPaid = options.awaitingPaid === true;
  let awaitingNext = options.awaitingNext === true;

  if (!awaitingPaid && !awaitingNext && options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'edit_billing' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      awaitingPaid = state.step === 'await_paid';
      awaitingNext = state.step === 'await_next';
    }
  }

  const view = renderBillingEditor(project, { awaitingPaid, awaitingNext });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingBillingState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'edit_billing' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

function renderAutopauseEditor(project, options = {}) {
  const autopause = project.autopause ?? {};
  const enabled = autopause.enabled === true;
  const days = Number.isFinite(autopause.days) ? Number(autopause.days) : 3;
  const awaitingDays = options.awaitingDays === true;

  const lines = [
    `<b>Автопауза #${escapeHtml(project.code)}</b>`,
    `Состояние: ${enabled ? 'включена' : 'выключена'}`,
    `Порог дней: ${days}`,
    '',
    'Если фактический CPL остаётся выше KPI.cpl заданное число дней подряд, бот предложит поставить кампании на паузу.',
  ];

  if (awaitingDays) {
    lines.push(
      '',
      'Введите целое число дней (1–30). Можно отправить «нет», чтобы отключить автопаузу.'
    );
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: enabled ? '🤖 Выключить автопаузу' : '🤖 Включить автопаузу',
      callback_data: `proj:autopause:toggle:${project.code}`,
    },
  ]);

  const presetButtons = AUTOPAUSE_PRESET_DAYS.map((value) => ({
    text: value === days ? `✅ ${value} дн.` : `${value} дн.`,
    callback_data: `proj:autopause:set:${project.code}:${value}`,
  }));

  for (const chunk of chunkArray(presetButtons, 3)) {
    inline_keyboard.push(chunk);
  }

  inline_keyboard.push([
    { text: 'Другое значение', callback_data: `proj:autopause:custom:${project.code}` },
    { text: '♻️ Сбросить (3 дн.)', callback_data: `proj:autopause:reset:${project.code}` },
  ]);

  if (awaitingDays) {
    inline_keyboard.push([
      { text: '❌ Отменить ввод', callback_data: `proj:autopause:cancel:${project.code}` },
    ]);
  }

  inline_keyboard.push([
    { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithAutopause(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingDays = options.awaitingDays === true;
  if (!awaitingDays && options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'edit_autopause' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      awaitingDays = true;
    }
  }

  const view = renderAutopauseEditor(project, { awaitingDays });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingAutopauseState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'edit_autopause' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

function renderAlertsEditor(project, options = {}) {
  const alerts = project.alerts ?? {};
  const enabled = alerts.enabled !== false;
  const billingTimes = sortUniqueTimes(alerts.billing_times || []);
  const normalizedZero = alerts.no_spend_by ? normalizeTimeString(alerts.no_spend_by) : null;
  const zeroLabel = normalizedZero || (alerts.no_spend_by ? String(alerts.no_spend_by) : null);
  const awaitingBilling = options.awaitingBilling === true;
  const awaitingZero = options.awaitingZero === true;

  const lines = [
    `<b>Alerts #${escapeHtml(project.code)}</b>`,
    `Состояние: ${enabled ? 'включены' : 'выключены'}`,
    `Billing окна: ${billingTimes.length ? billingTimes.join(', ') : '—'}`,
    `Zero-spend контроль: ${zeroLabel || 'выключен'}`,
    '',
    'Алерты напоминают об оплате и сообщают, если при активных кампаниях расход остаётся нулевым.',
  ];

  if (awaitingBilling) {
    lines.push('', 'Отправьте время в формате <code>HH:MM</code>, например <code>09:45</code>.');
  }

  if (awaitingZero) {
    lines.push('', 'Введите время контроля (<code>HH:MM</code>) или «нет», чтобы отключить zero-spend-проверку.');
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: enabled ? '📊 Выключить алерты' : '📊 Включить алерты',
      callback_data: `proj:alerts:toggle:${project.code}`,
    },
  ]);

  if (billingTimes.length) {
    for (const chunk of chunkArray(billingTimes, 2)) {
      inline_keyboard.push(
        chunk.map((time) => ({
          text: `🗑 ${time}`,
          callback_data: `proj:alerts:del:${project.code}:${time.replace(':', '-')}`,
        })),
      );
    }
  }

  const presetButtons = ALERT_BILLING_PRESET_TIMES.map((time) => {
    const normalized = normalizeTimeString(time);
    if (!normalized) {
      return null;
    }
    const active = billingTimes.includes(normalized);
    return {
      text: `${active ? '✅' : '➕'} ${normalized}`,
      callback_data: `proj:alerts:time:${project.code}:${normalized.replace(':', '-')}`,
    };
  }).filter(Boolean);

  for (const chunk of chunkArray(presetButtons, 3)) {
    inline_keyboard.push(chunk);
  }

  inline_keyboard.push([
    { text: '✏️ Другое время', callback_data: `proj:alerts:custom:${project.code}` },
    { text: '♻️ Сбросить слоты', callback_data: `proj:alerts:reset:${project.code}` },
  ]);

  const zeroPresetButtons = ALERT_ZERO_PRESET_TIMES.map((time) => {
    const normalized = normalizeTimeString(time);
    if (!normalized) {
      return null;
    }
    const active = normalizedZero === normalized;
    return {
      text: `${active ? '✅' : '▫️'} ${normalized}`,
      callback_data: `proj:alerts:zero:${project.code}:${normalized.replace(':', '-')}`,
    };
  }).filter(Boolean);

  if (zeroPresetButtons.length) {
    for (const chunk of chunkArray(zeroPresetButtons, 3)) {
      inline_keyboard.push(chunk);
    }
  }

  inline_keyboard.push([
    {
      text: normalizedZero === null ? '🟢 Включить zero-spend' : '🛑 Выключить zero-spend',
      callback_data: `proj:alerts:zero:${project.code}:off`,
    },
    {
      text: normalizedZero === '12:00' ? '✅ Сброс (12:00)' : '♻️ Сброс (12:00)',
      callback_data: `proj:alerts:zero:${project.code}:reset`,
    },
  ]);

  inline_keyboard.push([
    { text: '✏️ Другое значение', callback_data: `proj:alerts:zero:${project.code}:custom` },
  ]);

  if (awaitingBilling || awaitingZero) {
    inline_keyboard.push([
      { text: '❌ Отменить ввод', callback_data: `proj:alerts:cancel:${project.code}` },
    ]);
  }

  inline_keyboard.push([
    { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithAlerts(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingBilling = options.awaitingBilling === true;
  let awaitingZero = options.awaitingZero === true;

  if (!awaitingBilling && !awaitingZero && options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'edit_alerts' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      awaitingBilling = state.step === 'await_billing';
      awaitingZero = state.step === 'await_zero';
    }
  }

  const view = renderAlertsEditor(project, { awaitingBilling, awaitingZero });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingAlertsState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'edit_alerts' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

function renderKpiEditor(project, options = {}) {
  const awaitingField = options.awaitingField ?? null;
  const lines = [
    `<b>KPI проекта #${escapeHtml(project.code)}</b>`,
    `CPL: <code>${escapeHtml(formatKpiValue(project.kpi?.cpl))}</code>`,
    `Лидов в день: <code>${escapeHtml(formatKpiValue(project.kpi?.leads_per_day))}</code>`,
    `Бюджет в день: <code>${escapeHtml(formatKpiValue(project.kpi?.daily_budget))}</code>`,
    '',
    'Используйте кнопки, чтобы обновить значения. Отправьте «нет» или «0», чтобы очистить показатель.',
  ];

  if (awaitingField) {
    const prompts = {
      cpl: 'Введите целевой CPL (число). Например: 7.5',
      leads_per_day: 'Введите целевое число лидов в день. Например: 12',
      daily_budget: 'Введите целевой дневной бюджет. Например: 45.5',
    };
    lines.push('');
    lines.push(prompts[awaitingField] ?? 'Введите значение.');
    lines.push('Можно отправить «нет», чтобы очистить показатель.');
  }

  const inline_keyboard = [];
  inline_keyboard.push([
    {
      text: `CPL (${formatKpiValue(project.kpi?.cpl)})`,
      callback_data: `proj:kpi:set:cpl:${project.code}`,
    },
    {
      text: `Л/д (${formatKpiValue(project.kpi?.leads_per_day)})`,
      callback_data: `proj:kpi:set:leads_per_day:${project.code}`,
    },
  ]);
  inline_keyboard.push([
    {
      text: `Бюд/д (${formatKpiValue(project.kpi?.daily_budget)})`,
      callback_data: `proj:kpi:set:daily_budget:${project.code}`,
    },
  ]);
  inline_keyboard.push([
    { text: '♻️ Сбросить KPI', callback_data: `proj:kpi:reset:${project.code}` },
  ]);

  if (awaitingField) {
    inline_keyboard.push([
      { text: '❌ Отменить ввод', callback_data: `proj:kpi:cancel:${project.code}` },
    ]);
  }

  inline_keyboard.push([
    { text: '↩️ К проекту', callback_data: `proj:detail:${project.code}` },
    { text: '← В панель', callback_data: 'panel:home' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function editMessageWithProject(env, message, code) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Возможно, он был удалён.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  const chatRecord = project.chat_id
    ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
    : null;
  const portalRecord = await loadPortalRecord(env, project.code);
  const accountMeta = project.act
    ? await loadAccountMeta(env, project.act.replace(/^act_/i, '') ?? project.act)
    : null;
  const timezone = env.DEFAULT_TZ || 'UTC';
  let accountHealth = null;
  try {
    const { token } = await resolveMetaToken(env);
    if (token) {
      accountHealth = await fetchAccountHealthSummary(env, project, token);
    }
  } catch (error) {
    console.error('account health fetch error', project.code, error);
  }
  const details = renderProjectDetails(project, chatRecord, portalRecord, {
    timezone,
    accountMeta,
    accountHealth,
  });
  await telegramEditMessage(env, chatId, messageId, details.text, {
    reply_markup: details.reply_markup,
  });

  return { ok: true, project, chatRecord, portalRecord };
}

async function editMessageWithSchedule(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingTime = options.awaitingTime === true;
  if (!awaitingTime && options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'edit_schedule' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      awaitingTime = true;
    }
  }

  const view = renderScheduleEditor(project, { awaitingTime });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingScheduleState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'edit_schedule' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

async function editMessageWithKpi(env, message, code, options = {}) {
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (!chatId || !messageId) {
    return { ok: false, error: 'no_message_context' };
  }

  const project = await loadProject(env, code);
  if (!project) {
    await telegramEditMessage(env, chatId, messageId, 'Проект не найден. Вернитесь в список проектов.', {
      reply_markup: {
        inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
      },
    });
    return { ok: false, error: 'project_not_found' };
  }

  let awaitingField = options.awaitingField ?? null;
  if (!awaitingField && options.preserveAwait && options.uid) {
    const state = await loadUserState(env, options.uid);
    if (
      state?.mode === 'edit_kpi' &&
      state.code === code &&
      state.message_id === messageId &&
      state.message_chat_id === chatId
    ) {
      awaitingField = state.field ?? null;
    }
  }

  const view = renderKpiEditor(project, { awaitingField });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingKpiState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'edit_kpi' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
}

function buildChatSelectionPrompt(chats, options = {}) {
  const lines = ['<b>Шаг 2.</b> Выберите чат и топик для проекта.', ''];

  if (!chats.length) {
    lines.push('Нет зарегистрированных топиков. Выполните /register в нужной теме клиента.');
  } else {
    chats.forEach((chat) => {
      lines.push(formatChatLine(chat));
    });
    lines.push('', 'Нажмите кнопку с нужным chat_id, чтобы продолжить.');
  }

  const inline_keyboard = [];

  chats.forEach((chat) => {
    inline_keyboard.push([
      {
        text: `${chat.title ? chat.title.slice(0, 28) : chat.chat_id} · #${chat.thread_id ?? 0}`,
        callback_data: `proj:create:chat:${chat.chat_id}:${chat.thread_id ?? 0}`,
      },
    ]);
  });

  if (options.nextCursor) {
    inline_keyboard.push([
      {
        text: '➡️ Далее',
        callback_data: `proj:create:chatnext:${encodeURIComponent(options.nextCursor)}`,
      },
    ]);
  }

  if (options.showReset) {
    inline_keyboard.push([
      {
        text: '↩️ В начало',
        callback_data: 'proj:create:chatreset',
      },
    ]);
  }

  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildProjectPeriodPrompt() {
  const lines = [
    '<b>Шаг 4.</b> Выберите период отчётов.',
    '',
    'Этот период будет использоваться по умолчанию для автоотчётов и команд /report.',
    'Изменить его можно позже в карточке проекта.',
  ];

  const inline_keyboard = PERIOD_OPTIONS.map((option) => [
    {
      text: option.value === 'yesterday' ? `⭐️ ${option.label}` : option.label,
      callback_data: `proj:create:period:${option.value}`,
    },
  ]);

  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildProjectSchedulePrompt(selected = {}) {
  const lines = [
    '<b>Шаг 5.</b> Выберите начальное расписание.',
    '',
    'Все настройки можно отредактировать позднее в карточке проекта.',
  ];

  if (Array.isArray(selected.times) && selected.times.length) {
    lines.push('', `Текущее расписание: ${escapeHtml(describeSchedule(selected.times, Boolean(selected.mute_weekends)))}`);
  }

  const inline_keyboard = Object.entries(PROJECT_SCHEDULE_PRESETS).map(([key, preset]) => {
    const presetSummary = describeSchedule(preset.times, preset.mute_weekends);
    const currentSummary = Array.isArray(selected.times)
      ? describeSchedule(selected.times, Boolean(selected.mute_weekends))
      : null;
    const isActive = currentSummary === presetSummary;

    return [
      {
        text: isActive ? `✅ ${preset.label}` : preset.label,
        callback_data: `proj:create:schedule:preset:${key}`,
      },
    ];
  });

  inline_keyboard.push([
    { text: 'Ввести вручную', callback_data: 'proj:create:schedule:manual' },
  ]);
  inline_keyboard.push([
    { text: '← Выбрать другой период', callback_data: 'proj:create:period:back' },
  ]);
  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function describeSchedule(times = [], muteWeekends = false) {
  const slots = times.length ? times.join(', ') : '—';
  const weekends = muteWeekends ? 'тихие выходные: вкл' : 'тихие выходные: выкл';
  return `${slots} (${weekends})`;
}

function cloneAlertConfig(source = {}) {
  const base = source || {};
  const enabled = base.enabled !== false;
  const billing = sortUniqueTimes(base.billing_times || []);
  const zero = base.no_spend_by ? normalizeTimeString(base.no_spend_by) : null;
  return {
    enabled,
    billing_times: billing.length ? billing : [...ALERT_BILLING_DEFAULT_TIMES],
    no_spend_by: zero || null,
  };
}

function cloneWeeklyConfig(source = {}) {
  const base = source || {};
  return {
    enabled: base.enabled !== false,
    mode: base.mode === 'week_yesterday' ? 'week_yesterday' : 'week_today',
  };
}

function normalizeAutopauseDays(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  const rounded = Math.round(numeric);
  return Math.min(AUTOPAUSE_MAX_DAYS, Math.max(1, rounded));
}

function cloneAutopauseConfig(source = {}) {
  const base = source || {};
  const enabled = base.enabled === true;
  const days = normalizeAutopauseDays(base.days);
  return { enabled, days };
}

function buildProjectBillingPrompt(data = {}, options = {}) {
  const billingStatus = data.billing === 'paused' ? 'paused' : 'paid';
  const lines = [
    '<b>Шаг 6.</b> Статус оплаты и биллинга.',
    '',
    'Укажите, активен ли биллинг сейчас, и отметьте дату последнего платежа (при необходимости).',
    '',
    `Состояние: ${billingStatus === 'paused' ? 'пауза по оплате' : 'активен'}`,
    `Последняя оплата: ${escapeHtml(formatDateLabel(data.billing_paid_at))}`,
  ];

  if (data.billing_next_at) {
    lines.push(`Следующая оплата: ${escapeHtml(formatDateLabel(data.billing_next_at))}`);
  }

  if (options.awaitingManual) {
    lines.push('', 'Отправьте дату в формате <code>YYYY-MM-DD</code> или <code>ДД.ММ.ГГГГ</code>. Можно ввести «нет» для очистки.');
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: billingStatus === 'paid' ? '✅ Биллинг активен' : 'Биллинг активен',
      callback_data: 'proj:create:billing:status:paid',
    },
    {
      text: billingStatus === 'paused' ? '✅ На паузе' : 'На паузе',
      callback_data: 'proj:create:billing:status:paused',
    },
  ]);

  inline_keyboard.push([
    { text: '💰 Оплата сегодня', callback_data: 'proj:create:billing:paidtoday' },
    { text: '📅 Ввести дату', callback_data: 'proj:create:billing:manual' },
  ]);

  inline_keyboard.push([
    { text: '🧹 Очистить дату', callback_data: 'proj:create:billing:clear' },
    { text: 'Пропустить', callback_data: 'proj:create:kpi:start' },
  ]);

  inline_keyboard.push([
    { text: '← Назад', callback_data: 'proj:create:schedule:back' },
    { text: 'Далее', callback_data: 'proj:create:kpi:start' },
  ]);

  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildProjectKpiSetupPrompt(data = {}, options = {}) {
  const kpi = data.kpi || {};
  const lines = [
    '<b>Шаг 7.</b> KPI проекта (опционально).',
    '',
    'Можно задать CPL, целевые лиды в день и бюджет. Эти параметры всегда можно изменить позже.',
    '',
    `CPL: <code>${escapeHtml(formatKpiValue(kpi.cpl))}</code>`,
    `Лидов в день: <code>${escapeHtml(formatKpiValue(kpi.leads_per_day))}</code>`,
    `Бюджет в день: <code>${escapeHtml(formatKpiValue(kpi.daily_budget))}</code>`,
  ];

  if (options.awaitingField) {
    const labels = {
      cpl: 'Введите CPL (число, можно с точкой).',
      leads_per_day: 'Введите целевое количество лидов в день (целое число).',
      daily_budget: 'Введите бюджет в день (число, можно с точкой).',
    };
    lines.push('', labels[options.awaitingField] || 'Введите значение или «нет», чтобы очистить.');
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    { text: `CPL (${formatKpiValue(kpi.cpl)})`, callback_data: 'proj:create:kpi:set:cpl' },
    { text: `Лиды/д (${formatKpiValue(kpi.leads_per_day)})`, callback_data: 'proj:create:kpi:set:leads_per_day' },
  ]);

  inline_keyboard.push([
    { text: `Бюджет/д (${formatKpiValue(kpi.daily_budget)})`, callback_data: 'proj:create:kpi:set:daily_budget' },
    { text: '🧹 Очистить KPI', callback_data: 'proj:create:kpi:clear' },
  ]);

  inline_keyboard.push([
    { text: 'Пропустить', callback_data: 'proj:create:alerts:start' },
    { text: '← Назад', callback_data: 'proj:create:billing:back' },
  ]);

  inline_keyboard.push([
    { text: 'Далее', callback_data: 'proj:create:alerts:start' },
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildProjectAlertsSetupPrompt(data = {}) {
  const alerts = data.alerts ? cloneAlertConfig(data.alerts) : cloneAlertConfig(ALERT_DEFAULT_CONFIG);
  const billingTimes = sortUniqueTimes(alerts.billing_times || []);
  const zeroLabel = alerts.no_spend_by ? alerts.no_spend_by : 'выключен';
  const enabled = alerts.enabled !== false;

  const lines = [
    '<b>Шаг 8.</b> Настройка алертов.',
    '',
    'Оставьте стандартные уведомления или отключите их. Всё можно изменить через карточку проекта.',
    '',
    `Алерты: ${enabled ? 'включены' : 'выключены'}`,
    `Окна billing: ${billingTimes.length ? billingTimes.join(', ') : '—'}`,
    `Zero-spend: ${zeroLabel}`,
  ];

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: enabled ? '📊 Выключить алерты' : '📊 Включить алерты',
      callback_data: 'proj:create:alerts:toggle',
    },
  ]);

  inline_keyboard.push([
    { text: '⏱ Стандартные окна', callback_data: 'proj:create:alerts:preset:default' },
    { text: '🔕 Только 10:00', callback_data: 'proj:create:alerts:preset:minimal' },
  ]);

  inline_keyboard.push([
    {
      text: alerts.no_spend_by ? '🚫 Отключить zero-spend' : '✅ Zero-spend 12:00',
      callback_data: alerts.no_spend_by ? 'proj:create:alerts:zero:off' : 'proj:create:alerts:zero:on',
    },
    { text: '♻️ Сбросить', callback_data: 'proj:create:alerts:reset' },
  ]);

  inline_keyboard.push([
    { text: '← Назад', callback_data: 'proj:create:kpi:back' },
    { text: 'Далее', callback_data: 'proj:create:automation:start' },
  ]);

  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

function buildProjectAutomationSetupPrompt(data = {}, options = {}) {
  const active = data.active !== false;
  const weekly = cloneWeeklyConfig(data.weekly);
  const autopause = data.autopause ? cloneAutopauseConfig(data.autopause) : cloneAutopauseConfig();

  const lines = [
    '<b>Шаг 9.</b> Автоотчёты и дополнительные сценарии.',
    '',
    'Задайте состояние автоотчётов, еженедельного сводника и автопаузы по KPI.',
    '',
    `Автоотчёты: ${active ? 'включены' : 'выключены'}`,
    `Сводник: ${formatWeeklyLabel(weekly)}`,
    `Автопауза: ${formatAutopauseLabel(autopause)}`,
  ];

  if (options.awaitingAutopause) {
    lines.push('', 'Введите число дней (1–30) или «нет», чтобы отключить автопаузу.');
  }

  const inline_keyboard = [];

  inline_keyboard.push([
    {
      text: active ? '🔕 Выключить автоотчёты' : '🔔 Включить автоотчёты',
      callback_data: 'proj:create:automation:active:toggle',
    },
  ]);

  inline_keyboard.push([
    {
      text: weekly.enabled ? '📬 Сводник: выкл' : '📬 Сводник: вкл',
      callback_data: 'proj:create:automation:weekly:toggle',
    },
    {
      text: weekly.mode === 'week_yesterday' ? 'Режим: неделя+сегодня' : 'Режим: неделя+вчера',
      callback_data: 'proj:create:automation:weekly:mode',
    },
  ]);

  inline_keyboard.push([
    {
      text: autopause.enabled ? '⏸ Автопауза выкл' : '⏸ Автопауза вкл',
      callback_data: 'proj:create:automation:autopause:toggle',
    },
    {
      text: `Порог: ${formatAutopauseLabel(autopause)}`,
      callback_data: 'proj:create:automation:autopause:manual',
    },
  ]);

  inline_keyboard.push(
    AUTOPAUSE_PRESET_DAYS.map((days) => ({
      text: `${days} дн.`,
      callback_data: `proj:create:automation:autopause:set:${days}`,
    })),
  );

  inline_keyboard.push([
    { text: '♻️ Сбросить автопаузу', callback_data: 'proj:create:automation:autopause:reset' },
  ]);

  inline_keyboard.push([
    { text: '← Назад', callback_data: 'proj:create:automation:back' },
    { text: 'Создать проект', callback_data: 'proj:create:finish' },
  ]);

  inline_keyboard.push([
    { text: 'Отмена', callback_data: 'proj:create:cancel' },
  ]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

async function completeProjectCreation(env, uid, message, data = {}, overrides = {}) {
  const alertsConfig = overrides.alerts ?? data.alerts ?? null;

  const payload = {
    code: data.code,
    act: data.act,
    chat_id: data.chat_id,
    thread_id: data.thread_id ?? 0,
    period: overrides.period ?? data.period ?? 'yesterday',
    times: overrides.times ?? data.times ?? ['09:30'],
    mute_weekends: overrides.mute_weekends ?? Boolean(data.mute_weekends),
    billing: overrides.billing ?? data.billing ?? 'paid',
    billing_paid_at: overrides.billing_paid_at ?? data.billing_paid_at ?? null,
    billing_next_at: overrides.billing_next_at ?? data.billing_next_at ?? null,
    kpi: overrides.kpi ?? data.kpi ?? {},
  };

  if (alertsConfig) {
    payload.alerts = cloneAlertConfig(alertsConfig);
  }

  payload.active = overrides.active ?? (data.active !== false);
  payload.weekly = cloneWeeklyConfig(overrides.weekly ?? data.weekly ?? {});
  payload.autopause = cloneAutopauseConfig(overrides.autopause ?? data.autopause ?? {});

  if (!payload.code || !payload.chat_id || !payload.act) {
    await clearUserState(env, uid);
    await telegramSendMessage(
      env,
      message,
      'Сессия создания проекта повреждена. Начните заново с кнопки «➕ Новый проект».',
      { disable_reply: true },
    );
    throw new Error('project_creation_state_missing');
  }

  const project = createProjectDraft(payload);
  await saveProject(env, project);
  await clearUserState(env, uid);

  await telegramSendMessage(
    env,
    message,
    [
      '✅ Проект создан.',
      formatProjectSummary(project),
      '',
      'Расписание, KPI и алерты можно донастроить через карточку проекта.',
    ].join('\n'),
    { disable_reply: true },
  );

  return project;
}

async function renderProjectsPage(env, items, pagination = {}) {
  const textLines = ['<b>Проекты</b>', ''];

  let enriched = [];

  if (!items.length) {
    textLines.push('Проектов пока нет. Настройте их через мастер в админ-панели.');
  } else {
    enriched = await Promise.all(
      items.map(async (rawProject) => {
        const project = normalizeProject(rawProject);
        const chatRecord = project.chat_id
          ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
          : null;
        const accountMeta = project.act
          ? await loadAccountMeta(env, project.act.replace(/^act_/i, '') ?? project.act)
          : null;
        return { project, chatRecord, accountMeta };
      }),
    );

    enriched.forEach(({ project, chatRecord, accountMeta }, index) => {
      const codeLabel = project.code ? `#${escapeHtml(project.code)}` : 'без кода';
      const accountName = accountMeta?.name || project.act || '—';
      const chatLabel = project.chat_id
        ? formatChatReference(
            {
              chat_id: project.chat_id,
              thread_id: project.thread_id ?? 0,
              title: chatRecord?.title ?? null,
            },
            { withLink: true },
          )
        : 'нет привязки';
      const schedule = escapeHtml(project.times.join(', '));
      const chatTitle = chatRecord?.title || 'Проект';

      textLines.push(
        [
          `• <b>${escapeHtml(chatTitle)}</b> → ${escapeHtml(accountName)} (${codeLabel})`,
          `  чат: ${chatLabel}`,
          `  период: ${escapeHtml(project.period)} · ${schedule}`,
        ].join('\n'),
      );

      if (index !== enriched.length - 1) {
        textLines.push('');
      }
    });

    if (pagination.nextCursor) {
      textLines.push('');
      textLines.push('Показаны не все проекты. Нажмите «Далее», чтобы продолжить.');
    }
  }

  const keyboard = [];

  if (enriched.length) {
    enriched.forEach(({ project, chatRecord, accountMeta }) => {
      if (!project?.code) return;

      const accountLabel = accountMeta?.name || project.act || project.code;
      const chatTitle = chatRecord?.title || null;
      const parts = [];
      if (chatTitle) {
        parts.push(chatTitle);
      }
      parts.push(accountLabel);
      if (project.code) {
        parts.push(`#${project.code}`);
      }
      const label = `⚙️ ${parts.join(' → ')}`;

      keyboard.push([
        {
          text: label.length > 62 ? `${label.slice(0, 61)}…` : label,
          callback_data: `proj:detail:${project.code}`,
        },
      ]);
    });
  }
  if (pagination.nextCursor) {
    keyboard.push([
      { text: '➡️ Далее', callback_data: `panel:projects:next:${encodeURIComponent(pagination.nextCursor)}` },
    ]);
  }
  if (pagination.showReset) {
    keyboard.push([{ text: '↩️ В начало', callback_data: 'panel:projects:0' }]);
  }
  keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: textLines.join('\n'),
    reply_markup: { inline_keyboard: keyboard },
  };
}

async function telegramEditMessage(env, chatId, messageId, textContent, extra = {}) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: textContent,
    parse_mode: extra.parse_mode ?? 'HTML',
  };

  for (const [key, value] of Object.entries(extra)) {
    if (key === 'parse_mode') continue;
    if (typeof value === 'undefined') continue;
    payload[key] = value;
  }

  try {
    await telegramRequest(env, 'editMessageText', payload);
    return { ok: true };
  } catch (error) {
    console.error('telegramEditMessage error', error);
    return { ok: false, error: String(error) };
  }
}

async function handleAdminCommand(env, message) {
  const uid = message?.from?.id;
  if (!isAdmin(env, uid)) {
    return telegramSendMessage(env, message, 'Доступ запрещён. Добавьте ваш ID в ADMIN_IDS.');
  }

  const response = await buildAdminHome(env, uid);
  return telegramSendMessage(env, message, response.text, {
    reply_markup: response.reply_markup,
    disable_reply: true,
  });
}

async function handleCallbackQuery(env, callbackQuery) {
  const data = callbackQuery.data ?? '';
  const message = callbackQuery.message;
  const uid = callbackQuery.from?.id;

  if (!isAdmin(env, uid)) {
    await telegramAnswerCallback(env, callbackQuery, 'Нет доступа');
    return { ok: false, error: 'forbidden' };
  }

  await telegramAnswerCallback(env, callbackQuery, '…');

  if (!message?.chat?.id || !message.message_id) {
    return { ok: false, error: 'no_message_context' };
  }

  if (data === 'proj:create:start') {
    await saveUserState(env, uid, { mode: 'create_project', step: 'await_code', data: {} });
    return telegramEditMessage(
      env,
      message.chat.id,
      message.message_id,
      ['<b>Шаг 1.</b> Введите код проекта.', '', 'Отправьте текстом, например <code>th-client</code>.'].join('\n'),
      {
        reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'proj:create:cancel' }]] },
      },
    );
  }

  if (data === 'proj:create:cancel') {
    await clearUserState(env, uid);
    const home = await buildAdminHome(env, uid);
    return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
      reply_markup: home.reply_markup,
    });
  }

  if (data === 'proj:create:chatreset' || data.startsWith('proj:create:chatnext')) {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || state.step !== 'choose_chat') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    let cursor = null;
    if (data.startsWith('proj:create:chatnext:')) {
      cursor = decodeURIComponent(data.slice('proj:create:chatnext:'.length));
    }

    const chatsResult = await listRegisteredChats(env, cursor, DEFAULT_PAGE_SIZE);
    const prompt = buildChatSelectionPrompt(chatsResult.items, {
      nextCursor: chatsResult.cursor ?? null,
      showReset: Boolean(cursor),
    });

    return telegramEditMessage(env, message.chat.id, message.message_id, prompt.text, {
      reply_markup: prompt.reply_markup,
    });
  }

  if (data.startsWith('proj:create:chat:')) {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_chat', 'await_act'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const [, , , chatIdRaw, threadIdRaw = '0'] = data.split(':');
    const chatId = Number(chatIdRaw);
    const threadId = Number(threadIdRaw);

    if (!Number.isFinite(chatId)) {
      await telegramEditMessage(env, message.chat.id, message.message_id, 'Не удалось определить chat_id. Попробуйте снова.', {
        reply_markup: { inline_keyboard: [[{ text: '↩️ В панель', callback_data: 'panel:home' }]] },
      });
      return { ok: false, error: 'invalid_chat_id' };
    }

    let chatRecord = null;
    const kv = getPrimaryKv(env);
    if (kv) {
      try {
        const stored = await kv.get(getChatKey(chatId, threadId));
        if (stored) {
          chatRecord = JSON.parse(stored);
        }
      } catch (error) {
        console.error('parse chat record error', error);
      }
    }

    await saveUserState(env, uid, {
      mode: 'create_project',
      step: 'await_act',
      data: {
        ...(state.data ?? {}),
        chat_id: chatId,
        thread_id: threadId,
        chat_title: chatRecord?.title ?? null,
        chat_thread_name: chatRecord?.thread_name ?? null,
      },
    });

    const selectedLine = formatChatLine({
      chat_id: chatId,
      thread_id: threadId,
      title: chatRecord?.title ?? null,
    });

    await telegramEditMessage(
      env,
      message.chat.id,
      message.message_id,
      [
        'Чат выбран.',
        selectedLine,
        '',
        'Шаг 3. Введите рекламный аккаунт (например, act_1234567890).',
      ].join('\n'),
      {
        reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: 'proj:create:cancel' }]] },
      },
    );

    return { ok: true };
  }

  if (data === 'proj:create:period:back') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, {
      mode: 'create_project',
      step: 'choose_period',
      data: payload,
    });

    const view = buildProjectPeriodPrompt();
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:schedule:back') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, {
      mode: 'create_project',
      step: 'choose_schedule',
      data: payload,
    });

    const view = buildProjectSchedulePrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:create:period:')) {
    const [, , , value] = data.split(':');
    if (!value || value === 'back') {
      const view = buildProjectPeriodPrompt();
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_period', 'choose_schedule'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = {
      ...(state.data ?? {}),
      period: PERIOD_OPTIONS.some((option) => option.value === value) ? value : 'yesterday',
    };

    await saveUserState(env, uid, {
      mode: 'create_project',
      step: 'choose_schedule',
      data: payload,
    });

    const view = buildProjectSchedulePrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:create:schedule:')) {
    const state = await loadUserState(env, uid);
    if (
      !state ||
      state.mode !== 'create_project' ||
      !['choose_schedule', 'await_times_manual', 'choose_billing'].includes(state.step)
    ) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const [, , , action, arg] = data.split(':');
    const baseData = { ...(state.data ?? {}) };

    if (action === 'manual') {
      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'await_times_manual',
        data: baseData,
      });

      return telegramEditMessage(
        env,
        message.chat.id,
        message.message_id,
        [
          'Введите время через запятую или пробелы: например, <code>09:30, 13:00, 19:00</code>.',
          'Тихие выходные можно настроить позже в карточке проекта.',
        ].join('\n'),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '← Назад', callback_data: 'proj:create:period:back' }],
              [{ text: 'Отмена', callback_data: 'proj:create:cancel' }],
            ],
          },
        },
      );
    }

    if (action === 'preset') {
      const preset = PROJECT_SCHEDULE_PRESETS[arg];
      if (!preset) {
        const fallback = buildProjectSchedulePrompt(baseData);
        return telegramEditMessage(env, message.chat.id, message.message_id, 'Неизвестный пресет расписания. Выберите другой вариант.', {
          reply_markup: fallback.reply_markup,
        });
      }

      const updated = {
        ...baseData,
        times: sortUniqueTimes(preset.times),
        mute_weekends: Boolean(preset.mute_weekends),
      };

      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'choose_billing',
        data: updated,
      });

      const billingView = buildProjectBillingPrompt(updated);
      return telegramEditMessage(env, message.chat.id, message.message_id, billingView.text, {
        reply_markup: billingView.reply_markup,
      });
    }

    const scheduleView = buildProjectSchedulePrompt(baseData);
    return telegramEditMessage(env, message.chat.id, message.message_id, scheduleView.text, {
      reply_markup: scheduleView.reply_markup,
    });
  }

  if (data.startsWith('proj:create:billing:')) {
    const state = await loadUserState(env, uid);
    if (
      !state ||
      state.mode !== 'create_project' ||
      !['choose_billing', 'await_billing_manual', 'choose_kpi'].includes(state.step)
    ) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const [, , , action, arg] = data.split(':');
    const payload = { ...(state.data ?? {}) };

    if (action === 'status') {
      payload.billing = arg === 'paused' ? 'paused' : 'paid';
      await saveUserState(env, uid, { mode: 'create_project', step: 'choose_billing', data: payload });
      const view = buildProjectBillingPrompt(payload);
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'paidtoday') {
      const tz = env.DEFAULT_TZ || 'UTC';
      const today = getTodayYmd(tz);
      payload.billing = 'paid';
      payload.billing_paid_at = today;
      payload.billing_next_at = addMonthsToYmd(today) || today;
      await saveUserState(env, uid, { mode: 'create_project', step: 'choose_billing', data: payload });
      const view = buildProjectBillingPrompt(payload);
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'manual') {
      await saveUserState(env, uid, {
        mode: 'create_project',
        step: 'await_billing_manual',
        data: payload,
      });

      const view = buildProjectBillingPrompt(payload, { awaitingManual: true });
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'clear') {
      payload.billing_paid_at = null;
      payload.billing_next_at = null;
      await saveUserState(env, uid, { mode: 'create_project', step: 'choose_billing', data: payload });
      const view = buildProjectBillingPrompt(payload);
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'back') {
      await saveUserState(env, uid, { mode: 'create_project', step: 'choose_schedule', data: payload });
      const view = buildProjectSchedulePrompt(payload);
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    const view = buildProjectBillingPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:kpi:start') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_billing', 'choose_kpi'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_kpi', data: payload });
    const view = buildProjectKpiSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:create:kpi:set:')) {
    const [, , , , field] = data.split(':');
    const allowed = ['cpl', 'leads_per_day', 'daily_budget'];
    if (!allowed.includes(field)) {
      await telegramAnswerCallback(env, callbackQuery, 'Неизвестное поле KPI.');
      return { ok: false, error: 'invalid_kpi_field' };
    }

    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_kpi', 'await_kpi_field'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, {
      mode: 'create_project',
      step: 'await_kpi_field',
      field,
      data: payload,
    });

    const view = buildProjectKpiSetupPrompt(payload, { awaitingField: field });
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:kpi:clear') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || state.step !== 'choose_kpi') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    payload.kpi = { cpl: null, leads_per_day: null, daily_budget: null };
    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_kpi', data: payload });

    const view = buildProjectKpiSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:kpi:back') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_billing', data: payload });
    const view = buildProjectBillingPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:alerts:start') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_kpi', 'choose_alerts'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_alerts', data: payload });
    const view = buildProjectAlertsSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:create:alerts:')) {
    const [, , , action, arg] = data.split(':');
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_alerts'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    payload.alerts = payload.alerts ? cloneAlertConfig(payload.alerts) : cloneAlertConfig(ALERT_DEFAULT_CONFIG);

    if (action === 'toggle') {
      payload.alerts.enabled = payload.alerts.enabled === false;
    } else if (action === 'preset') {
      if (arg === 'default') {
        payload.alerts = cloneAlertConfig(ALERT_DEFAULT_CONFIG);
      } else if (arg === 'minimal') {
        payload.alerts = cloneAlertConfig(ALERT_MINIMAL_CONFIG);
      }
    } else if (action === 'zero') {
      if (arg === 'off') {
        payload.alerts.no_spend_by = null;
      } else if (arg === 'on') {
        payload.alerts.no_spend_by = '12:00';
      }
    } else if (action === 'reset') {
      payload.alerts = cloneAlertConfig(ALERT_DEFAULT_CONFIG);
    }

    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_alerts', data: payload });

    const view = buildProjectAlertsSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:automation:start') {
    const state = await loadUserState(env, uid);
    if (
      !state ||
      state.mode !== 'create_project' ||
      !['choose_alerts', 'choose_automation', 'await_autopause_manual'].includes(state.step)
    ) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    payload.active = payload.active !== false;
    payload.weekly = cloneWeeklyConfig(payload.weekly);
    payload.autopause = cloneAutopauseConfig(payload.autopause);

    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_automation', data: payload });

    const view = buildProjectAutomationSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:automation:back') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || !['choose_alerts', 'choose_automation'].includes(state.step)) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_alerts', data: payload });
    const view = buildProjectAlertsSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:create:automation:')) {
    const [, , , group, action = '', arg] = data.split(':');
    const state = await loadUserState(env, uid);
    if (
      !state ||
      state.mode !== 'create_project' ||
      !['choose_automation', 'await_autopause_manual'].includes(state.step)
    ) {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    const payload = { ...(state.data ?? {}) };
    payload.active = payload.active !== false;
    payload.weekly = cloneWeeklyConfig(payload.weekly);
    payload.autopause = cloneAutopauseConfig(payload.autopause);

    if (group === 'active') {
      payload.active = !payload.active;
    } else if (group === 'weekly') {
      if (action === 'toggle') {
        payload.weekly.enabled = !payload.weekly.enabled;
      } else if (action === 'mode') {
        payload.weekly.mode = payload.weekly.mode === 'week_yesterday' ? 'week_today' : 'week_yesterday';
      }
    } else if (group === 'autopause') {
      if (action === 'toggle') {
        payload.autopause.enabled = !payload.autopause.enabled;
      } else if (action === 'set') {
        const days = normalizeAutopauseDays(Number(arg));
        payload.autopause.enabled = true;
        payload.autopause.days = days;
      } else if (action === 'manual') {
        await saveUserState(env, uid, {
          mode: 'create_project',
          step: 'await_autopause_manual',
          data: payload,
        });
        const view = buildProjectAutomationSetupPrompt(payload, { awaitingAutopause: true });
        return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
          reply_markup: view.reply_markup,
        });
      } else if (action === 'reset') {
        payload.autopause = cloneAutopauseConfig();
      }
    }

    await saveUserState(env, uid, { mode: 'create_project', step: 'choose_automation', data: payload });

    const view = buildProjectAutomationSetupPrompt(payload);
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data === 'proj:create:finish') {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project') {
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }

    try {
      const project = await completeProjectCreation(env, uid, message, state.data ?? {});
      return telegramEditMessage(
        env,
        message.chat.id,
        message.message_id,
        [
          'Проект создан и сохранён.',
          `Код: <b>#${escapeHtml(project.code)}</b> → период ${escapeHtml(project.period)}.`,
          'Сводка отправлена в чат. Вернитесь в панель для дальнейшей настройки.',
        ].join('\n'),
        {
          reply_markup: {
            inline_keyboard: [[{ text: '↩️ В панель', callback_data: 'panel:home' }]],
          },
        },
      );
    } catch (error) {
      console.error('completeProjectCreation wizard finish error', error);
      const home = await buildAdminHome(env, uid);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }
  }

  if (data === 'panel:home') {
    const response = await buildAdminHome(env, uid);
    return telegramEditMessage(env, message.chat.id, message.message_id, response.text, {
      reply_markup: response.reply_markup,
    });
  }

  if (data.startsWith('panel:accounts')) {
    const parts = data.split(':');
    const action = parts[2] ?? '0';

    if (action === 'rescan') {
      const profile = await loadUserProfile(env, uid);
      if (!profile?.fb_long_token) {
        await telegramAnswerCallback(env, callbackQuery, 'Сначала подключите Meta.');
      } else {
        const result = await syncUserAdAccounts(env, uid, profile.fb_long_token);
        const note = result.ok
          ? `Готово. Найдено ${result.count} аккаунтов.`
          : `Ошибка: ${result.error || 'не удалось обновить список'}.`;
        await telegramAnswerCallback(env, callbackQuery, note);
      }

      const profileAfter = await loadUserProfile(env, uid);
      const accounts = await loadUserAccounts(env, uid);
      const view = await renderAccountsPage(env, uid, profileAfter, accounts, { offset: 0 });
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'projects' && typeof parts[3] === 'string') {
      const accountId = decodeURIComponent(parts[3]);
      const projects = await collectProjectsForAccount(env, accountId);
      const view = renderAccountProjectsList(env, accountId, projects);
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    if (action === 'noop') {
      await telegramAnswerCallback(env, callbackQuery, 'Нет действий для этого аккаунта.');
      return { ok: true };
    }

    let offset = 0;
    if (action === 'page' && typeof parts[3] === 'string') {
      offset = Math.max(0, Number(parts[3]) || 0);
    }

    const profileCurrent = await loadUserProfile(env, uid);
    const accountsCurrent = await loadUserAccounts(env, uid);
    const view = await renderAccountsPage(env, uid, profileCurrent, accountsCurrent, { offset });
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('panel:chats')) {
    const [, , action = '0', cursorParam] = data.split(':');
    let cursor;

    if (action === 'next' && typeof cursorParam === 'string') {
      cursor = decodeURIComponent(cursorParam);
    }

    const result = await listRegisteredChats(env, cursor, DEFAULT_PAGE_SIZE);

    const pagination = {
      nextCursor: result.cursor ?? null,
      showReset: Boolean(cursor),
    };

    const response = renderChatsPage(result.items, pagination);
    return telegramEditMessage(env, message.chat.id, message.message_id, response.text, {
      reply_markup: response.reply_markup,
    });
  }

  if (data.startsWith('panel:projects')) {
    const [, , action = '0', cursorParam] = data.split(':');
    let cursor;

    if (action === 'next' && typeof cursorParam === 'string') {
      cursor = decodeURIComponent(cursorParam);
    }

    const result = await listProjects(env, cursor, DEFAULT_PAGE_SIZE);

    const pagination = {
      nextCursor: result.cursor ?? null,
      showReset: Boolean(cursor),
    };

    const response = await renderProjectsPage(env, result.items, pagination);
    return telegramEditMessage(env, message.chat.id, message.message_id, response.text, {
      reply_markup: response.reply_markup,
    });
  }

  if (data.startsWith('proj:detail:toggle_active:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const updated = await mutateProject(env, code, (project) => {
      project.active = !project.active;
    });

    if (!updated) {
      return editMessageWithProject(env, message, code);
    }

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:detail:toggle_billing:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.billing = project.billing === 'paused' ? 'paid' : 'paused';
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:detail:toggle_mute:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.mute_weekends = !project.mute_weekends;
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:detail:weekly_toggle:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.weekly = project.weekly || {};
      project.weekly.enabled = project.weekly.enabled === false;
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:detail:weekly_mode:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.weekly = project.weekly || {};
      project.weekly.mode = project.weekly.mode === 'week_today' ? 'week_yesterday' : 'week_today';
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:detail:autopause_toggle:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingAutopauseState(env, uid, code);
    await mutateProject(env, code, (project) => {
      project.autopause = project.autopause || {};
      project.autopause.enabled = !project.autopause.enabled;
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:autopause:prompt:')) {
    const [, , , rawCode = '', mode = 'pause'] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    if (!Array.isArray(project.campaigns) || project.campaigns.length === 0) {
      await telegramAnswerCallback(env, callbackQuery, 'Нет выбранных кампаний. Откройте раздел «Кампании».');
      return { ok: false, error: 'no_campaigns' };
    }

    const prompt = renderAutopausePrompt(project, mode === 'resume' ? 'resume' : 'pause');
    return telegramEditMessage(env, message.chat.id, message.message_id, prompt.text, {
      reply_markup: prompt.reply_markup,
    });
  }

  if (data.startsWith('proj:autopause:execute:')) {
    const [, , , rawCode = '', mode = 'pause'] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      const targetMessage = callbackQuery.message ?? { chat: { id: callbackQuery.from?.id } };
      await telegramSendMessage(env, targetMessage, 'Проект не найден. Обновите список проектов.', {
        disable_reply: true,
      });
      return { ok: false, error: 'project_not_found' };
    }

    if (!Array.isArray(project.campaigns) || project.campaigns.length === 0) {
      const targetMessage = callbackQuery.message ?? { chat: { id: callbackQuery.from?.id } };
      await telegramSendMessage(env, targetMessage, 'В проекте не выбраны кампании.', {
        disable_reply: true,
      });
      return { ok: false, error: 'no_campaigns' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      const targetMessage = callbackQuery.message ?? { chat: { id: callbackQuery.from?.id } };
      await telegramSendMessage(env, targetMessage, 'Meta-токен не найден. Подключите Meta и попробуйте снова.', {
        disable_reply: true,
      });
      return { ok: false, error: 'token_missing' };
    }

    await telegramAnswerCallback(env, callbackQuery, '⏳ Выполняю действие…');

    let summary = '';
    try {
      if (mode === 'resume') {
        const result = await resumeProjectCampaigns(env, project, { token });
        summary = formatResumeSummary(project, result);
      } else {
        const result = await pauseProjectCampaigns(env, project, { token });
        summary = formatPauseSummary(project, result);
      }
    } catch (error) {
      console.error('autopause execute error', project.code, error);
      summary = `Не удалось выполнить действие: ${escapeHtml(error?.message ?? String(error))}`;
    }

    const targetMessage = callbackQuery.message ?? { chat: { id: callbackQuery.from?.id } };
    await telegramSendMessage(env, targetMessage, summary, {
      disable_reply: true,
    });

    return editMessageWithProject(env, message, code);
  }

  if (data.startsWith('proj:campaigns:manage:')) {
    const [, , , rawCode = '', campaignId = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramAnswerCallback(env, callbackQuery, 'Meta-токен не найден.');
      return { ok: false, error: 'token_missing' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';
    const [campaignMeta, performance, adsets] = await Promise.all([
      fetchCampaignMeta(env, campaignId, token),
      fetchCampaignPerformance(env, project, campaignId, token, timezone),
      fetchAdsetsForCampaignDetails(env, campaignId, token),
    ]);
    const currency = await resolveProjectCurrency(env, project, editMessageWithCampaignEditor.currencyCache);
    const view = renderCampaignManager(project, campaignMeta ?? { id: campaignId }, performance, adsets, {
      currency,
      timezone,
    });
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:campaigns:action:')) {
    const [, , , rawCode = '', campaignId = '', action = '', arg = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramAnswerCallback(env, callbackQuery, 'Meta-токен не найден.');
      return { ok: false, error: 'token_missing' };
    }

    await telegramAnswerCallback(env, callbackQuery, '⏳ Выполняю действие…');

    let messageText = '';
    const timezone = env.DEFAULT_TZ || 'UTC';

    try {
      if (action === 'pause' || action === 'resume') {
        const desired = action === 'pause' ? 'PAUSED' : 'ACTIVE';
        const result = await toggleEntityStatus(token, campaignId, desired);
        if (result.ok) {
          messageText = `Кампания ${action === 'pause' ? 'приостановлена' : 'включена'}.`;
        } else {
          messageText = `Не удалось обновить кампанию: ${escapeHtml(result.error || 'ошибка API')}`;
        }
      } else if (action === 'budget') {
        const percent = Number(arg);
        const adsets = await fetchAdsetsForCampaignDetails(env, campaignId, token);
        const result = await adjustAdsetBudgets(env, adsets, { token, percent });
        messageText = `💰 Обновлено адсетов: ${result.ok.length}. Ошибки: ${result.failed.length}.`;
      } else if (action === 'extend') {
        const days = Number(arg);
        const adsets = await fetchAdsetsForCampaignDetails(env, campaignId, token);
        const result = await extendAdsetSchedules(env, adsets, { token, days });
        messageText = `📆 Продлено адсетов: ${result.ok.length}. Ошибки: ${result.failed.length}.`;
      }
    } catch (error) {
      console.error('proj:campaigns:action error', campaignId, error);
      messageText = `Ошибка выполнения: ${escapeHtml(error?.message ?? String(error))}`;
    }

    if (messageText) {
      const targetMessage = callbackQuery.message ?? { chat: { id: callbackQuery.from?.id } };
      await telegramSendMessage(env, targetMessage, messageText, { disable_reply: true });
    }

    const [campaignMeta, performance, adsets] = await Promise.all([
      fetchCampaignMeta(env, campaignId, token),
      fetchCampaignPerformance(env, project, campaignId, token, timezone),
      fetchAdsetsForCampaignDetails(env, campaignId, token),
    ]);
    const currency = await resolveProjectCurrency(env, project, editMessageWithCampaignEditor.currencyCache);
    const view = renderCampaignManager(project, campaignMeta ?? { id: campaignId }, performance, adsets, {
      currency,
      timezone,
    });
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:campaigns:ads:')) {
    const [, , , rawCode = '', campaignId = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramAnswerCallback(env, callbackQuery, 'Meta-токен не найден.');
      return { ok: false, error: 'token_missing' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';
    const range = getPeriodRange('last_7d', timezone);
    const [campaignMeta, ads] = await Promise.all([
      fetchCampaignMeta(env, campaignId, token),
      fetchAdsForCampaign(env, campaignId, token, range),
    ]);
    const currency = await resolveProjectCurrency(env, project, editMessageWithCampaignEditor.currencyCache);
    const view = renderCampaignAdsView(project, campaignMeta ?? { id: campaignId }, ads, { currency });
    return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
      reply_markup: view.reply_markup,
    });
  }

  if (data.startsWith('proj:adsets:toggle:')) {
    const [, , , rawCode = '', campaignId = '', adsetId = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramAnswerCallback(env, callbackQuery, 'Meta-токен не найден.');
      return { ok: false, error: 'token_missing' };
    }

    try {
      const meta = await graphGet(adsetId, { token, params: { fields: 'status,effective_status' } });
      const current = meta?.effective_status || meta?.status || 'PAUSED';
      const desired = String(current).toUpperCase().includes('ACTIVE') ? 'PAUSED' : 'ACTIVE';
      const result = await toggleEntityStatus(token, adsetId, desired);
      await telegramAnswerCallback(
        env,
        callbackQuery,
        result.ok ? `Адсет ${desired === 'PAUSED' ? 'поставлен на паузу' : 'включён'}.` : result.error || 'Не удалось обновить адсет',
      );
    } catch (error) {
      console.error('proj:adsets:toggle error', adsetId, error);
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить адсет.');
    }

    // перерисуем управление кампанией
    const project = await loadProject(env, code);
    if (project) {
      const timezone = env.DEFAULT_TZ || 'UTC';
      const [campaignMeta, performance, adsets] = await Promise.all([
        fetchCampaignMeta(env, campaignId, token),
        fetchCampaignPerformance(env, project, campaignId, token, timezone),
        fetchAdsetsForCampaignDetails(env, campaignId, token),
      ]);
      const currency = await resolveProjectCurrency(env, project, editMessageWithCampaignEditor.currencyCache);
      const view = renderCampaignManager(project, campaignMeta ?? { id: campaignId }, performance, adsets, {
        currency,
        timezone,
      });
      await telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    return { ok: true };
  }

  if (data.startsWith('proj:ads:toggle:')) {
    const [, , , rawCode = '', campaignId = '', adId = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramAnswerCallback(env, callbackQuery, 'Meta-токен не найден.');
      return { ok: false, error: 'token_missing' };
    }

    try {
      const meta = await graphGet(adId, { token, params: { fields: 'status,effective_status' } });
      const current = meta?.effective_status || meta?.status || 'PAUSED';
      const desired = String(current).toUpperCase().includes('ACTIVE') ? 'PAUSED' : 'ACTIVE';
      const result = await toggleEntityStatus(token, adId, desired);
      await telegramAnswerCallback(
        env,
        callbackQuery,
        result.ok ? `Объявление ${desired === 'PAUSED' ? 'поставлено на паузу' : 'включено'}.` : result.error || 'Не удалось обновить объявление',
      );
    } catch (error) {
      console.error('proj:ads:toggle error', adId, error);
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить объявление.');
    }

    const project = await loadProject(env, code);
    if (project) {
      const timezone = env.DEFAULT_TZ || 'UTC';
      const range = getPeriodRange('last_7d', timezone);
      const [campaignMeta, ads] = await Promise.all([
        fetchCampaignMeta(env, campaignId, token),
        fetchAdsForCampaign(env, campaignId, token, range),
      ]);
      const currency = await resolveProjectCurrency(env, project, editMessageWithCampaignEditor.currencyCache);
      const view = renderCampaignAdsView(project, campaignMeta ?? { id: campaignId }, ads, { currency });
      await telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    return { ok: true };
  }

  if (data.startsWith('proj:autopause:open:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingAutopauseState(env, uid, code);
    return editMessageWithAutopause(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:autopause:toggle:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.autopause = project.autopause || { enabled: false, days: 3 };
      project.autopause.enabled = !project.autopause.enabled;
      if (!Number.isFinite(project.autopause.days)) {
        project.autopause.days = 3;
      }
    });

    await clearPendingAutopauseState(env, uid, code);
    return editMessageWithAutopause(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:autopause:set:')) {
    const [, , , rawCode = '', daysRaw = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const days = Number(daysRaw);
    if (!isValidProjectCode(code) || !Number.isFinite(days)) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить порог.');
      return { ok: false, error: 'invalid_autopause_payload' };
    }

    const normalized = Math.min(AUTOPAUSE_MAX_DAYS, Math.max(1, Math.round(days)));
    await mutateProject(env, code, (project) => {
      project.autopause = project.autopause || { enabled: false, days: 3 };
      project.autopause.enabled = true;
      project.autopause.days = normalized;
    });

    await clearPendingAutopauseState(env, uid, code);
    return editMessageWithAutopause(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:autopause:reset:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.autopause = project.autopause || {};
      project.autopause.days = 3;
      if (!('enabled' in project.autopause)) {
        project.autopause.enabled = false;
      }
    });

    await clearPendingAutopauseState(env, uid, code);
    return editMessageWithAutopause(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:autopause:custom:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_autopause',
      step: 'await_days',
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithAutopause(env, message, code, { awaitingDays: true });
  }

  if (data.startsWith('proj:autopause:cancel:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    await clearPendingAutopauseState(env, uid, code);
    return editMessageWithAutopause(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:alerts:open:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:toggle:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.alerts = project.alerts || {};
      const current = project.alerts.enabled !== false;
      project.alerts.enabled = !current;
      project.alerts.billing_times = sortUniqueTimes(project.alerts.billing_times || ALERT_BILLING_DEFAULT_TIMES);
      if (!('no_spend_by' in project.alerts)) {
        project.alerts.no_spend_by = '12:00';
      }
    });

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:time:')) {
    const [, , , rawCode = '', timeRaw = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const normalizedTime = normalizeTimeString(timeRaw.replace('-', ':'));
    if (!isValidProjectCode(code) || !normalizedTime) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить время.');
      return { ok: false, error: 'invalid_alert_time' };
    }

    await mutateProject(env, code, (project) => {
      project.alerts = project.alerts || {};
      const list = sortUniqueTimes(project.alerts.billing_times || []);
      if (list.includes(normalizedTime)) {
        project.alerts.billing_times = list.filter((value) => value !== normalizedTime);
      } else {
        project.alerts.billing_times = sortUniqueTimes([...list, normalizedTime]);
      }
    });

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:del:')) {
    const [, , , rawCode = '', timeRaw = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const normalizedTime = normalizeTimeString(timeRaw.replace('-', ':'));
    if (!isValidProjectCode(code) || !normalizedTime) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось удалить время.');
      return { ok: false, error: 'invalid_alert_time' };
    }

    await mutateProject(env, code, (project) => {
      project.alerts = project.alerts || {};
      const list = sortUniqueTimes(project.alerts.billing_times || []);
      project.alerts.billing_times = list.filter((value) => value !== normalizedTime);
    });

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:reset:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.alerts = project.alerts || {};
      project.alerts.billing_times = sortUniqueTimes(ALERT_BILLING_DEFAULT_TIMES);
      if (!('no_spend_by' in project.alerts)) {
        project.alerts.no_spend_by = '12:00';
      }
    });

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:custom:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_alerts',
      step: 'await_billing',
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithAlerts(env, message, code, { awaitingBilling: true });
  }

  if (data.startsWith('proj:alerts:zero:')) {
    const parts = data.split(':');
    const rawCode = parts[3] ?? '';
    const valueRaw = parts[4] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    if (valueRaw === 'custom') {
      await saveUserState(env, uid, {
        mode: 'edit_alerts',
        step: 'await_zero',
        code,
        message_chat_id: message.chat.id,
        message_id: message.message_id,
      });

      return editMessageWithAlerts(env, message, code, { awaitingZero: true });
    }

    if (valueRaw === 'off') {
      await mutateProject(env, code, (project) => {
        project.alerts = project.alerts || {};
        project.alerts.no_spend_by = null;
      });

      await clearPendingAlertsState(env, uid, code);
      return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
    }

    if (valueRaw === 'reset') {
      await mutateProject(env, code, (project) => {
        project.alerts = project.alerts || {};
        project.alerts.no_spend_by = '12:00';
      });

      await clearPendingAlertsState(env, uid, code);
      return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
    }

    const normalizedTime = normalizeTimeString(valueRaw.replace('-', ':'));
    if (!normalizedTime) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить zero-spend.');
      return { ok: false, error: 'invalid_zero_time' };
    }

    await mutateProject(env, code, (project) => {
      project.alerts = project.alerts || {};
      project.alerts.no_spend_by = normalizedTime;
    });

    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:alerts:cancel:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    await clearPendingAlertsState(env, uid, code);
    return editMessageWithAlerts(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:schedule:open:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramEditMessage(env, message.chat.id, message.message_id, 'Код проекта не распознан.', {
        reply_markup: { inline_keyboard: [[{ text: '← В панель', callback_data: 'panel:home' }]] },
      });
      return { ok: false, error: 'invalid_project_code' };
    }

    return editMessageWithSchedule(env, message, code);
  }

  if (data.startsWith('proj:schedule:addcustom:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_schedule',
      step: 'await_time',
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithSchedule(env, message, code, { awaitingTime: true });
  }

  if (data.startsWith('proj:schedule:cancel:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    await clearUserState(env, uid);
    return editMessageWithSchedule(env, message, code);
  }

  if (data.startsWith('proj:schedule:add:')) {
    const [, , , rawCode = '', timeRaw = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const normalizedTime = normalizeTimeString(timeRaw.replace('-', ':'));
    if (!isValidProjectCode(code) || !normalizedTime) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось добавить время.');
      return { ok: false, error: 'invalid_payload' };
    }

    await mutateProject(env, code, (project) => {
      project.times = sortUniqueTimes([...project.times, normalizedTime]);
    });

    await clearPendingScheduleState(env, uid, code);
    return editMessageWithSchedule(env, message, code);
  }

  if (data.startsWith('proj:schedule:del:')) {
    const [, , , rawCode = '', timeRaw = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const normalizedTime = normalizeTimeString(timeRaw.replace('-', ':'));
    if (!isValidProjectCode(code) || !normalizedTime) {
      await telegramAnswerCallback(env, callbackQuery, 'Не удалось удалить время.');
      return { ok: false, error: 'invalid_payload' };
    }

    await mutateProject(env, code, (project) => {
      project.times = sortUniqueTimes(project.times.filter((value) => value !== normalizedTime));
    });

    await clearPendingScheduleState(env, uid, code);
    return editMessageWithSchedule(env, message, code);
  }

  if (data.startsWith('proj:schedule:period:')) {
    const [, , , rawCode = '', periodValue = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value));
    if (!allowed.has(periodValue)) {
      await telegramAnswerCallback(env, callbackQuery, 'Период не поддерживается.');
      return { ok: false, error: 'invalid_period' };
    }

    await mutateProject(env, code, (project) => {
      project.period = periodValue;
    });

    await clearPendingScheduleState(env, uid, code);
    return editMessageWithSchedule(env, message, code);
  }

  if (data.startsWith('proj:schedule:togglemute:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.mute_weekends = !project.mute_weekends;
    });

    return editMessageWithSchedule(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:billing:open:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingBillingState(env, uid, code);
    return editMessageWithBilling(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:billing:today:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const tz = env.DEFAULT_TZ || 'UTC';
    const paidYmd = getTodayYmd(tz);
    const nextYmd = addMonthsToYmd(paidYmd) || paidYmd;

    await mutateProject(env, code, (project) => {
      project.billing_paid_at = paidYmd;
      project.billing_next_at = nextYmd;
    });

    await clearPendingBillingState(env, uid, code);
    await telegramAnswerCallback(env, callbackQuery, 'Оплата зафиксирована.');
    return editMessageWithBilling(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:billing:manual:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_billing',
      step: 'await_paid',
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithBilling(env, message, code, { awaitingPaid: true });
  }

  if (data.startsWith('proj:billing:next:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_billing',
      step: 'await_next',
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithBilling(env, message, code, { awaitingNext: true });
  }

  if (data.startsWith('proj:billing:clear:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await mutateProject(env, code, (project) => {
      project.billing_paid_at = null;
      project.billing_next_at = null;
    });

    await clearPendingBillingState(env, uid, code);
    await telegramAnswerCallback(env, callbackQuery, 'Даты оплаты очищены.');
    return editMessageWithBilling(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:billing:cancel:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    await clearPendingBillingState(env, uid, code);
    return editMessageWithBilling(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:kpi:open:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingKpiState(env, uid, code);
    return editMessageWithKpi(env, message, code, { preserveAwait: true, uid });
  }

  if (data.startsWith('proj:kpi:set:')) {
    const [, , , field = '', rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    const allowed = ['cpl', 'leads_per_day', 'daily_budget'];
    if (!isValidProjectCode(code) || !allowed.includes(field)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта или поле KPI не распознаны.');
      return { ok: false, error: 'invalid_kpi_field' };
    }

    await saveUserState(env, uid, {
      mode: 'edit_kpi',
      step: 'await_value',
      field,
      code,
      message_chat_id: message.chat.id,
      message_id: message.message_id,
    });

    return editMessageWithKpi(env, message, code, { awaitingField: field });
  }

  if (data.startsWith('proj:kpi:cancel:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingKpiState(env, uid, code);
    return editMessageWithKpi(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:kpi:reset:')) {
    const [, , , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    await clearPendingKpiState(env, uid, code);
    await mutateProject(env, code, (project) => {
      project.kpi = { cpl: null, leads_per_day: null, daily_budget: null };
    });

    return editMessageWithKpi(env, message, code, { preserveAwait: false });
  }

  if (data.startsWith('proj:report:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';
    const project = await loadProject(env, code);
    if (!project) {
      await telegramSendMessage(env, message, `Проект <b>#${escapeHtml(code)}</b> не найден. Обновите список проектов.`, {
        disable_reply: true,
      });
      return { ok: false, error: 'project_not_found' };
    }

    const ensureState = async (patch = {}) => {
      const current = await loadUserState(env, uid);
      const merged = createReportState(project, {
        ...(current?.mode === 'report_options' && current.code === code ? current : {}),
        ...patch,
        message_chat_id: message.chat.id,
        message_id: message.message_id,
      });
      await saveUserState(env, uid, merged);
      return merged;
    };

    if (action === 'open') {
      await ensureState({ step: 'menu' });
      return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
    }

    if (action === 'period') {
      const periodValue = parts[4] ?? '';
      const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value));
      if (!allowed.has(periodValue)) {
        await telegramAnswerCallback(env, callbackQuery, 'Период не поддерживается.');
        return { ok: false, error: 'invalid_period' };
      }

      await ensureState({ period: periodValue, step: 'menu' });
      await telegramAnswerCallback(env, callbackQuery, 'Период обновлён.');
      return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
    }

    if (action === 'min') {
      const operation = parts[4] ?? '';
      if (operation === 'set') {
        await ensureState({ step: 'await_min_spend' });
        await telegramAnswerCallback(env, callbackQuery, 'Введите значение сообщением.');
        return editMessageWithReportOptions(env, message, code, {
          awaitingMinSpend: true,
          preserveAwait: true,
          uid,
          timezone,
        });
      }

      if (operation === 'clear') {
        await ensureState({ minSpend: null, step: 'menu' });
        await telegramAnswerCallback(env, callbackQuery, 'Фильтр по расходу очищен.');
        return editMessageWithReportOptions(env, message, code, {
          preserveAwait: true,
          uid,
          timezone,
        });
      }

      if (operation === 'cancel') {
        await ensureState({ step: 'menu' });
        await telegramAnswerCallback(env, callbackQuery, 'Ввод отменён.');
        return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
      }

      await telegramAnswerCallback(env, callbackQuery, 'Действие не поддерживается.');
      return { ok: false, error: 'unknown_report_min_action' };
    }

    if (action === 'preset') {
      const operation = parts[4] ?? '';

      if (operation === 'save') {
        await ensureState({ step: 'await_preset_name' });
        await telegramAnswerCallback(env, callbackQuery, 'Отправьте название пресета сообщением.');
        return editMessageWithReportOptions(env, message, code, {
          preserveAwait: true,
          awaitingPresetName: true,
          uid,
          timezone,
        });
      }

      if (operation === 'cancel') {
        await ensureState({ step: 'menu' });
        await telegramAnswerCallback(env, callbackQuery, 'Сохранение пресета отменено.');
        return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
      }

      if (operation === 'list') {
        await ensureState({ step: 'preset_menu' });
        const presets = await loadReportPresets(env, uid);
        await telegramAnswerCallback(env, callbackQuery, 'Список пресетов.');
        return editMessageWithReportPresetMenu(env, message, code, {
          presets,
          uid,
          timezone,
        });
      }

      if (operation === 'apply') {
        const presetId = parts[5] ?? '';
        const presets = await loadReportPresets(env, uid);
        const preset = presets.find((entry) => entry.id === presetId);
        if (!preset) {
          await telegramAnswerCallback(env, callbackQuery, 'Пресет не найден.');
          return { ok: false, error: 'report_preset_missing' };
        }

        await ensureState({
          period: preset.period,
          minSpend: preset.minSpend,
          onlyPositive: preset.onlyPositive,
          step: 'menu',
        });
        await telegramAnswerCallback(env, callbackQuery, `Пресет «${preset.name}» применён.`);
        return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
      }

      if (operation === 'delete') {
        const presetId = parts[5] ?? '';
        const removed = await deleteReportPreset(env, uid, presetId);
        const presets = await loadReportPresets(env, uid);
        await ensureState({ step: 'preset_menu' });
        await telegramAnswerCallback(env, callbackQuery, removed ? 'Пресет удалён.' : 'Пресет не найден.');
        return editMessageWithReportPresetMenu(env, message, code, {
          presets,
          uid,
          timezone,
        });
      }

      await telegramAnswerCallback(env, callbackQuery, 'Действие с пресетом не поддерживается.');
      return { ok: false, error: 'unknown_report_preset_action' };
    }

    if (action === 'positive') {
      const current = await ensureState({});
      await ensureState({ onlyPositive: !current.onlyPositive, step: 'menu' });
      await telegramAnswerCallback(env, callbackQuery, 'Фильтр обновлён.');
      return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
    }

    const state = await ensureState({ step: 'menu' });
    const period = state.period ?? project.period ?? 'yesterday';
    const range = getPeriodRange(period, timezone);
    if (!range) {
      await telegramSendMessage(env, message, 'Не удалось вычислить период для отчёта.', { disable_reply: true });
      return { ok: false, error: 'range_failed' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramSendMessage(env, message, 'Meta не подключена. Перейдите в /admin и подключите профиль.', {
        disable_reply: true,
      });
      return { ok: false, error: 'meta_missing' };
    }

    const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
    const currency = getCurrencyFromMeta(accountMeta);
    const filters = { minSpend: state.minSpend, onlyPositive: state.onlyPositive };

    if (action === 'preview') {
      await telegramAnswerCallback(env, callbackQuery, 'Готовим отчёт...');

      try {
        const payload = await buildProjectReport(env, project, { period, range, token, currency, filters });
        const summaryLines = [
          `<b>Предпросмотр отчёта #${escapeHtml(project.code)}</b>`,
          `Период: ${escapeHtml(getPeriodLabel(period))}${range ? ` (${range.since}–${range.until})` : ''}`,
          `Фильтры: ${escapeHtml(describeReportFilters(payload.filters))}`,
          `Кампаний: ${payload.filteredInsights.length}/${payload.insights.length}`,
          '',
          payload.detailMessage ?? payload.chatMessage,
        ];

        await telegramSendMessage(env, message, summaryLines.join('\n'), {
          disable_reply: true,
        });
      } catch (error) {
        console.error('proj:report:preview error', error);
        await telegramSendMessage(env, message, `Не удалось подготовить отчёт: ${escapeHtml(error?.message ?? 'ошибка')}`, {
          disable_reply: true,
        });
      }

      return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
    }

    if (action === 'send') {
      await telegramAnswerCallback(env, callbackQuery, 'Готовим отчёт...');

      try {
        const result = await sendProjectReport(env, project, {
          period,
          range,
          token,
          currency,
          filters,
          archive: true,
          origin: 'manual',
        });
        await telegramSendMessage(
          env,
          message,
          `Отчёт по <b>#${escapeHtml(project.code)}</b> отправлен в чат. Фильтры: ${escapeHtml(
            describeReportFilters(result.payload?.filters ?? filters),
          )}.`,
          { disable_reply: true },
        );
      } catch (error) {
        console.error('proj:report:send error', error);
        await telegramSendMessage(env, message, `Не удалось подготовить отчёт: ${escapeHtml(error?.message ?? 'ошибка')}`, {
          disable_reply: true,
        });
      }

      return editMessageWithReportOptions(env, message, code, { preserveAwait: true, uid, timezone });
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие не реализовано.');
    return { ok: false, error: 'unknown_report_action' };
  }

  if (data.startsWith('proj:digest:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';
    const project = await loadProject(env, code);
    if (!project) {
      await telegramSendMessage(env, message, `Проект <b>#${escapeHtml(code)}</b> не найден. Обновите список проектов.`, {
        disable_reply: true,
      });
      return { ok: false, error: 'project_not_found' };
    }

    const ensureState = async (patch = {}) => {
      const current = await loadUserState(env, uid);
      const merged = createDigestState(project, {
        ...(current?.mode === 'digest_options' && current.code === code ? current : {}),
        ...patch,
        message_chat_id: message.chat.id,
        message_id: message.message_id,
      });
      await saveUserState(env, uid, merged);
      return merged;
    };

    if (action === 'open') {
      const nextState = await ensureState({ step: 'menu' });
      return editMessageWithDigestOptions(env, message, code, nextState, {
        timezone,
        awaitingPresetName: nextState.step === 'await_preset_name',
      });
    }

    if (action === 'period') {
      const periodValue = parts[4] ?? '';
      const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value));
      if (!allowed.has(periodValue)) {
        await telegramAnswerCallback(env, callbackQuery, 'Период не поддерживается.');
        return { ok: false, error: 'invalid_period' };
      }

      const nextState = await ensureState({ period: periodValue, step: 'menu' });
      await telegramAnswerCallback(env, callbackQuery, 'Период обновлён.');
      return editMessageWithDigestOptions(env, message, code, nextState, { timezone });
    }

    if (action === 'preset_menu') {
      await telegramAnswerCallback(env, callbackQuery, 'Открываю пресеты...');
      const presets = await loadDigestPresets(env, uid);
      const view = renderDigestPresetMenu(project, presets, { timezone });
      await ensureState({ step: 'menu' });
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
        parse_mode: 'HTML',
      });
    }

    if (action === 'preset_save') {
      const nextState = await ensureState({ step: 'await_preset_name' });
      await telegramAnswerCallback(env, callbackQuery, 'Пришлите название пресета сообщением.');
      return editMessageWithDigestOptions(env, message, code, nextState, {
        timezone,
        awaitingPresetName: true,
      });
    }

    if (action === 'preset_apply') {
      const presetId = parts[4] ?? '';
      const presets = await loadDigestPresets(env, uid);
      const preset = presets.find((entry) => entry.id === presetId);
      if (!preset) {
        await telegramAnswerCallback(env, callbackQuery, 'Пресет не найден.');
        return { ok: false, error: 'digest_preset_missing' };
      }

      const nextState = await ensureState({ period: preset.period, step: 'menu' });
      await telegramAnswerCallback(env, callbackQuery, `Пресет «${preset.name}» применён.`);
      return editMessageWithDigestOptions(env, message, code, nextState, { timezone });
    }

    if (action === 'preset_delete') {
      const presetId = parts[4] ?? '';
      const removed = await deleteDigestPreset(env, uid, presetId);
      const presets = await loadDigestPresets(env, uid);
      const view = renderDigestPresetMenu(project, presets, {
        timezone,
        notice: removed ? 'Пресет удалён.' : 'Не удалось удалить пресет.',
      });
      await telegramAnswerCallback(env, callbackQuery, removed ? 'Удалено.' : 'Не удалось удалить.');
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
        parse_mode: 'HTML',
      });
    }

    const state = await ensureState({ step: 'menu' });
    const period = state.period ?? project.period ?? 'yesterday';
    const range = getPeriodRange(period, timezone);
    if (!range) {
      await telegramSendMessage(env, message, 'Не удалось вычислить период для дайджеста.', { disable_reply: true });
      return { ok: false, error: 'range_failed' };
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      await telegramSendMessage(env, message, 'Meta не подключена. Перейдите в /admin и подключите профиль.', {
        disable_reply: true,
      });
      return { ok: false, error: 'meta_missing' };
    }

    const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
    const currency = getCurrencyFromMeta(accountMeta);

    if (action === 'preview') {
      await telegramAnswerCallback(env, callbackQuery, 'Готовим дайджест...');

      try {
        const payload = await buildProjectDigest(env, project, { period, range, token, currency });
        const summaryLines = [
          `<b>Предпросмотр дайджеста #${escapeHtml(project.code)}</b>`,
          `Период: ${escapeHtml(getPeriodLabel(period))}${range ? ` (${range.since}–${range.until})` : ''}`,
          '',
          payload.detailMessage ?? payload.chatMessage,
        ];

        await telegramSendMessage(env, message, summaryLines.join('\n'), {
          disable_reply: true,
        });
      } catch (error) {
        console.error('proj:digest:preview error', error);
        await telegramSendMessage(env, message, `Не удалось подготовить дайджест: ${escapeHtml(error?.message ?? 'ошибка')}`, {
          disable_reply: true,
        });
      }

      return editMessageWithDigestOptions(env, message, code, { timezone });
    }

    if (action === 'send') {
      await telegramAnswerCallback(env, callbackQuery, 'Готовим дайджест...');

      try {
        await sendProjectDigest(env, project, { period, range, token, currency });
        await telegramSendMessage(env, message, `Дайджест по <b>#${escapeHtml(project.code)}</b> отправлен в чат.`, {
          disable_reply: true,
        });
      } catch (error) {
        console.error('proj:digest:send error', error);
        await telegramSendMessage(env, message, `Не удалось подготовить дайджест: ${escapeHtml(error?.message ?? 'ошибка')}`, {
          disable_reply: true,
        });
      }

      return editMessageWithDigestOptions(env, message, code, { timezone });
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие не реализовано.');
    return { ok: false, error: 'unknown_digest_action' };
  }

  if (data.startsWith('proj:campaigns:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);

    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    if (action === 'noop') {
      await telegramAnswerCallback(env, callbackQuery, ' ');
      return { ok: true, noop: true };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    const readState = async () => {
      if (!uid) {
        return { items: null, page: 0, updatedAt: null };
      }

      const state = await loadUserState(env, uid);
      if (state?.mode === 'campaign_editor' && state.code === code && Array.isArray(state.items)) {
        return {
          items: state.items,
          page: Number.isFinite(state.page) ? Number(state.page) : 0,
          updatedAt: Number.isFinite(state.updated_at) ? Number(state.updated_at) : null,
        };
      }

      return { items: null, page: 0, updatedAt: null };
    };

    const fetchCampaigns = async () => {
      if (!project.act) {
        throw new Error('У проекта не указан рекламный аккаунт.');
      }

      const { token } = await resolveMetaToken(env);
      if (!token) {
        throw new Error('Meta токен не найден. Подключите аккаунт через /admin.');
      }

      const items = await fetchAccountCampaignList(env, project, token);
      return { items, updatedAt: Date.now() };
    };

    const handleFetchError = async (error) => {
      console.error('proj:campaigns error', error);
      await telegramSendMessage(
        env,
        message,
        `Не удалось получить кампании: ${escapeHtml(error?.message ?? String(error))}`,
        { disable_reply: true },
      );
    };

    if (action === 'open') {
      try {
        const { items, updatedAt } = await fetchCampaigns();
        await telegramAnswerCallback(env, callbackQuery, `Найдено кампаний: ${items.length}`);
        return editMessageWithCampaignEditor(env, message, code, {
          uid,
          items,
          page: 0,
          updatedAt,
          projectOverride: project,
          timezone: env.DEFAULT_TZ ?? 'UTC',
        });
      } catch (error) {
        await telegramAnswerCallback(env, callbackQuery, 'Не удалось загрузить кампании.');
        await handleFetchError(error);
        return { ok: false, error: 'campaigns_open_failed' };
      }
    }

    if (action === 'refresh') {
      const state = await readState();
      try {
        const { items, updatedAt } = await fetchCampaigns();
        await telegramAnswerCallback(env, callbackQuery, 'Список кампаний обновлён.');
        return editMessageWithCampaignEditor(env, message, code, {
          uid,
          items,
          page: state.page ?? 0,
          updatedAt,
          projectOverride: project,
          timezone: env.DEFAULT_TZ ?? 'UTC',
        });
      } catch (error) {
        await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить кампании.');
        await handleFetchError(error);
        return { ok: false, error: 'campaigns_refresh_failed' };
      }
    }

    if (action === 'page') {
      const direction = parts[4] ?? '';
      const state = await readState();
      let { items, page, updatedAt } = state;

      if (!Array.isArray(items)) {
        try {
          const fetched = await fetchCampaigns();
          items = fetched.items;
          updatedAt = fetched.updatedAt;
        } catch (error) {
          await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить кампании.');
          await handleFetchError(error);
          return { ok: false, error: 'campaigns_page_failed' };
        }
      }

      page = Number.isFinite(page) ? page : 0;
      const totalPages = Math.max(1, Math.ceil(items.length / CAMPAIGN_EDITOR_PAGE_SIZE));
      if (direction === 'next' && page + 1 < totalPages) {
        page += 1;
      } else if (direction === 'prev' && page > 0) {
        page -= 1;
      }

      await telegramAnswerCallback(env, callbackQuery, 'Страница обновлена.');
      return editMessageWithCampaignEditor(env, message, code, {
        uid,
        items,
        page,
        updatedAt,
        projectOverride: project,
        timezone: env.DEFAULT_TZ ?? 'UTC',
      });
    }

    if (action === 'toggle') {
      const rawId = parts[4] ?? '';
      const campaignId = normalizeCampaignId(rawId);
      if (!campaignId) {
        await telegramAnswerCallback(env, callbackQuery, 'Кампания не распознана.');
        return { ok: false, error: 'invalid_campaign_id' };
      }

      const state = await readState();
      let { items, updatedAt } = state;
      const page = Number.isFinite(state.page) ? state.page : 0;

      if (!Array.isArray(items)) {
        try {
          const fetched = await fetchCampaigns();
          items = fetched.items;
          updatedAt = fetched.updatedAt;
        } catch (error) {
          await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить кампании.');
          await handleFetchError(error);
          return { ok: false, error: 'campaigns_toggle_failed' };
        }
      }

      let added = false;
      const updatedProject = await mutateProject(env, code, (proj) => {
        const set = new Set(
          Array.isArray(proj.campaigns)
            ? proj.campaigns.map((value) => normalizeCampaignId(value)).filter(Boolean)
            : [],
        );
        if (set.has(campaignId)) {
          set.delete(campaignId);
        } else {
          set.add(campaignId);
          added = true;
        }
        proj.campaigns = Array.from(set);
      });

      await telegramAnswerCallback(
        env,
        callbackQuery,
        added ? 'Кампания добавлена.' : 'Кампания исключена.',
      );

      return editMessageWithCampaignEditor(env, message, code, {
        uid,
        items,
        page,
        updatedAt,
        projectOverride: updatedProject ?? project,
        timezone: env.DEFAULT_TZ ?? 'UTC',
      });
    }

    if (action === 'select') {
      const mode = parts[4] ?? '';
      const state = await readState();
      let { items, updatedAt } = state;
      const page = Number.isFinite(state.page) ? state.page : 0;

      if (!Array.isArray(items)) {
        try {
          const fetched = await fetchCampaigns();
          items = fetched.items;
          updatedAt = fetched.updatedAt;
        } catch (error) {
          await telegramAnswerCallback(env, callbackQuery, 'Не удалось обновить кампании.');
          await handleFetchError(error);
          return { ok: false, error: 'campaigns_select_failed' };
        }
      }

      let selectedIds = [];
      if (mode === 'all') {
        selectedIds = items.map((item) => item.id);
      } else if (mode === 'active') {
        selectedIds = items.filter(isCampaignEffectivelyActive).map((item) => item.id);
      } else if (mode === 'clear') {
        selectedIds = [];
      } else {
        await telegramAnswerCallback(env, callbackQuery, 'Действие не поддерживается.');
        return { ok: false, error: 'campaigns_select_unknown' };
      }

      const normalizedSelection = Array.from(
        new Set(selectedIds.map((value) => normalizeCampaignId(value)).filter(Boolean)),
      );

      const updatedProject = await mutateProject(env, code, (proj) => {
        proj.campaigns = normalizedSelection;
      });

      await telegramAnswerCallback(
        env,
        callbackQuery,
        `Выбрано кампаний: ${normalizedSelection.length}.`,
      );

      return editMessageWithCampaignEditor(env, message, code, {
        uid,
        items,
        page,
        updatedAt,
        projectOverride: updatedProject ?? project,
        timezone: env.DEFAULT_TZ ?? 'UTC',
      });
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие не поддерживается.');
    return { ok: false, error: 'unknown_campaigns_action' };
  }

  if (data.startsWith('proj:actions:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
      return { ok: false, error: 'project_not_found' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';

    const reopenMenu = async (noticeHtml) => {
      const updated = await loadProject(env, code);
      const view = renderProjectActionsMenu(updated ?? project, { noticeHtml });
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
        parse_mode: 'HTML',
      });
    };

    if (action === 'open') {
      await telegramAnswerCallback(env, callbackQuery, 'Открываю меню действий...');
      return reopenMenu(null);
    }

    if (action === 'auto') {
      await telegramAnswerCallback(env, callbackQuery, 'Запускаю автоотчёт...');
      try {
        const result = await runManualAutoReportAction(env, project, { timezone });
        const messageText = [
          `✅ <b>Отчёт отправлен</b> (#${escapeHtml(project.code)})`,
          `Период: ${escapeHtml(result.range.since)}–${escapeHtml(result.range.until)}`,
          `Строк: ${formatNumber(result.rows)} · Spend: ${formatCurrency(result.spend, result.currency)}`,
        ].join('\n');
        await telegramSendMessage(env, message, messageText, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(
          `✅ Автоотчёт отправлен (${escapeHtml(result.range.since)}–${escapeHtml(result.range.until)}).`,
        );
      } catch (error) {
        console.error('proj:actions:auto error', error);
        const msg = error?.message ?? 'Не удалось отправить отчёт.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    if (action === 'digest') {
      await telegramAnswerCallback(env, callbackQuery, 'Готовим дайджест...');
      try {
        const result = await runManualDigestAction(env, project, { timezone });
        const periodLabel = getPeriodLabel(result.period);
        const lines = [
          `✅ Дайджест отправлен для #${escapeHtml(project.code)}.`,
          `Период: ${escapeHtml(periodLabel)}${result.range ? ` (${result.range.since}–${result.range.until})` : ''}`,
        ];
        await telegramSendMessage(env, message, lines.join('\n'), { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu('✅ Дайджест отправлен.');
      } catch (error) {
        console.error('proj:actions:digest error', error);
        const msg = error?.message ?? 'Не удалось отправить дайджест.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    if (action === 'weekly') {
      await telegramAnswerCallback(env, callbackQuery, 'Отправляю сводник...');
      try {
        await runManualWeeklyDigestAction(env, project, { timezone });
        await telegramSendMessage(
          env,
          message,
          `✅ Еженедельный сводник отправлен для #${escapeHtml(project.code)}.`,
          { disable_reply: true, parse_mode: 'HTML' },
        );
        return reopenMenu('✅ Еженедельный сводник отправлен.');
      } catch (error) {
        console.error('proj:actions:weekly error', error);
        const msg = error?.message ?? 'Не удалось отправить сводник.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    if (action === 'alerts') {
      await telegramAnswerCallback(env, callbackQuery, 'Запускаю проверки...');
      try {
        const summary = await runManualAlertsAction(env, project, { timezone });
        if (summary.skipped && !summary.ran) {
          await telegramSendMessage(
            env,
            message,
            `ℹ️ Проверки не запущены: ${escapeHtml(summary.skipped)}.`,
            { disable_reply: true, parse_mode: 'HTML' },
          );
          return reopenMenu(`ℹ️ Проверки не запущены (${escapeHtml(summary.skipped)}).`);
        }

        const triggered = [];
        if (summary.billing) triggered.push('billing');
        if (summary.zero) triggered.push('zero-spend');
        if (summary.anomaly) triggered.push('anomaly');
        if (summary.fatigue) triggered.push('fatigue');
        const triggeredLabel = triggered.length
          ? `Отправлены алерты: ${escapeHtml(triggered.join(', '))}.`
          : 'Уведомлений не потребовалось.';
        const reportLines = [
          `✅ Проверки завершены для #${escapeHtml(project.code)}.`,
          triggeredLabel,
        ];
        await telegramSendMessage(env, message, reportLines.join('\n'), { disable_reply: true, parse_mode: 'HTML' });
        const notice = triggered.length
          ? `✅ Отправлены алерты (${escapeHtml(triggered.join(', '))}).`
          : 'ℹ️ Проверки завершены, уведомлений нет.';
        return reopenMenu(notice);
      } catch (error) {
        console.error('proj:actions:alerts error', error);
        const msg = error?.message ?? 'Не удалось выполнить проверки.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    if (action === 'autopause') {
      await telegramAnswerCallback(env, callbackQuery, 'Пересчитываю автопаузу...');
      try {
        const summary = await runManualAutopauseAction(env, project, { timezone });
        if (summary.skipped && !summary.ran) {
          await telegramSendMessage(
            env,
            message,
            `ℹ️ Автопауза не запущена: ${escapeHtml(summary.skipped)}.`,
            { disable_reply: true, parse_mode: 'HTML' },
          );
          return reopenMenu(`ℹ️ Автопауза не запущена (${escapeHtml(summary.skipped)}).`);
        }

        const base = `CPA=${summary.streak >= summary.threshold ? '⚠️ превышение' : 'в пределах нормы'}`;
        const lines = [
          `✅ Проверка автопаузы для #${escapeHtml(project.code)} завершена.`,
          `Streak: ${formatNumber(summary.streak)} / порог ${formatNumber(summary.threshold ?? 0)} (${escapeHtml(base)}).`,
        ];
        if (summary.triggered) {
          lines.push('Отправлено уведомление админам.');
        }
        await telegramSendMessage(env, message, lines.join('\n'), { disable_reply: true, parse_mode: 'HTML' });
        const notice = summary.triggered
          ? '⚠️ CPA выше KPI — уведомление отправлено.'
          : `ℹ️ Streak ${formatNumber(summary.streak)} / порог ${formatNumber(summary.threshold ?? 0)}.`;
        return reopenMenu(notice);
      } catch (error) {
        console.error('proj:actions:autopause error', error);
        const msg = error?.message ?? 'Не удалось выполнить проверку автопаузы.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    if (action === 'reset') {
      await telegramAnswerCallback(env, callbackQuery, 'Сбрасываю флаги...');
      try {
        const result = await resetProjectReportFlags(env, project, { timezone });
        const text = `✅ Служебные флаги очищены (${formatNumber(result.removed)} шт.).`;
        await telegramSendMessage(env, message, text, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(text);
      } catch (error) {
        console.error('proj:actions:reset error', error);
        const msg = error?.message ?? 'Не удалось очистить флаги.';
        await telegramSendMessage(env, message, `⚠️ ${escapeHtml(msg)}`, { disable_reply: true, parse_mode: 'HTML' });
        return reopenMenu(`⚠️ ${escapeHtml(msg)}`);
      }
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие не распознано.');
    return { ok: false, error: 'unknown_action_command' };
  }

  if (data.startsWith('proj:portal:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const timezone = env.DEFAULT_TZ || 'UTC';

    if (action === 'open') {
      await telegramAnswerCallback(env, callbackQuery, 'Открываю портал...');
      return editMessageWithPortal(env, message, code, { timezone });
    }

    if (action === 'refresh') {
      await telegramAnswerCallback(env, callbackQuery, 'Обновляю портал...');
      return editMessageWithPortal(env, message, code, { timezone });
    }

    if (action === 'create' || action === 'rotate') {
      const existing = await loadPortalRecord(env, code);
      const nowIso = new Date().toISOString();
      const record = {
        sig: generatePortalSignature(),
        created_at: existing?.created_at ?? nowIso,
        updated_at: nowIso,
      };
      if (existing?.sig) {
        record.rotated_at = nowIso;
      }
      await savePortalRecord(env, code, record);
      await telegramAnswerCallback(
        env,
        callbackQuery,
        existing?.sig ? 'Ссылка обновлена.' : 'Портал включён.',
      );
      return editMessageWithPortal(env, message, code, { timezone });
    }

    if (action === 'disable') {
      await deletePortalRecord(env, code);
      await telegramAnswerCallback(env, callbackQuery, 'Портал отключён.');
      return editMessageWithPortal(env, message, code, { timezone });
    }

    if (action === 'send' || action === 'dm') {
      const project = await loadProject(env, code);
      if (!project) {
        await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
        return { ok: false, error: 'project_not_found' };
      }

      const portalRecord = await loadPortalRecord(env, code);
      const link = buildPortalUrl(env, code, portalRecord);
      if (!link) {
        await telegramAnswerCallback(env, callbackQuery, 'Сначала включите портал.');
        return editMessageWithPortal(env, message, code, { timezone });
      }

      if (action === 'send') {
        const shareLines = [
          `🌐 <b>Портал клиента #${escapeHtml(project.code)}</b>`,
          `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`,
          '',
          `Период по умолчанию: ${escapeHtml(getPeriodLabel(project.period ?? 'yesterday'))}.`,
        ];

        try {
          await telegramSendToProject(env, project, shareLines.join('\n'), {
            disable_web_page_preview: false,
          });
          await telegramAnswerCallback(env, callbackQuery, 'Ссылка отправлена клиенту.');
        } catch (error) {
          console.error('proj:portal:send error', error);
          await telegramAnswerCallback(env, callbackQuery, 'Не удалось отправить ссылку в чат клиента.');
        }

        return editMessageWithPortal(env, message, code, { timezone });
      }

      if (action === 'dm') {
        const dmText = [
          `Ссылка на портал <b>#${escapeHtml(project.code)}</b>:`,
          `<code>${escapeHtml(link)}</code>`,
        ].join('\n');

        await telegramSendMessage(env, message, dmText, {
          disable_reply: true,
          disable_web_page_preview: true,
        });
        await telegramAnswerCallback(env, callbackQuery, 'Ссылка отправлена в этот чат.');
        return editMessageWithPortal(env, message, code, { timezone });
      }
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие не реализовано.');
    return { ok: false, error: 'unknown_portal_action' };
  }

  if (data.startsWith('proj:archive:')) {
    const parts = data.split(':');
    const action = parts[2] ?? '';
    const rawCode = parts[3] ?? '';
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    if (action === 'open') {
      await telegramAnswerCallback(env, callbackQuery, 'Открываю архив...');
      return editMessageWithArchiveList(env, message, code, { uid, refresh: true });
    }

    if (action === 'refresh') {
      await telegramAnswerCallback(env, callbackQuery, 'Обновляю архив...');
      return editMessageWithArchiveList(env, message, code, { uid, refresh: true });
    }

    if (action === 'page') {
      const direction = parts[4] ?? '';
      const state = await loadUserState(env, uid);
      let page = state?.page ?? 0;
      if (state?.mode !== 'report_archive' || state.code !== code || !Array.isArray(state.keys)) {
        await telegramAnswerCallback(env, callbackQuery, 'Обновляю список архива.');
        return editMessageWithArchiveList(env, message, code, { uid, refresh: true });
      }

      const total = state.keys.length;
      const totalPages = total > 0 ? Math.ceil(total / REPORT_ARCHIVE_PAGE_SIZE) : 1;
      if (direction === 'next' && page + 1 < totalPages) {
        page += 1;
      } else if (direction === 'prev' && page > 0) {
        page -= 1;
      }

      await telegramAnswerCallback(env, callbackQuery, 'Страница обновлена.');
      return editMessageWithArchiveList(env, message, code, { uid, refresh: false, page });
    }

    if (action === 'back') {
      await telegramAnswerCallback(env, callbackQuery, 'Возвращаю список архива.');
      return editMessageWithArchiveList(env, message, code, { uid, refresh: false });
    }

    if (action === 'view') {
      const stamp = Number(parts[4] ?? '');
      if (!Number.isFinite(stamp)) {
        await telegramAnswerCallback(env, callbackQuery, 'Запись не распознана.');
        return { ok: false, error: 'invalid_archive_stamp' };
      }

      await telegramAnswerCallback(env, callbackQuery, 'Открываю запись...');
      return editMessageWithArchivePreview(env, message, code, stamp, { uid });
    }

    if (action === 'send') {
      const stamp = Number(parts[4] ?? '');
      if (!Number.isFinite(stamp)) {
        await telegramAnswerCallback(env, callbackQuery, 'Запись не распознана.');
        return { ok: false, error: 'invalid_archive_stamp' };
      }

      const project = await loadProject(env, code);
      if (!project) {
        await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
        return { ok: false, error: 'project_not_found' };
      }

      const record = await loadReportArchiveRecord(env, code, stamp);
      if (!record || !record.message) {
        await telegramAnswerCallback(env, callbackQuery, 'Сообщение архива не найдено.');
        await telegramSendMessage(env, message, 'Не удалось найти текст отчёта в архиве. Возможно, запись истекла.', {
          disable_reply: true,
        });
        return { ok: false, error: 'archive_missing_message' };
      }

      await telegramAnswerCallback(env, callbackQuery, 'Отправляю архивный отчёт...');

      try {
        await telegramSendToProject(env, project, record.message, {});
        await telegramSendMessage(
          env,
          message,
          `Архивный отчёт <b>#${escapeHtml(code)}</b> (${formatRangeLabel(record.range)}) отправлен в чат.`,
          { disable_reply: true },
        );
      } catch (error) {
        console.error('proj:archive:send error', error);
        await telegramSendMessage(
          env,
          message,
          `Не удалось отправить архивный отчёт: ${escapeHtml(error?.message ?? 'ошибка')}`,
          { disable_reply: true },
        );
      }

      return editMessageWithArchivePreview(env, message, code, stamp, { uid });
    }

    if (action === 'csvchat' || action === 'csvhere') {
      const stamp = Number(parts[4] ?? '');
      if (!Number.isFinite(stamp)) {
        await telegramAnswerCallback(env, callbackQuery, 'Запись не распознана.');
        return { ok: false, error: 'invalid_archive_stamp' };
      }

      const project = await loadProject(env, code);
      if (!project) {
        await telegramAnswerCallback(env, callbackQuery, 'Проект не найден.');
        return { ok: false, error: 'project_not_found' };
      }

      const record = await loadReportArchiveRecord(env, code, stamp);
      if (!record) {
        await telegramAnswerCallback(env, callbackQuery, 'Запись архива не найдена.');
        await telegramSendMessage(env, message, 'Не удалось получить данные для CSV. Возможно, запись истекла.', {
          disable_reply: true,
        });
        return { ok: false, error: 'archive_missing_record' };
      }

      const csvContent = buildCsvFromArchiveRecord(record, { projectCode: project.code });
      if (!csvContent) {
        await telegramAnswerCallback(env, callbackQuery, 'CSV не сформирован.');
        await telegramSendMessage(env, message, 'CSV-файл пуст или запись не содержит строк.', { disable_reply: true });
        return { ok: false, error: 'csv_generation_failed' };
      }

      const filename = getArchiveCsvFilename(project, record, stamp);
      const caption = `CSV отчёт <b>#${escapeHtml(code)}</b> (${escapeHtml(formatRangeLabel(record.range))})`;

      if (action === 'csvchat') {
        await telegramAnswerCallback(env, callbackQuery, 'Отправляю CSV в чат...');
        try {
          await telegramSendDocument(env, project, { filename, content: csvContent, caption });
          await telegramSendMessage(env, message, 'CSV отправлен в рабочий чат.', { disable_reply: true });
        } catch (error) {
          console.error('proj:archive:csvchat error', error);
          await telegramSendMessage(
            env,
            message,
            `Не удалось отправить CSV в чат: ${escapeHtml(error?.message ?? 'ошибка')}`,
            { disable_reply: true },
          );
        }
      } else {
        await telegramAnswerCallback(env, callbackQuery, 'Готовлю CSV...');
        try {
          await telegramSendDocumentToChat(env, {
            chatId: message.chat.id,
            threadId: message.message_thread_id,
            filename,
            content: csvContent,
            caption,
          });
          await telegramSendMessage(env, message, 'CSV отправлен в этот диалог.', { disable_reply: true });
        } catch (error) {
          console.error('proj:archive:csvhere error', error);
          await telegramSendMessage(
            env,
            message,
            `Не удалось отправить CSV сюда: ${escapeHtml(error?.message ?? 'ошибка')}`,
            { disable_reply: true },
          );
        }
      }

      return editMessageWithArchivePreview(env, message, code, stamp, { uid });
    }

    await telegramAnswerCallback(env, callbackQuery, 'Действие архива не поддерживается.');
    return { ok: false, error: 'unknown_archive_action' };
  }

  if (data.startsWith('proj:detail:')) {
    const [, , rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramEditMessage(
        env,
        message.chat.id,
        message.message_id,
        'Код проекта не распознан. Вернитесь в список и выберите проект ещё раз.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
          },
        },
      );
      return { ok: false, error: 'invalid_project_code' };
    }

    const project = await loadProject(env, code);
    if (!project) {
      await telegramEditMessage(
        env,
        message.chat.id,
        message.message_id,
        'Проект не найден. Возможно, он был удалён.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '📋 К списку', callback_data: 'panel:projects:0' }]],
          },
        },
      );
      return { ok: false, error: 'project_not_found' };
    }

    await clearPendingReportState(env, uid, code);
    await clearReportArchiveState(env, uid, code);
    const chatRecord = project.chat_id
      ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
      : null;

    const portalRecord = await loadPortalRecord(env, project.code);
    const timezone = env.DEFAULT_TZ || 'UTC';
    const details = renderProjectDetails(project, chatRecord, portalRecord, { timezone });
    return telegramEditMessage(env, message.chat.id, message.message_id, details.text, {
      reply_markup: details.reply_markup,
    });
  }

  return telegramEditMessage(env, message.chat.id, message.message_id, 'Эта кнопка пока не реализована.', {
    reply_markup: {
      inline_keyboard: [[{ text: '← Назад', callback_data: 'panel:home' }]],
    },
  });
}

function renderPortalErrorPage(message) {
  const safeMessage = escapeHtml(message ?? 'Портал недоступен.');
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Портал недоступен — th-reports</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111827; margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
      .card { background: #fff; padding: 32px 28px; border-radius: 16px; box-shadow: 0 10px 40px rgba(15, 23, 42, 0.12); max-width: 480px; }
      h1 { font-size: 24px; margin: 0 0 12px; }
      p { margin: 0; color: #4b5563; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Портал недоступен</h1>
      <p>${safeMessage}</p>
    </div>
  </body>
</html>`;
}

function renderPortalPage({
  project,
  chatRecord,
  portalRecord,
  period,
  range,
  timezone,
  baseUrl,
  currency = 'USD',
  reportData = null,
  accountMeta = null,
  error = null,
  generatedAt = new Date(),
  totalInsights = 0,
}) {
  const projectTitle = chatRecord?.title ? chatRecord.title : `Проект #${project.code}`;
  const accountName = accountMeta?.name ? accountMeta.name : project.act || '—';
  const periodLabel = getPeriodLabel(period);
  const rangeLabel = range ? `${range.since} — ${range.until}` : '';
  const nextBilling = formatDateLabel(project.billing_next_at);
  const billingStatus = project.billing ?? 'paid';
  const generatedLabel = formatDateTimeLabel(generatedAt, timezone);
  const portalUpdatedLabel = portalRecord?.updated_at
    ? formatDateTimeLabel(portalRecord.updated_at, timezone)
    : null;

  const navLinks = PERIOD_OPTIONS.map((option) => {
    const navUrl = new URL(baseUrl.toString());
    navUrl.searchParams.set('period', option.value);
    if (portalRecord?.sig) {
      navUrl.searchParams.set('sig', portalRecord.sig);
    }
    const classes = ['pill'];
    if (option.value === period) {
      classes.push('active');
    }
    return `<a class="${classes.join(' ')}" href="${escapeHtml(navUrl.toString())}">${escapeHtml(option.label)}</a>`;
  }).join('');

  let tableHtml = '';
  if (error) {
    tableHtml = `<div class="alert">${escapeHtml(error)}</div>`;
  } else {
    const rows = [];
    if (reportData?.rows?.length) {
      for (const row of reportData.rows) {
        const badge = row.metric?.label ? `<span class="badge">${escapeHtml(row.metric.label)}</span>` : '';
        rows.push(
          `<tr>
            <td>${escapeHtml(row.name)}${badge}</td>
            <td class="num">${escapeHtml(formatCurrency(row.spend, currency))}</td>
            <td class="num">${escapeHtml(formatNumber(row.results))}</td>
            <td class="num">${escapeHtml(formatCpa(row.cpa, currency))}</td>
          </tr>`,
        );
      }
    } else {
      rows.push(
        '<tr><td class="muted" colspan="4">Данных нет за выбранный период.</td></tr>',
      );
    }

    const totalRow = `<tr class="total">
      <td>Итого</td>
      <td class="num">${escapeHtml(formatCurrency(reportData?.totalSpend ?? 0, currency))}</td>
      <td class="num">${escapeHtml(formatNumber(reportData?.totalResults ?? 0))}</td>
      <td class="num">${escapeHtml(formatCpa(reportData?.totalCpa ?? null, currency))}</td>
    </tr>`;

    tableHtml = `<table>
      <thead>
        <tr>
          <th>Кампания</th>
          <th class="num">Spend</th>
          <th class="num">Результаты</th>
          <th class="num">CPA</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
        ${totalRow}
      </tbody>
    </table>`;
  }

  const summaryItems = !error
    ? [
        { label: 'Spend', value: formatCurrency(reportData?.totalSpend ?? 0, currency) },
        { label: 'Результаты', value: formatNumber(reportData?.totalResults ?? 0) },
        { label: 'CPA ср.', value: formatCpa(reportData?.totalCpa ?? null, currency) },
        { label: 'Кампаний', value: formatNumber(reportData?.rows?.length ?? 0) },
      ]
    : [];

  const summaryHtml = summaryItems.length
    ? `<div class="summary">${summaryItems
        .map(
          (item) =>
            `<div class="summary-item"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`,
        )
        .join('')}</div>`
    : '';

  const infoParts = [
    `Следующая оплата: <strong>${escapeHtml(nextBilling)}</strong>`,
    `Статус биллинга: ${escapeHtml(billingStatus)}`,
    `Обновлено: ${escapeHtml(generatedLabel)} (${escapeHtml(timezone)})`,
  ];
  if (portalUpdatedLabel) {
    infoParts.push(`Ссылка активна с ${escapeHtml(portalUpdatedLabel)}`);
  }
  infoParts.push(`Источник: Meta Ads API · Кампаний в отчёте: ${escapeHtml(formatNumber(reportData?.rows?.length ?? 0))}/${escapeHtml(formatNumber(totalInsights))}`);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(projectTitle)} — портал th-reports</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f6f7fb; color: #111827; }
      .container { max-width: 960px; margin: 0 auto; padding: 32px 16px 48px; }
      header { margin-bottom: 12px; }
      h1 { font-size: 26px; margin: 0 0 8px; }
      .meta { margin: 0; color: #6b7280; font-size: 14px; }
      .nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 16px; }
      .pill { display: inline-block; padding: 8px 14px; border-radius: 999px; background: #fff; border: 1px solid #d4d7dd; text-decoration: none; color: #1f2937; transition: all .15s ease; }
      .pill:hover { border-color: #6366f1; color: #312e81; }
      .pill.active { background: #111827; color: #fff; border-color: #111827; }
      .panel { background: #fff; border-radius: 18px; padding: 20px 22px; box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12); }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
      th, td { padding: 12px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
      th { color: #6b7280; font-weight: 600; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      tr.total td { font-weight: 600; background: #f9fafb; }
      .badge { display: inline-block; margin-left: 6px; padding: 4px 10px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 600; }
      .summary { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 20px; }
      .summary-item { flex: 1 1 160px; background: #f9fafb; border-radius: 14px; padding: 14px 16px; }
      .summary-item .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
      .summary-item .value { font-size: 20px; font-weight: 600; margin-top: 6px; }
      .notice { margin-top: 18px; font-size: 13px; color: #6b7280; }
      .alert { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 14px 16px; border-radius: 14px; }
      .muted { text-align: center; color: #6b7280; font-style: italic; }
      @media (max-width: 720px) {
        .summary-item { flex: 1 1 140px; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <h1>${escapeHtml(projectTitle)}</h1>
        <p class="meta">Аккаунт: <strong>${escapeHtml(accountName)}</strong> · Период: ${escapeHtml(periodLabel)} (${escapeHtml(rangeLabel)})</p>
      </header>
      <div class="nav">${navLinks}</div>
      <div class="panel">
        ${tableHtml}
        ${summaryHtml}
      </div>
      <p class="notice">${infoParts.join(' · ')}</p>
    </div>
  </body>
</html>`;
}

async function handlePortal(request, env) {
  if (!getPrimaryKv(env)) {
    return html(renderPortalErrorPage('Хранилище данных временно недоступно.'), { status: 500 });
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2 || segments[0] !== 'p') {
    return notFound();
  }

  const code = sanitizeProjectCode(segments[1] ?? '');
  if (!isValidProjectCode(code)) {
    return notFound();
  }

  const signature = url.searchParams.get('sig') ?? '';
  const portalRecord = await loadPortalRecord(env, code);
  if (!portalRecord?.sig || signature !== portalRecord.sig) {
    return html(renderPortalErrorPage('Проверьте ссылку или запросите новую у менеджера.'), { status: 403 });
  }

  const project = await loadProject(env, code);
  if (!project) {
    return html(renderPortalErrorPage('Проект не найден или был удалён.'), { status: 404 });
  }

  const chatRecord = project.chat_id
    ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
    : null;
  const timezone = env.DEFAULT_TZ || 'UTC';
  const allowedPeriods = new Set(PERIOD_OPTIONS.map((option) => option.value));
  let period = url.searchParams.get('period') ?? project.period ?? 'yesterday';
  if (!allowedPeriods.has(period)) {
    period = allowedPeriods.has(project.period ?? '') ? project.period : 'yesterday';
  }

  let range = getPeriodRange(period, timezone);
  if (!range) {
    period = 'yesterday';
    range = getPeriodRange(period, timezone) ?? { since: '', until: '', label: 'период' };
  }

  const { token } = await resolveMetaToken(env);
  if (!token) {
    const markup = renderPortalPage({
      project,
      chatRecord,
      portalRecord,
      period,
      range,
      timezone,
      baseUrl: url,
      currency: 'USD',
      error: 'Meta токен не найден. Подключите Meta в админ-панели.',
      generatedAt: new Date(),
      totalInsights: 0,
    });
    return html(markup, { status: 503 });
  }

  const accountMeta = await loadAccountMeta(env, project.act?.replace(/^act_/i, '') ?? project.act);
  const currency = getCurrencyFromMeta(accountMeta);
  const generatedAt = new Date();

  try {
    const payload = await buildProjectReport(env, project, {
      period,
      range,
      token,
      currency,
      filters: {},
    });

    const markup = renderPortalPage({
      project,
      chatRecord,
      portalRecord,
      period,
      range,
      timezone,
      baseUrl: url,
      currency,
      reportData: payload.reportData,
      accountMeta,
      generatedAt,
      totalInsights: payload.insights?.length ?? 0,
    });
    return html(markup);
  } catch (error) {
    console.error('handlePortal build report error', error);
    const markup = renderPortalPage({
      project,
      chatRecord,
      portalRecord,
      period,
      range,
      timezone,
      baseUrl: url,
      currency,
      accountMeta,
      error: error?.message ?? 'Не удалось получить данные Meta. Попробуйте позже.',
      generatedAt,
      totalInsights: 0,
    });
    return html(markup, { status: 502 });
  }
}

async function handleRoot() {
  return json({
    status: 'ready',
    message: 'Скелет th-reports запущен. Пошагово добавьте функциональность бота.',
    endpoints: ['/health', '/tg', '/fb_auth', '/fb_cb', '/fb_debug', '/p/{code}'],
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === '/health') {
      return handleHealth(env);
    }

    if (pathname === '/') {
      return handleRoot();
    }

    if (pathname === '/tg') {
      return handleTelegramWebhook(request, env);
    }

    if (pathname === '/fb_auth') {
      return handleFbAuth(request, env);
    }

    if (pathname === '/fb_cb') {
      return handleFbCallback(request, env);
    }

    if (pathname === '/fb_debug') {
      return handleFbDebug(request, env);
    }

    if (pathname.startsWith('/p/')) {
      return handlePortal(request, env);
    }

    return notFound();
  },

  async scheduled(event, env, ctx) {
    const timezone = env.DEFAULT_TZ || 'UTC';
    const now = new Date();
    const hm = getLocalHm(now, timezone);

    let projects = [];
    try {
      projects = await listAllProjects(env, { pageSize: 100, maxPages: 25 });
    } catch (error) {
      console.error('scheduled listAllProjects error', error);
      return;
    }

    if (!projects.length) {
      return;
    }

    const { token } = await resolveMetaToken(env);
    if (!token) {
      console.warn('scheduled: Meta token отсутствует, автоотчёты пропущены.');
      return;
    }

    const currencyCache = new Map();
    processAutoReport.currencyCache = currencyCache;
    runProjectAlerts.currencyCache = currencyCache;
    runAutopauseCheck.currencyCache = currencyCache;

    for (const project of projects) {
      if (project?.code) {
        if (shouldSendAutoReportNow(project, { now, hm, timezone })) {
          ctx.waitUntil(
            processAutoReport(env, project, { token, timezone, hm }).catch((error) => {
              console.error('scheduled auto error', project.code, error);
            }),
          );
        }

        if (shouldSendWeeklyDigestNow(project, { now, hm, timezone })) {
          ctx.waitUntil(
            processWeeklyReport(env, project, { token, timezone }).catch((error) => {
              console.error('scheduled weekly error', project.code, error);
            }),
          );
        }

        ctx.waitUntil(
          runProjectAlerts(env, project, { token, timezone, hm }).catch((error) => {
            console.error('scheduled alerts error', project.code, error);
          }),
        );

        ctx.waitUntil(
          runAutopauseCheck(env, project, { token, timezone, hm }).catch((error) => {
            console.error('scheduled autopause error', project.code, error);
          }),
        );
      }
    }
  },
};
