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
const AUTO_REPORT_FLAG_PREFIX = 'flag:auto_report:';
const WEEKLY_REPORT_FLAG_PREFIX = 'flag:weekly_report:';
const REPORT_FLAG_TTL_SECONDS = 60 * 60 * 24 * 3;
const WEEKLY_FLAG_TTL_SECONDS = 60 * 60 * 24 * 14;
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
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'frequency',
  'actions',
];
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
  LEAD_GENERATION: { label: 'Лиды', short: 'leads', actions: ['lead'] },
  LEADS: { label: 'Лиды', short: 'leads', actions: ['lead'] },
  MESSAGES: {
    label: 'Диалоги',
    short: 'dialogs',
    actions: [
      'messaging_conversation_started',
      'onsite_conversion.messaging_first_reply',
      'messaging_first_reply',
    ],
  },
  CONVERSIONS: {
    label: 'Конверсии',
    short: 'conv',
    actions: ['purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.post_save'],
  },
  SALES: { label: 'Конверсии', short: 'conv', actions: ['purchase'] },
};
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

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  ensureString(env.BOT_TOKEN, 'BOT_TOKEN', missing);
  ensureString(env.ADMIN_IDS, 'ADMIN_IDS', missing);
  ensureString(env.DEFAULT_TZ, 'DEFAULT_TZ', missing);

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

async function handleHealth() {
  return text('ok');
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
  if (!env.DB) return null;
  if (!code) return null;

  try {
    const raw = await env.DB.get(getProjectKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeProject({ ...parsed, code });
  } catch (error) {
    console.error('loadProject error', error);
    return null;
  }
}

async function saveProject(env, project) {
  if (!env.DB) throw new Error('KV binding DB недоступен.');
  if (!project?.code) throw new Error('Код проекта обязателен.');

  const payload = JSON.stringify(normalizeProject(project));
  await env.DB.put(getProjectKey(project.code), payload);
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
  if (!env.DB) {
    return { items: [], cursor: null, listComplete: true };
  }

  const response = await env.DB.list({ prefix: PROJECT_PREFIX, cursor, limit });
  const items = [];

  for (const key of response.keys || []) {
    const code = key.name.slice(PROJECT_PREFIX.length);
    try {
      const raw = await env.DB.get(key.name);
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
  if (!env.DB || !uid) return null;
  try {
    const raw = await env.DB.get(getStateKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadUserState error', error);
    return null;
  }
}

async function saveUserState(env, uid, state, options = {}) {
  if (!env.DB || !uid) return;
  const ttl = Number.isFinite(options.ttlSeconds)
    ? Number(options.ttlSeconds)
    : STATE_TTL_SECONDS;
  await env.DB.put(getStateKey(uid), JSON.stringify(state ?? {}), { expirationTtl: ttl });
}

async function clearUserState(env, uid) {
  if (!env.DB || !uid) return;
  await env.DB.delete(getStateKey(uid));
}

async function loadUserProfile(env, uid) {
  if (!env.DB || !uid) return null;
  try {
    const raw = await env.DB.get(getUserKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadUserProfile error', error);
    return null;
  }
}

async function saveUserProfile(env, uid, profile) {
  if (!env.DB || !uid) return;
  await env.DB.put(getUserKey(uid), JSON.stringify(profile ?? {}));
}

async function loadUserAccounts(env, uid) {
  if (!env.DB || !uid) return [];
  try {
    const raw = await env.DB.get(getUserAccountsKey(uid));
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('loadUserAccounts error', error);
    return [];
  }
}

async function saveUserAccounts(env, uid, accounts = []) {
  if (!env.DB || !uid) return;
  await env.DB.put(getUserAccountsKey(uid), JSON.stringify(accounts ?? []));
}

async function saveAccountMeta(env, accountId, meta, options = {}) {
  if (!env.DB || !accountId) return;
  const ttl = Number.isFinite(options.ttlSeconds) ? Number(options.ttlSeconds) : ACCOUNT_META_TTL_SECONDS;
  await env.DB.put(getAccountMetaKey(accountId), JSON.stringify(meta ?? {}), { expirationTtl: ttl });
}

async function loadAccountMeta(env, accountId) {
  if (!env.DB || !accountId) return null;
  try {
    const raw = await env.DB.get(getAccountMetaKey(accountId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('loadAccountMeta error', error);
    return null;
  }
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
    url.searchParams.set(key, String(value));
  }

  return fetchJsonWithTimeout(url.toString(), { method: 'GET' }, META_TIMEOUT_MS);
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

async function telegramSendDocument(env, project, { filename, content, caption }) {
  if (typeof env.BOT_TOKEN !== 'string' || env.BOT_TOKEN.trim() === '') {
    throw new Error('BOT_TOKEN не задан. Невозможно отправить документ.');
  }
  if (!project?.chat_id) {
    throw new Error('У проекта не привязан чат для отправки документов.');
  }

  const form = new FormData();
  form.append('chat_id', String(project.chat_id));
  if (Number.isFinite(project.thread_id) && project.thread_id > 0) {
    form.append('message_thread_id', String(project.thread_id));
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
  if (!env.DB) {
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

  await env.DB.put(getChatKey(chatId, threadId), JSON.stringify(record));
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
    await sendProjectDigest(env, project, { period, range, token, currency });
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

    if (state.step !== 'await_min_spend') {
      await telegramSendMessage(env, message, 'Используйте кнопки меню отчёта для настройки.', {
        disable_reply: true,
      });
      return { handled: true, info: 'report_idle' };
    }

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
  return 'https://example.com';
}

function isAdmin(env, userId) {
  if (!userId) return false;
  const admins = parseAdminIds(env);
  return admins.includes(Number(userId));
}

async function listRegisteredChats(env, cursor, limit = DEFAULT_PAGE_SIZE) {
  if (!env.DB) {
    return { items: [], cursor: null, listComplete: true };
  }

  const response = await env.DB.list({ prefix: CHAT_PREFIX, cursor, limit });
  const items = [];
  for (const key of response.keys || []) {
    try {
      const raw = await env.DB.get(key.name);
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
  if (!items.length) {
    lines.push('Пока нет зарегистрированных топиков. Используйте /register в нужной теме.');
  } else {
    items.forEach((item, index) => {
      const title = item.title ? ` — ${escapeHtml(item.title)}` : '';
      const thread = item.thread_id ?? 0;
      lines.push(`• <code>${item.chat_id}</code> · thread <code>${thread}</code>${title}`);
    });
    if (pagination.nextCursor) {
      lines.push('', 'Показаны первые записи. Нажмите «Далее», чтобы увидеть ещё.');
    }
  }

  const keyboard = [];
  if (pagination.nextCursor) {
    keyboard.push([
      { text: '➡️ Далее', callback_data: `panel:chats:next:${encodeURIComponent(pagination.nextCursor)}` },
    ]);
  }
  if (pagination.showReset) {
    keyboard.push([{ text: '↩️ В начало', callback_data: 'panel:chats:0' }]);
  }
  keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: ['<b>Зарегистрированные чаты</b>', '', ...lines].join('\n'),
    reply_markup: { inline_keyboard: keyboard },
  };
}

function renderAccountsPage(env, uid, profile, accounts = [], options = {}) {
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

  if (!total) {
    lines.push('Аккаунтов пока нет. После подключения Meta нажмите «Пересканировать».');
  } else {
    const rangeStart = offset + 1;
    const rangeEnd = offset + slice.length;
    lines.push(`Всего в кеше: <b>${total}</b>. Показаны ${rangeStart}–${rangeEnd}.`);
    lines.push('');
    for (const account of slice) {
      const parts = [];
      if (account.account_status !== null && typeof account.account_status !== 'undefined') {
        parts.push(`статус ${account.account_status}`);
      }
      if (account.currency) {
        parts.push(account.currency);
      }
      if (account.timezone) {
        parts.push(account.timezone);
      }
      const suffix = parts.length ? ` (${parts.join(' · ')})` : '';
      lines.push(`• <b>${escapeHtml(account.name)}</b> — <code>${escapeHtml(account.id)}</code>${suffix}`);
    }
  }

  const inline_keyboard = [];

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

function formatChatLine(chat) {
  const title = chat.title ? ` — ${escapeHtml(chat.title)}` : '';
  const thread = chat.thread_id ?? 0;
  return `• <code>${chat.chat_id}</code> · thread <code>${thread}</code>${title}`;
}

function formatChatReference(chat) {
  if (!chat?.chat_id) {
    return 'не привязан';
  }

  const title = chat.title ? ` — ${escapeHtml(chat.title)}` : '';
  const thread = chat.thread_id ?? 0;
  return `<code>${chat.chat_id}</code> · thread <code>${thread}</code>${title}`;
}

async function loadChatRecord(env, chatId, threadId = 0) {
  if (!env.DB || !Number.isFinite(Number(chatId))) {
    return null;
  }

  try {
    const raw = await env.DB.get(getChatKey(chatId, threadId));
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

function normalizeReportFilters(filters = {}) {
  const minSpend = sanitizeMinSpend(filters?.minSpend ?? filters?.min_spend);
  const onlyPositive = Boolean(filters?.onlyPositive ?? filters?.only_positive);
  return { minSpend, onlyPositive };
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
    fields: REPORT_INSIGHTS_FIELDS.join(','),
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

function buildReportRows(insights = [], currency = 'USD') {
  const rows = [];
  const metricShortNames = new Set();
  let totalSpend = 0;
  let totalResults = 0;

  for (const item of insights) {
    const spend = Number(item?.spend) || 0;
    const metric = pickMetricForObjective(item?.objective);
    const results = extractActionCount(item?.actions ?? [], metric.actions);
    const cpa = results > 0 ? spend / results : NaN;
    metricShortNames.add(metric.short);

    rows.push({
      id: item?.campaign_id ?? '—',
      name: item?.campaign_name ?? '—',
      objective: item?.objective ?? '',
      spend,
      results,
      cpa: Number.isFinite(cpa) ? cpa : null,
      metric,
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
    const metricCode = row.metric.short === 'leads' ? 'CPL' : 'CPA';
    return `• <b>${escapeHtml(row.name)}</b> — ${spendLabel} | ${row.metric.label}: ${resultsLabel} | ${metricCode}: ${cpaLabel}`;
  });

  const totalMetricCode = metricShortNames.size === 1 && metricShortNames.has('leads') ? 'CPL' : 'CPA';
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

function buildReportMessage(project, range, reportData, currency = 'USD') {
  const header = `#${escapeHtml(project.code)}\n<b>Отчёт</b> (${range.since}–${range.until})`;
  const body = reportData.lines.length ? reportData.lines.join('\n') : 'Данных за период не найдено.';
  const footer = reportData.lines.length ? `\n\n${reportData.totalLine}` : '';
  return `${header}\n${body}${footer}`;
}

function buildDigestMessage(project, range, reportData, currency = 'USD') {
  const totalSpend = reportData.totalSpend;
  const totalResults = reportData.totalResults;
  const totalCpa = reportData.totalCpa;

  const topSpend = reportData.rows[0];
  const bestCpa = reportData.rows
    .filter((row) => Number.isFinite(row.cpa) && row.results > 0)
    .sort((a, b) => a.cpa - b.cpa)[0];

  const lines = [
    `#${escapeHtml(project.code)}`,
    `<b>Дайджест</b> (${range.label})`,
    `Потрачено: ${formatCurrency(totalSpend, currency)} | Результаты: ${formatNumber(totalResults)} | CPA: ${formatCpa(totalCpa, currency)}`,
    '',
    '<b>Инсайты:</b>',
  ];

  if (topSpend) {
    lines.push(`1) Топ по расходу: ${escapeHtml(topSpend.name)} — ${formatCurrency(topSpend.spend, currency)}`);
  } else {
    lines.push('1) Топ по расходу: —');
  }

  if (bestCpa) {
    lines.push(`2) Лучший CPA: ${escapeHtml(bestCpa.name)} — ${formatCpa(bestCpa.cpa, currency)}`);
  } else {
    lines.push('2) Лучший CPA: данных нет');
  }

  lines.push('3) Динамика CPA: сравнение будет добавлено вместе с автоархивом отчётов.');

  return lines.join('\n');
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
  },
) {
  const payload = await buildProjectReport(env, project, { period, range, token, currency, filters });
  let delivered = false;
  let archiveKey = null;
  let csvInfo = null;
  let sheetsInfo = null;
  let csvFilename = null;

  if (deliverToChat !== false) {
    await telegramSendToProject(env, project, payload.message, {});
    delivered = true;
  }

  if (sendCsv) {
    try {
      const csvContent = buildReportCsv(project, range, payload, currency);
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

  return {
    payload,
    delivered,
    archiveKey,
    csvInfo,
    sheets: sheetsInfo,
  };
}

async function sendProjectDigest(env, project, { period, range, token, currency }) {
  const insights = await fetchCampaignInsights(env, project, token, range);
  const reportData = buildReportRows(insights, currency);
  const message = buildDigestMessage(project, range, reportData, currency);
  await telegramSendToProject(env, project, message, {});
  return { insightsCount: insights.length };
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
  const appliedFilters = normalizeReportFilters(filters ?? {});
  const filteredInsights = applyReportFilters(insights, appliedFilters);
  const reportData = buildReportRows(filteredInsights, currency);
  const message = buildReportMessage(project, range, reportData, currency);
  return {
    message,
    reportData,
    insights,
    filteredInsights,
    filters: appliedFilters,
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

async function archiveReportRecord(env, project, { payload, period, range, origin, csvFilename }) {
  if (!env.DB || !project?.code) {
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
    message: payload.message ?? '',
  };

  if (csvFilename) {
    record.csv_filename = csvFilename;
  }

  const key = getReportArchiveKey(project.code, Date.now());
  await env.DB.put(key, JSON.stringify(record), { expirationTtl: REPORT_ARCHIVE_TTL_SECONDS });
  return key;
}

async function loadAutopauseState(env, code) {
  if (!env.DB) {
    return { count: 0, last_ymd: null };
  }

  try {
    const raw = await env.DB.get(getAutopauseStreakKey(code));
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
  if (!env.DB) {
    return;
  }

  try {
    await env.DB.put(
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
  if (!env.DB) {
    return false;
  }
  try {
    const value = await env.DB.get(key);
    return Boolean(value);
  } catch (error) {
    console.error('hasReportFlag error', error);
    return false;
  }
}

async function setReportFlag(env, key, ttlSeconds) {
  if (!env.DB) {
    return;
  }
  try {
    await env.DB.put(key, '1', { expirationTtl: ttlSeconds });
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

async function runProjectAlerts(env, project, { token, timezone, hm }) {
  if (!project?.alerts || project.alerts.enabled === false) {
    return;
  }

  if (!project?.act) {
    return;
  }

  const currencyCache = runProjectAlerts.currencyCache || new Map();
  const currency = await resolveProjectCurrency(env, project, currencyCache);

  const tasks = [];

  if (shouldCheckBillingNow(project, hm)) {
    tasks.push(
      runBillingAlert(env, project, { token, timezone }).catch((error) => {
        console.error('billing alert error', project.code, error);
      }),
    );
  }

  if (shouldCheckZeroSpendNow(project, hm)) {
    tasks.push(
      runZeroSpendAlert(env, project, { token, timezone }).catch((error) => {
        console.error('zero-spend alert error', project.code, error);
      }),
    );
  }

  if (shouldRunAnomalyChecksNow(project, hm)) {
    tasks.push(
      runAnomalyAlert(env, project, { token, timezone, hm, currency }).catch((error) => {
        console.error('anomaly alert error', project.code, error);
      }),
    );
    tasks.push(
      runCreativeFatigueAlert(env, project, { token, timezone, hm, currency }).catch((error) => {
        console.error('fatigue alert error', project.code, error);
      }),
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }
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
    return;
  }

  const today = getTodayYmd(timezone);
  const digest = JSON.stringify({ statusCode, disableReason, isPrepay, balance, spendCap, amountSpent });
  const flagKey = getAlertFlagKey(project.code, 'billing', today);

  if (env.DB) {
    const previous = await env.DB.get(flagKey);
    if (previous === digest) {
      return;
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

  if (env.DB) {
    await env.DB.put(flagKey, digest, { expirationTtl: ALERT_DEFAULT_TTL_SECONDS });
  }
}

async function runZeroSpendAlert(env, project, { token, timezone }) {
  const range = getPeriodRange('today', timezone);
  if (!range) {
    return;
  }

  const insights = await fetchCampaignInsights(env, project, token, range);
  const totalSpend = sumSpend(insights);
  if (totalSpend > 0.1) {
    return;
  }

  const campaigns = await fetchActiveCampaigns(env, project, token);
  const active = campaigns.filter(isCampaignEffectivelyActive);
  if (!active.length) {
    return;
  }

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'zero', today);
  if (env.DB) {
    const seen = await env.DB.get(flagKey);
    if (seen) {
      return;
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

  if (env.DB) {
    await env.DB.put(flagKey, '1', { expirationTtl: ALERT_ZERO_TTL_SECONDS });
  }
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
    return;
  }

  alerts.sort((a, b) => b.spend - a.spend);
  const top = alerts.slice(0, 5);

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'anomaly', `${today}:${hm}`);
  if (env.DB) {
    const seen = await env.DB.get(flagKey);
    if (seen) {
      return;
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

  if (env.DB) {
    await env.DB.put(flagKey, '1', { expirationTtl: ALERT_ANOMALY_TTL_SECONDS });
  }
}

async function runCreativeFatigueAlert(env, project, { token, timezone, hm, currency = 'USD' }) {
  const range = getPeriodRange('last_7d', timezone);
  if (!range) {
    return;
  }

  const insights = await fetchCampaignInsights(env, project, token, range);
  if (!insights.length) {
    return;
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
    return;
  }

  fatigued.sort((a, b) => b.freq - a.freq || b.spend - a.spend);
  const top = fatigued.slice(0, 5);

  const today = getTodayYmd(timezone);
  const flagKey = getAlertFlagKey(project.code, 'fatigue', `${today}:${hm}`);
  if (env.DB) {
    const seen = await env.DB.get(flagKey);
    if (seen) {
      return;
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

  if (env.DB) {
    await env.DB.put(flagKey, '1', { expirationTtl: ALERT_ANOMALY_TTL_SECONDS });
  }
}

async function runAutopauseCheck(env, project, { token, timezone, hm }) {
  if (!project?.autopause?.enabled) {
    return;
  }

  if (hm !== AUTOPAUSE_CHECK_TIME) {
    return;
  }

  const kpiCpl = Number(project?.kpi?.cpl);
  if (!Number.isFinite(kpiCpl) || kpiCpl <= 0) {
    return;
  }

  if (!project?.act) {
    return;
  }

  const range = getPeriodRange('yesterday', timezone);
  if (!range) {
    return;
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

  const state = await loadAutopauseState(env, project.code);
  if (state.last_ymd === processedDay) {
    return;
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

  await saveAutopauseState(env, project.code, { count: streak, last_ymd: processedDay });

  const threshold = Number.isFinite(project?.autopause?.days) && project.autopause.days > 0
    ? Number(project.autopause.days)
    : 3;

  if (streak >= threshold) {
    const alertKey = getAutopauseAlertFlagKey(project.code, processedDay);
    if (env.DB) {
      const seen = await env.DB.get(alertKey);
      if (seen) {
        return;
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

    await telegramNotifyAdmins(env, lines.join('\n'));

    if (env.DB) {
      await env.DB.put(alertKey, '1', { expirationTtl: AUTOPAUSE_ALERT_TTL_SECONDS });
    }
  }
}

runAutopauseCheck.currencyCache = new Map();

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

function renderProjectDetails(project, chatRecord) {
  const timesLabel = project.times.length ? project.times.join(', ') : '—';
  const chatInfo = project.chat_id
    ? formatChatReference({
        chat_id: project.chat_id,
        thread_id: project.thread_id ?? 0,
        title: chatRecord?.title ?? null,
      })
    : 'не привязан';

  const lines = [
    `<b>Проект #${escapeHtml(project.code)}</b>`,
    `Аккаунт: <code>${escapeHtml(project.act || '—')}</code>`,
    `Чат: ${chatInfo}`,
  ];

  if (chatRecord?.thread_name) {
    lines.push(`Тема: ${escapeHtml(chatRecord.thread_name)}`);
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
  lines.push(`Оплата: ${escapeHtml(formatDateLabel(project.billing_paid_at))}`);
  lines.push(`Следующая оплата: ${escapeHtml(formatDateLabel(project.billing_next_at))}`);
  const inline_keyboard = [];

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

  inline_keyboard.push([
    { text: '🎯 KPI', callback_data: `proj:kpi:open:${project.code}` },
    { text: '📊 Alerts', callback_data: `proj:alerts:open:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '💵 Оплата', callback_data: `proj:billing:open:${project.code}` },
    { text: '📤 Отчёт', callback_data: `proj:report:open:${project.code}` },
  ]);
  inline_keyboard.push([
    { text: '📦 Кампании', callback_data: `proj:detail:todo:campaigns:${project.code}` },
  ]);
  inline_keyboard.push([{ text: '📋 К списку проектов', callback_data: 'panel:projects:0' }]);
  inline_keyboard.push([{ text: '← В панель', callback_data: 'panel:home' }]);

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
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
      if (!awaitingMinSpend && state.step === 'await_min_spend') {
        awaitingMinSpend = true;
      }
    }
  }

  const timezone = options.timezone || env.DEFAULT_TZ || 'UTC';
  const view = renderReportOptions(project, currentOptions, { timezone, awaitingMinSpend });
  await telegramEditMessage(env, chatId, messageId, view.text, {
    reply_markup: view.reply_markup,
  });

  return { ok: true, project };
}

async function clearPendingReportState(env, uid, code) {
  if (!uid) return;
  const state = await loadUserState(env, uid);
  if (state?.mode === 'report_options' && (!code || state.code === code)) {
    await clearUserState(env, uid);
  }
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
      text: normalizedZero === null ? '✅ Zero-spend выкл' : '🚫 Выключить zero-spend',
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

  const details = renderProjectDetails(project, chatRecord);
  await telegramEditMessage(env, chatId, messageId, details.text, {
    reply_markup: details.reply_markup,
  });

  return { ok: true, project, chatRecord };
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

function renderProjectsPage(items, pagination = {}) {
  const textLines = ['<b>Проекты</b>', ''];

  if (!items.length) {
    textLines.push('Проектов пока нет. Настройте их через мастер в админ-панели.');
  } else {
    items.forEach((rawProject, index) => {
      const project = normalizeProject(rawProject);
      const codeLabel = project.code ? `#${escapeHtml(project.code)}` : 'без кода';
      const actLabel = project.act
        ? `<code>${escapeHtml(project.act)}</code>`
        : '—';
      const chatLabel = project.chat_id
        ? formatChatReference({ chat_id: project.chat_id, thread_id: project.thread_id ?? 0 })
        : 'нет привязки';
      const schedule = escapeHtml(project.times.join(', '));

      textLines.push(
        `• <b>${codeLabel}</b> → act ${actLabel}\n  чат: ${chatLabel}\n  период: ${escapeHtml(project.period)} · ${schedule}`,
      );

      if (index !== items.length - 1) {
        textLines.push('');
      }
    });

    if (pagination.nextCursor) {
      textLines.push('');
      textLines.push('Показаны не все проекты. Нажмите «Далее», чтобы продолжить.');
    }
  }

  const keyboard = [];

  if (items.length) {
    items.forEach((project) => {
      if (!project.code) return;
      keyboard.push([
        { text: `⚙️ ${project.code}`, callback_data: `proj:detail:${project.code}` },
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
    if (env.DB) {
      try {
        const stored = await env.DB.get(getChatKey(chatId, threadId));
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
      const view = renderAccountsPage(env, uid, profileAfter, accounts, { offset: 0 });
      return telegramEditMessage(env, message.chat.id, message.message_id, view.text, {
        reply_markup: view.reply_markup,
      });
    }

    let offset = 0;
    if (action === 'page' && typeof parts[3] === 'string') {
      offset = Math.max(0, Number(parts[3]) || 0);
    }

    const profileCurrent = await loadUserProfile(env, uid);
    const accountsCurrent = await loadUserAccounts(env, uid);
    const view = renderAccountsPage(env, uid, profileCurrent, accountsCurrent, { offset });
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

    const response = renderProjectsPage(result.items, pagination);
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
          payload.message,
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

  if (data.startsWith('proj:detail:todo:')) {
    const [, , , action = '', rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const hints = {
      campaigns: 'Редактор кампаний запланирован вместе с Meta API.',
    };

    const hint = hints[action] ?? 'Раздел в разработке. Следите за обновлениями.';
    await telegramAnswerCallback(env, callbackQuery, hint);
    return { ok: true, placeholder: action };
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
    const chatRecord = project.chat_id
      ? await loadChatRecord(env, project.chat_id, project.thread_id ?? 0)
      : null;

    const details = renderProjectDetails(project, chatRecord);
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

async function handlePortal(request) {
  return html('<p>Портал ещё не реализован. Добавьте read-only отчёт согласно ТЗ.</p>', { status: 501 });
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
      return handleHealth();
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
      return handlePortal(request);
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
