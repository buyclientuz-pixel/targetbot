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

const DEFAULT_ADMIN_IDS = ['7623982602', '573424022'];
const TELEGRAM_TIMEOUT_MS = 9000;
const TELEGRAM_LOG_KEY = 'log:telegram';
const TELEGRAM_LOG_LIMIT = 50;
const CHAT_KEY_PREFIX = 'chat:';
const PROJECT_KEY_PREFIX = 'project:';
const ADMIN_SESSION_KEY_PREFIX = 'admin:session:';
const META_STATUS_KEY = 'meta:status';
const META_TOKEN_KEY = 'meta:token';
const META_OAUTH_STATE_PREFIX = 'meta:oauth:state:';
const META_OAUTH_SESSION_PREFIX = 'meta:oauth:session:';
const META_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const META_OAUTH_SESSION_TTL_SECONDS = 15 * 60;
const META_OAUTH_DEFAULT_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
  'pages_read_engagement',
  'pages_show_list',
];
const META_DEFAULT_GRAPH_VERSION = 'v18.0';
const META_OVERVIEW_MAX_AGE_MS = 2 * 60 * 1000;
const ADMIN_PROJECT_PREVIEW_LIMIT = 6;
const REPORT_STATE_PREFIX = 'report:state:';
const REPORT_DEFAULT_TIME = '10:00';
const REPORT_TOLERANCE_MINUTES = 7;
const REPORT_PRESET_MAP = {
  today: 'today',
  yesterday: 'yesterday',
  week: 'last_7d',
  month: 'this_month',
};
const ALERT_STATE_PREFIX = 'alert:state:';
const ALERT_ZERO_DEFAULT_TIME = '12:00';
const ALERT_BILLING_DEFAULT_TIMES = ['10:00', '14:00', '18:00'];
const ALERT_FREQUENCY_THRESHOLD = 3.5;
const ALERT_CTR_THRESHOLD = 0.5;
const ALERT_CPA_THRESHOLD_MULTIPLIER = 1.2;

function resolveDefaultWebhookUrl(config, { origin = '' } = {}) {
  if (config?.telegramWebhookUrl) {
    return config.telegramWebhookUrl;
  }

  const preferredBase = typeof config?.workerUrl === 'string' ? config.workerUrl.trim() : '';
  const base = (preferredBase || origin || '').replace(/\/+$/, '');
  if (!base) {
    return '';
  }

  const token = typeof config?.botToken === 'string' ? config.botToken : '';
  const shortToken = token.split(':')[0];
  if (shortToken) {
    return `${base}/telegram/${shortToken}`;
  }

  return `${base}/telegram`;
}

function formatUsd(value, { digitsBelowOne = 2, digitsAboveOne = 2 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '';
  }

  const absAmount = Math.abs(amount);
  const minimumFractionDigits = absAmount < 1 ? digitsBelowOne : 0;
  const maximumFractionDigits = absAmount < 1
    ? Math.max(digitsBelowOne, digitsAboveOne, minimumFractionDigits)
    : Math.max(digitsAboveOne, minimumFractionDigits, 2);

  let formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);

  if (absAmount >= 1 && digitsAboveOne === 0) {
    formatted = formatted.replace(/,(\d*?)0+$/, (match, digits) => (digits ? `,${digits}` : ''));
    formatted = formatted.replace(/,$/, '');
  }

  return `${formatted}$`;
}

function formatCpaRange(minValue, maxValue) {
  const min = Number(minValue);
  const max = Number(maxValue);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);

  if (!hasMin && !hasMax) {
    return '';
  }

  const minText = hasMin ? formatUsd(min, { digitsBelowOne: 2, digitsAboveOne: 0 }) : '—';
  const maxText = hasMax ? formatUsd(max, { digitsBelowOne: 2, digitsAboveOne: 0 }) : '—';

  return `${minText} / ${maxText}`;
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const stringValue = typeof value === 'string' ? value.trim() : value;
  if (!stringValue) {
    return null;
  }

  const date = new Date(stringValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDaysUntil(target, { now = new Date(), showSign = true } = {}) {
  const date = parseDateInput(target);
  if (!date) {
    return { label: '—', value: null, overdue: false };
  }

  const nowDate = parseDateInput(now) || new Date();
  const diffMs = date.getTime() - nowDate.getTime();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const overdue = days < 0;
  const absolute = Math.abs(days);
  const prefix = overdue && showSign ? '−' : '';
  const value = overdue ? absolute : days;
  const label = overdue ? `${prefix}${absolute}д` : `${value}д`;
  return { label, value: days, overdue };
}

function determineAccountSignal(account, { daysUntilDue } = {}) {
  const daysValue = typeof daysUntilDue?.value === 'number' ? daysUntilDue.value : null;
  const hasPaymentIssues = Boolean(
    account?.requiresAttention ||
      (Array.isArray(account?.paymentIssues) && account.paymentIssues.length > 0) ||
      account?.paymentIssue,
  );

  if (hasPaymentIssues) {
    return '🔴';
  }

  if (Number.isFinite(daysValue) && daysValue <= 3) {
    return '🟡';
  }

  return '🟢';
}

function generateRandomToken(length = 32) {
  const size = Math.max(16, Math.ceil(length));
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (const byte of bytes) {
    result += alphabet.charAt(byte % alphabet.length);
    if (result.length >= length) {
      break;
    }
  }
  return result.slice(0, length);
}

function buildTelegramTopicUrl(chatId, threadId) {
  if (!chatId || !threadId) {
    return '';
  }

  const chat = String(chatId);
  const thread = String(threadId).trim();
  if (!thread) {
    return '';
  }

  if (/^https?:/i.test(chatId)) {
    return String(chatId);
  }

  const normalized = chat.startsWith('-100') ? chat.slice(4) : chat.replace(/^-/, '');
  if (!normalized) {
    return '';
  }

  return `https://t.me/c/${normalized}/${thread}`;
}

function normalizeProjectIdForCallback(id) {
  const base = String(id ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
  if (!base) {
    return 'project';
  }
  return base.slice(0, 48) || 'project';
}

function parseKeyValueForm(text) {
  if (!text) {
    return new Map();
  }

  const lines = String(text)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const entries = new Map();

  for (const line of lines) {
    const match = line.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const rawKey = match[1]
      .trim()
      .toLowerCase()
      .replace(/[\s/]+/g, '_');
    const value = match[2].trim();
    if (!rawKey) {
      continue;
    }

    entries.set(rawKey, value);
  }

  return entries;
}

function isClearingValue(value) {
  if (value === null || value === undefined) {
    return true;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  return normalized === '' || normalized === '-' || normalized === '—' || normalized === 'null';
}

function normalizeDecimalInput(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .trim()
    .replace(/[\s$€₽₸₴£¥₼₽]+/g, '')
    .replace(',', '.');

  if (!cleaned) {
    return null;
  }

  const candidate = Number.parseFloat(cleaned);
  if (!Number.isFinite(candidate)) {
    return null;
  }

  return candidate;
}

function normalizeBooleanInput(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (['1', 'true', 'yes', 'on', 'y', 'да', 'вкл', 'ok', 'enable', 'enabled'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', 'n', 'нет', 'выкл', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }

  return null;
}

const KPI_KEY_ALIASES = {
  objective: ['objective', 'goal', 'target', 'цел', 'цель', 'тип', 'objective_goal', 'objective_type'],
  cpa: ['cpa', 'target_cpa', 'цпа', 'стоимость', 'стоимость_действия', 'cost_per_action'],
  cpl: ['cpl', 'target_cpl', 'цпл', 'стоимость_лида', 'lead_cost'],
  leadsPerDay: ['leads_per_day', 'leads_day', 'leads', 'lead_per_day', 'lead_day', 'лиды', 'лиды_в_день', 'л/д'],
  dailyBudget: ['daily_budget', 'budget', 'budget_per_day', 'бюджет', 'бюджет_день', 'budget_day', 'дневной_бюджет'],
  currency: ['currency', 'валюта', 'currency_code'],
};

function mapKpiKey(key) {
  if (!key) {
    return null;
  }

  const normalized = key.toLowerCase();
  for (const [target, aliases] of Object.entries(KPI_KEY_ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(alias))) {
      return target;
    }
  }

  return null;
}

function parseKpiFormInput(text) {
  const entries = parseKeyValueForm(text);
  const touched = new Set();
  const values = {};
  const errors = [];

  for (const [rawKey, rawValue] of entries.entries()) {
    const key = mapKpiKey(rawKey);
    if (!key) {
      continue;
    }

    touched.add(key);

    if (isClearingValue(rawValue)) {
      values[key] = null;
      continue;
    }

    if (key === 'objective') {
      values.objective = String(rawValue).trim();
      continue;
    }

    if (key === 'currency') {
      values.currency = String(rawValue).trim().toUpperCase();
      continue;
    }

    const numeric = normalizeDecimalInput(rawValue);
    if (!Number.isFinite(numeric)) {
      errors.push(`Поле ${key} должно быть числом.`);
      continue;
    }

    values[key] = numeric;
  }

  return { values, touched, errors };
}

const SCHEDULE_KEY_ALIASES = {
  cadence: ['cadence', 'frequency', 'type', 'режим', 'частота'],
  times: ['times', 'time', 'hours', 'время', 'часы'],
  periods: ['periods', 'period', 'range', 'ranges', 'периоды', 'период'],
  timezone: ['timezone', 'tz', 'таймзона', 'часовой_пояс', 'zone'],
  quietWeekends: ['quiet_weekends', 'quiet', 'mute_weekends', 'silent', 'weekend_mute', 'тихие', 'тихие_выходные'],
};

function mapScheduleKey(key) {
  if (!key) {
    return null;
  }

  const normalized = key.toLowerCase();
  for (const [target, aliases] of Object.entries(SCHEDULE_KEY_ALIASES)) {
    if (aliases.some((alias) => normalized === alias || normalized.startsWith(alias))) {
      return target;
    }
  }

  return null;
}

function normalizeCadenceValue(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  const map = {
    daily: 'daily',
    ежедневно: 'daily',
    everyday: 'daily',
    будни: 'weekdays',
    weekdays: 'weekdays',
    рабочие: 'weekdays',
    weekends: 'weekends',
    выходные: 'weekends',
    weekly: 'weekly',
    неделя: 'weekly',
    custom: 'custom',
    индивидуально: 'custom',
  };

  if (map[normalized]) {
    return map[normalized];
  }

  return normalized.replace(/\s+/g, '_');
}

function normalizeTimeToken(token) {
  if (!token) {
    return null;
  }

  const base = String(token)
    .trim()
    .replace('.', ':');

  if (!base) {
    return null;
  }

  if (/^\d{1,2}:\d{2}$/.test(base)) {
    const [hoursRaw, minutesRaw] = base.split(':');
    const hours = Number.parseInt(hoursRaw, 10);
    const minutes = Number.parseInt(minutesRaw, 10);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  if (/^\d{3,4}$/.test(base)) {
    const padded = base.padStart(4, '0');
    const hours = Number.parseInt(padded.slice(0, 2), 10);
    const minutes = Number.parseInt(padded.slice(2), 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }
  }

  return null;
}

function timeStringToMinutes(value) {
  const normalized = normalizeTimeToken(value);
  if (!normalized) {
    return null;
  }

  const [hoursRaw, minutesRaw] = normalized.split(':');
  const hours = Number.parseInt(hoursRaw, 10);
  const minutes = Number.parseInt(minutesRaw, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function safeDivision(numerator, denominator) {
  const a = Number(numerator);
  const b = Number(denominator);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return null;
  }
  return a / b;
}

function percentChange(current, previous) {
  const curr = Number(current);
  const prev = Number(previous);
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }
  return (curr - prev) / Math.abs(prev);
}

function formatChangePercent(change, { digits = 0 } = {}) {
  if (!Number.isFinite(change)) {
    return null;
  }

  const percent = Math.abs(change) * 100;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(percent);

  if (change > 0) {
    return `+${formatted}%`;
  }
  if (change < 0) {
    return `−${formatted}%`;
  }
  return `${formatted}%`;
}

function formatDateIsoInTimeZone(date, timezone) {
  const target = parseDateInput(date) || new Date();
  const options = { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' };
  try {
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(target);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${lookup.year}-${lookup.month}-${lookup.day}`;
  } catch (error) {
    console.warn('Failed to format date in timezone', timezone, error);
    return target.toISOString().slice(0, 10);
  }
}

function resolveTimezoneSnapshot(date, timezone) {
  const target = parseDateInput(date) || new Date();
  const options = {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour12: false,
  };

  try {
    const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(target);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const hour = Number.parseInt(lookup.hour ?? '0', 10);
    const minute = Number.parseInt(lookup.minute ?? '0', 10);
    const weekdayToken = String(lookup.weekday ?? '').slice(0, 3).toLowerCase();
    const weekdayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

    return {
      year: lookup.year,
      month: lookup.month,
      day: lookup.day,
      hour,
      minute,
      minutes: hour * 60 + minute,
      weekday: weekdayMap[weekdayToken] ?? null,
      dateIso: `${lookup.year}-${lookup.month}-${lookup.day}`,
      timezone: options.timeZone,
    };
  } catch (error) {
    console.warn('Failed to resolve timezone snapshot', timezone, error);
    return {
      year: String(target.getUTCFullYear()),
      month: String(target.getUTCMonth() + 1).padStart(2, '0'),
      day: String(target.getUTCDate()).padStart(2, '0'),
      hour: target.getUTCHours(),
      minute: target.getUTCMinutes(),
      minutes: target.getUTCHours() * 60 + target.getUTCMinutes(),
      weekday: target.getUTCDay(),
      dateIso: target.toISOString().slice(0, 10),
      timezone: 'UTC',
    };
  }
}

function normalizePeriodToken(token) {
  if (!token) {
    return null;
  }

  const normalized = String(token)
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  const map = {
    today: 'today',
    сегодня: 'today',
    current: 'today',
    yesterday: 'yesterday',
    вчера: 'yesterday',
    week: 'week',
    '7d': 'week',
    '7д': 'week',
    неделя: 'week',
    month: 'month',
    месяц: 'month',
    '30d': 'month',
    mtd: 'mtd',
    'с начала месяца': 'mtd',
    custom: 'custom',
    произвольно: 'custom',
  };

  if (map[normalized]) {
    return map[normalized];
  }

  if (/^\d+d$/.test(normalized)) {
    return normalized;
  }

  return normalized.replace(/\s+/g, '_');
}

function parseScheduleFormInput(text) {
  const entries = parseKeyValueForm(text);
  const touched = new Set();
  const values = {};
  const errors = [];

  for (const [rawKey, rawValue] of entries.entries()) {
    const key = mapScheduleKey(rawKey);
    if (!key) {
      continue;
    }

    touched.add(key);

    if (key === 'quietWeekends') {
      if (isClearingValue(rawValue)) {
        values.quietWeekends = null;
      } else {
        const bool = normalizeBooleanInput(rawValue);
        if (bool === null) {
          errors.push('Поле quietWeekends должно быть «да/нет».');
        } else {
          values.quietWeekends = bool;
        }
      }
      continue;
    }

    if (isClearingValue(rawValue)) {
      values[key] = null;
      continue;
    }

    if (key === 'cadence') {
      values.cadence = normalizeCadenceValue(rawValue);
      continue;
    }

    if (key === 'timezone') {
      values.timezone = String(rawValue).trim();
      continue;
    }

    if (key === 'times') {
      const tokens = String(rawValue)
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean);
      const normalized = [];
      for (const token of tokens) {
        const time = normalizeTimeToken(token);
        if (!time) {
          errors.push(`Некорректное время: ${token}`);
        } else if (!normalized.includes(time)) {
          normalized.push(time);
        }
      }
      values.times = normalized;
      continue;
    }

    if (key === 'periods') {
      const tokens = String(rawValue)
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean);
      const normalized = [];
      for (const token of tokens) {
        const period = normalizePeriodToken(token);
        if (period && !normalized.includes(period)) {
          normalized.push(period);
        }
      }
      values.periods = normalized;
      continue;
    }
  }

  return { values, touched, errors };
}

function applyProjectIdentity(target, projectSnapshot) {
  if (!target || typeof target !== 'object' || !projectSnapshot) {
    return;
  }

  const snapshot = projectSnapshot;
  if (snapshot.id && !target.id) {
    target.id = snapshot.id;
  }
  if (snapshot.code && !target.code) {
    target.code = snapshot.code;
  }
  if (snapshot.name && !target.name) {
    target.name = snapshot.name;
  }
  if (snapshot.adAccountId) {
    target.ad_account_id = target.ad_account_id || snapshot.adAccountId;
    target.meta_account_id = target.meta_account_id || snapshot.adAccountId;
    target.account_id = target.account_id || snapshot.adAccountId;
    target.meta = target.meta || {};
    target.meta.adAccountId = target.meta.adAccountId || snapshot.adAccountId;
    target.meta.accountId = target.meta.accountId || snapshot.adAccountId;
  }
  if (snapshot.chatId || snapshot.threadId) {
    target.chat = target.chat || {};
    if (snapshot.chatId && !target.chat.id) {
      target.chat.id = snapshot.chatId;
    }
    if (snapshot.threadId && !target.chat.thread_id) {
      target.chat.thread_id = snapshot.threadId;
    }
  }
}

function parseMetaCurrency(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = typeof value === 'string' ? value.trim() : value;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (typeof raw === 'string' && raw.includes('.')) {
    return amount;
  }

  return amount / 100;
}

function describeAccountStatus(code) {
  switch (Number(code)) {
    case 1:
      return 'Активен';
    case 2:
      return 'Отключен';
    case 3:
      return 'Проблемы с платежом';
    case 7:
      return 'Требуется оплата';
    case 8:
      return 'Закрывается';
    case 9:
      return 'Закрыт';
    case 101:
      return 'Проверка риска';
    case 102:
      return 'Риск: требуется оплата';
    case 201:
      return 'Подозрение на мошенничество';
    case 202:
      return 'Мошенничество: отключен';
    default:
      return code ? `Статус ${code}` : 'Неизвестно';
  }
}

function describeDisableReason(code) {
  switch (Number(code)) {
    case 0:
      return '';
    case 1:
      return 'Нарушения рекламы';
    case 2:
      return 'Нарушение Integrity';
    case 3:
      return 'IP Review';
    case 4:
      return 'Нарушения политики бизнеса';
    case 5:
      return 'Платёжная активность';
    case 7:
      return 'Непогашенный баланс';
    case 8:
      return 'Подозрительная активность';
    case 9:
      return 'Оспариваемые списания';
    case 10:
      return 'Нарушение платежей';
    case 16:
      return 'Ограничения страны/валюты';
    case 17:
      return 'Требуется подтверждение оплаты';
    default:
      return code ? `Отключено (код ${code})` : '';
  }
}

function derivePaymentStatus(accountStatus, disableReason, spendCapAction) {
  const code = Number(accountStatus);
  if (code === 3 || code === 7) {
    return 'Проблемы с оплатой';
  }
  if (code === 8 || code === 9) {
    return 'Отключено';
  }
  if (disableReason) {
    return 'Ограничения';
  }
  if (spendCapAction && String(spendCapAction).toUpperCase() === 'STOP_DELIVERY') {
    return 'Лимит расхода достигнут';
  }
  return 'Активен';
}

function extractLast4Digits(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/(\d{4})(?!.*\d)/);
  return match ? match[1] : '';
}

function collectCpaSamples(insights) {
  const samples = [];
  if (!Array.isArray(insights)) {
    return samples;
  }

  for (const entry of insights) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const cpa = Number(entry.cpa);
    if (Number.isFinite(cpa)) {
      samples.push(cpa);
    }
    if (Array.isArray(entry.cost_per_action_type)) {
      for (const action of entry.cost_per_action_type) {
        const value = Number(action?.value ?? action?.cost ?? action?.amount);
        if (Number.isFinite(value)) {
          samples.push(value);
        }
      }
    }
  }

  return samples;
}

const LEAD_ACTION_HINTS = ['lead', 'generate_lead', 'complete_registration', 'omni_lead'];

function actionMatches(type, hints = LEAD_ACTION_HINTS) {
  const normalized = String(type ?? '').toLowerCase();
  if (!normalized) {
    return false;
  }

  return hints.some((hint) => normalized === hint || normalized.includes(hint));
}

function sumActionMetric(actions, hints = LEAD_ACTION_HINTS) {
  if (!Array.isArray(actions)) {
    return 0;
  }

  let total = 0;
  for (const action of actions) {
    const type = action?.action_type ?? action?.actionType ?? action?.event_type;
    if (!actionMatches(type, hints)) {
      continue;
    }

    const value = Number(action?.value ?? action?.count ?? action?.amount);
    if (Number.isFinite(value)) {
      total += value;
    }
  }

  return total;
}

function extractCostPerAction(costPerActionList, hints = LEAD_ACTION_HINTS) {
  if (!Array.isArray(costPerActionList)) {
    return null;
  }

  for (const entry of costPerActionList) {
    const type = entry?.action_type ?? entry?.actionType;
    if (!actionMatches(type, hints)) {
      continue;
    }

    const value = Number(entry?.value ?? entry?.cost ?? entry?.amount);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function normalizeCampaignSummary(campaign) {
  if (!campaign || typeof campaign !== 'object') {
    return null;
  }

  const id = campaign.id || '';
  const name = campaign.name || `Campaign ${id}`;
  const status = String(campaign.effective_status || campaign.status || '').toUpperCase();
  const insightEntries = Array.isArray(campaign?.insights?.data) ? campaign.insights.data : [];

  let spendTotal = 0;
  let spendFound = false;
  let leadsTotal = 0;
  let conversionsTotal = 0;
  let lastEntry = null;

  for (const entry of insightEntries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const spend = parseMetaCurrency(entry.spend);
    if (Number.isFinite(spend)) {
      spendTotal += spend;
      spendFound = true;
    }

    leadsTotal += sumActionMetric(entry.actions, LEAD_ACTION_HINTS);
    conversionsTotal += sumActionMetric(entry.action_values, LEAD_ACTION_HINTS);
    lastEntry = entry;
  }

  if (!lastEntry && insightEntries.length > 0) {
    lastEntry = insightEntries[insightEntries.length - 1];
  }

  const spendUsd = spendFound ? spendTotal : null;
  const leads = leadsTotal > 0 ? leadsTotal : null;
  const conversions = conversionsTotal > 0 ? conversionsTotal : null;

  const costFromEntry = lastEntry ? extractCostPerAction(lastEntry.cost_per_action_type, LEAD_ACTION_HINTS) : null;
  const calculatedCpa = Number.isFinite(spendUsd) && Number.isFinite(leads) && leads > 0 ? spendUsd / leads : null;
  const cpaUsd = Number.isFinite(costFromEntry) ? costFromEntry : calculatedCpa;

  const reach = Number(lastEntry?.reach);
  const impressions = Number(lastEntry?.impressions);
  const clicks = Number(lastEntry?.inline_link_clicks ?? lastEntry?.clicks);
  const frequency = Number(lastEntry?.frequency);
  const ctr = Number.isFinite(clicks) && Number.isFinite(impressions) && impressions > 0 ? (clicks / impressions) * 100 : null;
  const dateStart =
    campaign.date_start ||
    campaign.dateStart ||
    lastEntry?.date_start ||
    lastEntry?.dateStart ||
    null;
  const dateStop =
    campaign.date_stop ||
    campaign.dateStop ||
    lastEntry?.date_stop ||
    lastEntry?.dateStop ||
    null;

  return {
    id,
    name,
    status,
    spendUsd: Number.isFinite(spendUsd) ? spendUsd : null,
    leads: Number.isFinite(leads) ? leads : null,
    conversions: Number.isFinite(conversions) ? conversions : null,
    cpaUsd: Number.isFinite(cpaUsd) ? cpaUsd : null,
    reach: Number.isFinite(reach) ? reach : null,
    impressions: Number.isFinite(impressions) ? impressions : null,
    clicks: Number.isFinite(clicks) ? clicks : null,
    frequency: Number.isFinite(frequency) ? frequency : null,
    ctr: Number.isFinite(ctr) ? ctr : null,
    dateStart: dateStart || null,
    dateStop: dateStop || null,
  };
}

function normalizeInsightEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = entry.campaign_id || entry.campaignId || entry.id || '';
  const name = entry.campaign_name || entry.campaignName || entry.name || `Campaign ${id}`;
  const effectiveStatus = entry.campaign_effective_status || entry.effective_status || entry.status;
  const dateStart = entry.date_start || entry.dateStart || null;
  const dateStop = entry.date_stop || entry.dateStop || null;

  return normalizeCampaignSummary({
    id,
    name,
    effective_status: effectiveStatus,
    insights: { data: [entry] },
    date_start: dateStart,
    date_stop: dateStop,
  });
}

function formatInteger(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatFloat(value, { digits = 2 } = {}) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercentage(value, { digits = 1 } = {}) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`;
}

function formatDateLabel(value, { timezone } = {}) {
  const date = parseDateInput(value);
  if (!date) {
    return '';
  }

  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  if (timezone) {
    options.timeZone = timezone;
  }

  try {
    return new Intl.DateTimeFormat('ru-RU', options).format(date);
  } catch (error) {
    console.warn('Failed to format date label', value, error);
    return date.toISOString().slice(0, 10);
  }
}

function extractProjectKpi(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    return null;
  }

  const source =
    rawProject.kpi ||
    rawProject.metrics?.kpi ||
    rawProject.settings?.kpi ||
    rawProject.config?.kpi ||
    null;

  if (!source || typeof source !== 'object') {
    return null;
  }

  const currency =
    source.currency ||
    rawProject.metrics?.currency ||
    rawProject.currency ||
    rawProject.meta?.currency ||
    'USD';

  const parseValue = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  return {
    objective: source.objective || source.goal || source.target || source.type || null,
    cpa: parseValue(source.cpa ?? source.target_cpa ?? source.targetCpa),
    cpl: parseValue(source.cpl ?? source.target_cpl ?? source.targetCpl),
    leadsPerDay: parseValue(source.leads_per_day ?? source.leadsPerDay ?? source.target_leads_per_day),
    dailyBudget: parseValue(source.daily_budget ?? source.dailyBudget ?? source.budget_per_day),
    currency,
  };
}

function formatKpiLines(kpi) {
  if (!kpi) {
    return ['KPI не заданы. Нажмите «🎯 KPI», чтобы настроить цели.'];
  }

  const lines = [];
  if (kpi.objective) {
    lines.push(`Цель: <b>${escapeHtml(String(kpi.objective).toUpperCase())}</b>`);
  }

  if (Number.isFinite(kpi.cpa)) {
    lines.push(`CPA: <b>${formatUsd(kpi.cpa, { digitsBelowOne: 2, digitsAboveOne: 0 })}</b>`);
  } else if (Number.isFinite(kpi.cpl)) {
    lines.push(`CPL: <b>${formatUsd(kpi.cpl, { digitsBelowOne: 2, digitsAboveOne: 0 })}</b>`);
  }

  if (Number.isFinite(kpi.leadsPerDay)) {
    lines.push(`Лидов в день: <b>${formatInteger(kpi.leadsPerDay)}</b>`);
  }

  if (Number.isFinite(kpi.dailyBudget)) {
    const suffix = kpi.currency ? ` ${escapeHtml(kpi.currency)}` : '';
    lines.push(`Бюджет/день: <b>${formatInteger(kpi.dailyBudget)}</b>${suffix}`);
  }

  if (lines.length === 0) {
    lines.push('KPI заполнены не полностью — нажмите «🎯 KPI», чтобы уточнить цели.');
  }

  return lines;
}

function extractScheduleSettings(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    return null;
  }

  const schedule =
    rawProject.schedule ||
    rawProject.reporting?.schedule ||
    rawProject.settings?.schedule ||
    rawProject.config?.schedule ||
    null;

  if (!schedule || typeof schedule !== 'object') {
    return null;
  }

  return {
    cadence: schedule.cadence || schedule.type || schedule.frequency || null,
    times: Array.isArray(schedule.times) ? schedule.times : schedule.time ? [schedule.time] : [],
    periods: Array.isArray(schedule.periods) ? schedule.periods : schedule.range ? [schedule.range] : [],
    timezone: schedule.timezone || schedule.tz || rawProject.timezone || rawProject.tz || null,
    quietWeekends: Boolean(schedule.quiet_weekends ?? schedule.quietWeekends ?? schedule.mute_weekends),
  };
}

function extractReportCampaignFilter(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    return [];
  }

  const reporting = rawProject.reporting || rawProject.settings?.reporting || rawProject.config?.reporting || {};
  const campaigns = reporting.campaigns || reporting.selected || reporting.include || reporting.targets || null;

  if (Array.isArray(campaigns)) {
    return campaigns.map((item) => String(item));
  }

  if (campaigns && typeof campaigns === 'object') {
    if (Array.isArray(campaigns.selected)) {
      return campaigns.selected.map((item) => String(item));
    }
    if (Array.isArray(campaigns.include)) {
      return campaigns.include.map((item) => String(item));
    }
    if (Array.isArray(campaigns.ids)) {
      return campaigns.ids.map((item) => String(item));
    }
  }

  if (Array.isArray(reporting.campaign_ids)) {
    return reporting.campaign_ids.map((item) => String(item));
  }

  return [];
}

function extractPortalTokens(rawProject) {
  const tokens = new Set();

  const visit = (value, depth = 0) => {
    if (!value || depth > 4) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        tokens.add(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (!key) continue;
        if (/token|secret|sig|hash|key/i.test(key)) {
          visit(nested, depth + 1);
        }
      }
    }
  };

  if (rawProject && typeof rawProject === 'object') {
    visit(rawProject.portal);
    visit(rawProject.client_portal);
    visit(rawProject.clientPortal);
    visit(rawProject.client?.portal);
    visit(rawProject.client?.token);
    visit(rawProject.client?.tokens);
    visit(rawProject.tokens?.portal);
    visit(rawProject.tokens?.client);
    visit(rawProject.access?.portal);
    visit(rawProject.portal_token);
    visit(rawProject.portal_tokens);
    visit(rawProject.portal_secret);
    visit(rawProject.portal_sig);
    visit(rawProject.portal_signature);
  }

  return tokens;
}

function formatScheduleLines(schedule, { timezone } = {}) {
  if (!schedule) {
    return ['Расписание ещё не настроено. Нажмите «⚙️ Настройки», чтобы задать время отчётов.'];
  }

  const lines = [];
  const cadenceLabel = schedule.cadence
    ? {
        daily: 'ежедневно',
        weekdays: 'по будням',
        weekends: 'по выходным',
        weekly: 'еженедельно',
        custom: 'по расписанию',
      }[String(schedule.cadence).toLowerCase()] || schedule.cadence
    : 'по расписанию';

  if (schedule.periods && schedule.periods.length > 0) {
    lines.push(`Периоды: ${schedule.periods.map((period) => escapeHtml(String(period))).join(', ')}`);
  }

  if (schedule.times && schedule.times.length > 0) {
    lines.push(`Время: ${schedule.times.map((time) => escapeHtml(String(time))).join(', ')}`);
  }

  lines.push(`Частота: <b>${escapeHtml(cadenceLabel)}</b>`);

  if (schedule.quietWeekends) {
    lines.push('Тихие выходные: <b>включены</b>');
  } else {
    lines.push('Тихие выходные: выключены');
  }

  if (schedule.timezone || timezone) {
    lines.push(`Таймзона: <code>${escapeHtml(schedule.timezone || timezone)}</code>`);
  }

  return lines;
}

function shouldRunScheduleToday(schedule, weekday) {
  if (weekday === null || weekday === undefined) {
    return true;
  }

  const weekend = weekday === 0 || weekday === 6;
  if (schedule?.quietWeekends && weekend) {
    return false;
  }

  const cadence = String(schedule?.cadence || '').toLowerCase();
  if (cadence === 'weekdays') {
    return weekday >= 1 && weekday <= 5;
  }
  if (cadence === 'weekends') {
    return weekend;
  }
  if (cadence === 'weekly') {
    return weekday === 1; // Monday
  }
  return true;
}

function extractAlertSettings(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    return null;
  }

  const alerts = rawProject.alerts || rawProject.settings?.alerts || rawProject.config?.alerts || null;
  if (!alerts || typeof alerts !== 'object') {
    return null;
  }

  return {
    zeroSpend: alerts.zero_spend || alerts.zeroSpend || null,
    billing: alerts.billing || alerts.payment || null,
    anomalies: alerts.anomalies || null,
    creatives: alerts.creatives || alerts.creative_fatigue || null,
  };
}

function formatAlertLines(alerts, { account, campaigns }) {
  const lines = [];

  const zeroSpendActive = Boolean(alerts?.zeroSpend?.enabled ?? alerts?.zeroSpend);
  const billingActive = Boolean(alerts?.billing?.enabled ?? alerts?.billing);
  const anomaliesActive = Boolean(alerts?.anomalies?.enabled ?? alerts?.anomalies);
  const creativesActive = Boolean(alerts?.creatives?.enabled ?? alerts?.creatives);

  if (zeroSpendActive) {
    const checkTime = alerts?.zeroSpend?.time || alerts?.zeroSpend?.hour || '12:00';
    lines.push(`⏰ Нулевой расход: напоминание в ${escapeHtml(String(checkTime))}`);
  }

  if (billingActive) {
    const times = alerts?.billing?.times || alerts?.billing?.hours || ['10:00', '14:00', '18:00'];
    lines.push(`💳 Биллинг: контроль в ${times.map((time) => escapeHtml(String(time))).join(', ')}`);
  }

  if (anomaliesActive) {
    lines.push('📉 Аномалии: мониторинг включён.');
  }

  if (creativesActive) {
    lines.push('🧩 Креативы: отслеживается усталость объявлений.');
  }

  if (lines.length === 0) {
    lines.push('Алерты пока не настроены. Нажмите «⚙️ Настройки», чтобы активировать уведомления.');
  }

  const campaignFatigue = Array.isArray(campaigns)
    ? campaigns.filter(
        (campaign) =>
          Number.isFinite(campaign.frequency) &&
          campaign.frequency > 3.5 &&
          Number.isFinite(campaign.ctr) &&
          campaign.ctr < 0.5,
      )
    : [];

  if (campaignFatigue.length > 0) {
    lines.push(
      `🧩 Усталость креативов: ${campaignFatigue
        .slice(0, 3)
        .map((campaign) => escapeHtml(campaign.name))
        .join(', ')}${campaignFatigue.length > 3 ? '…' : ''}`,
    );
  }

  if (account?.paymentIssues?.length) {
    lines.push(`⚠️ Оплата: ${escapeHtml(account.paymentIssues.join(' • '))}`);
  }

  if (
    account &&
    Number.isFinite(account.spendTodayUsd) &&
    account.spendTodayUsd === 0 &&
    Number.isFinite(account.runningCampaigns) &&
    account.runningCampaigns > 0
  ) {
    lines.push('⚠️ Сегодня расход = 0 при активных кампаниях. Проверьте статусы объявлений.');
  }

  return lines;
}

function normalizeTimeList(values, fallback = []) {
  const source = Array.isArray(values) && values.length > 0 ? values : fallback;
  const normalized = [];
  for (const token of source) {
    const time = normalizeTimeToken(token);
    if (time && !normalized.includes(time)) {
      normalized.push(time);
    }
  }
  return normalized;
}

function collectBillingSignals(account) {
  if (!account || typeof account !== 'object') {
    return { issues: [], statusLabel: '', debtUsd: null, cardLast4: '', fingerprint: '' };
  }

  const issues = [];
  if (Array.isArray(account.paymentIssues)) {
    issues.push(...account.paymentIssues.filter(Boolean));
  }
  if (account.paymentIssue) {
    issues.push(account.paymentIssue);
  }

  const statusLabel = account.paymentStatusLabel || account.statusLabel || account.status || '';
  const debtRaw = account.debtUsd ?? account.debt_usd ?? account.debtUSD ?? account.balance_due_usd ?? null;
  const debtUsd = Number.isFinite(Number(debtRaw)) ? Number(debtRaw) : null;
  const cardLast4 =
    account.defaultPaymentMethodLast4 ||
    account.default_card_last4 ||
    account.card_last4 ||
    account.paymentMethodLast4 ||
    '';

  const fingerprintParts = [];
  if (statusLabel) fingerprintParts.push(statusLabel);
  if (debtUsd !== null) fingerprintParts.push(debtUsd.toFixed(2));
  for (const hint of issues) {
    fingerprintParts.push(String(hint));
  }

  return {
    issues,
    statusLabel,
    debtUsd,
    cardLast4,
    fingerprint: fingerprintParts.join('|'),
  };
}

function buildAlertKeyboard(base, extraRows = []) {
  const inline_keyboard = [];
  if (Array.isArray(extraRows) && extraRows.length > 0) {
    for (const row of extraRows) {
      if (Array.isArray(row) && row.length > 0) {
        inline_keyboard.push(row);
      }
    }
  }

  inline_keyboard.push([
    { text: '📊 Сегодня', callback_data: `${base}:report:today` },
    { text: '⚙️ Настройки', callback_data: `${base}:settings` },
  ]);
  inline_keyboard.push([
    { text: 'Открыть проект', callback_data: `${base}:open` },
    { text: 'Закрыть', callback_data: 'admin:alert:dismiss' },
  ]);

  return { inline_keyboard };
}

function detectCampaignAnomalies(seriesList, { kpiTarget } = {}) {
  const anomalies = [];
  for (const series of seriesList) {
    if (!series || !series.latest || !series.previous) {
      continue;
    }

    const latest = series.latest;
    const previous = series.previous;

    const latestCpa = Number.isFinite(latest.cpaUsd) ? latest.cpaUsd : safeDivision(latest.spendUsd, latest.leads);
    const previousCpa = Number.isFinite(previous.cpaUsd)
      ? previous.cpaUsd
      : safeDivision(previous.spendUsd, previous.leads);
    const cpaChange = percentChange(latestCpa, previousCpa);
    const ctrChange = percentChange(latest.ctr, previous.ctr);
    const impressionsChange = percentChange(latest.impressions, previous.impressions);

    const reasons = [];

    if (Number.isFinite(cpaChange) && cpaChange >= 0.5) {
      const changeText = formatChangePercent(cpaChange, { digits: 0 }) || '+50%';
      const latestText = Number.isFinite(latestCpa)
        ? formatUsd(latestCpa, { digitsBelowOne: 2, digitsAboveOne: 0 })
        : '—';
      reasons.push(`CPL/CPA вырос на ${changeText} (до ${latestText})`);
    }

    if (Number.isFinite(ctrChange) && ctrChange <= -0.4) {
      const changeText = formatChangePercent(ctrChange, { digits: 0 }) || '−40%';
      const latestText = Number.isFinite(latest.ctr)
        ? formatPercentage(latest.ctr, { digits: 1 })
        : '—';
      reasons.push(`CTR упал на ${changeText} (сейчас ${latestText})`);
    }

    if (Number.isFinite(impressionsChange) && impressionsChange <= -0.5) {
      const changeText = formatChangePercent(impressionsChange, { digits: 0 }) || '−50%';
      reasons.push(`Показы сократились на ${changeText}`);
    }

    if (Number.isFinite(latest.frequency) && latest.frequency > ALERT_FREQUENCY_THRESHOLD) {
      reasons.push(`Частота ${latest.frequency.toFixed(1)} (> ${ALERT_FREQUENCY_THRESHOLD})`);
    }

    if (reasons.length === 0) {
      continue;
    }

    anomalies.push({
      id: series.id,
      name: series.name,
      reasons,
      latest,
      previous,
      latestCpa,
      previousCpa,
      kpiTarget: Number.isFinite(kpiTarget) ? kpiTarget : null,
    });
  }

  return anomalies;
}

function detectCreativeFatigue(seriesList, { kpiTarget } = {}) {
  const target = Number.isFinite(kpiTarget) ? kpiTarget : null;
  const fatigued = [];

  if (target === null) {
    return fatigued;
  }

  for (const series of seriesList) {
    if (!series || !series.latest) {
      continue;
    }

    const latest = series.latest;
    const cpa = Number.isFinite(latest.cpaUsd) ? latest.cpaUsd : safeDivision(latest.spendUsd, latest.leads);
    const ctr = Number.isFinite(latest.ctr) ? latest.ctr : null;
    const frequency = Number.isFinite(latest.frequency) ? latest.frequency : null;

    if (!Number.isFinite(cpa) || cpa <= target * ALERT_CPA_THRESHOLD_MULTIPLIER) {
      continue;
    }

    if (frequency === null || frequency <= ALERT_FREQUENCY_THRESHOLD) {
      continue;
    }

    if (ctr === null || ctr >= ALERT_CTR_THRESHOLD) {
      continue;
    }

    fatigued.push({
      id: series.id,
      name: series.name,
      latest,
      cpa,
      ctr,
      frequency,
    });
  }

  return fatigued;
}

function buildCampaignLines(campaigns, { limit = 6 } = {}) {
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return ['Активных кампаний не найдено.'];
  }

  const lines = [];
  const display = campaigns.slice(0, limit);
  for (const campaign of display) {
    const spendText = Number.isFinite(campaign.spendUsd)
      ? formatUsd(campaign.spendUsd, { digitsBelowOne: 2, digitsAboveOne: 2 })
      : '—';
    const leadsText = Number.isFinite(campaign.leads) ? formatInteger(campaign.leads) : '—';
    const cpaText = Number.isFinite(campaign.cpaUsd)
      ? formatUsd(campaign.cpaUsd, { digitsBelowOne: 2, digitsAboveOne: 0 })
      : '—';
    lines.push(`• <b>${escapeHtml(campaign.name)}</b> — ${spendText} | Лиды: ${leadsText} | CPA: ${cpaText}`);
  }

  if (campaigns.length > limit) {
    lines.push(`… и ещё ${formatInteger(campaigns.length - limit)} кампаний`);
  }

  return lines;
}

function buildProjectDetailMessage({ project, account, rawProject, timezone }) {
  const lines = [];
  const title = project?.name || account?.name || project?.id || 'Проект';
  const subtitle = project?.code ? `#${project.code}` : project?.id ? `ID: ${project.id}` : '';

  lines.push(`<b>${escapeHtml(title)}</b>`);
  if (subtitle) {
    lines.push(escapeHtml(subtitle));
  }

  if (project?.chatTitle) {
    lines.push(`Чат: ${escapeHtml(project.chatTitle)}`);
  }

  lines.push('', '<b>Статус Meta</b>');
  const billingCountdown = formatDaysUntil(account?.billingNextAt || project?.billingNextAt);
  const statusEmoji = determineAccountSignal(account, { daysUntilDue: billingCountdown });
  const statusLabel = account?.paymentStatusLabel || account?.statusLabel || account?.status || '—';
  lines.push(`${statusEmoji} ${escapeHtml(statusLabel)}`);
  if (account?.billingDueLabel) {
    lines.push(`До оплаты: ${escapeHtml(account.billingDueLabel)}`);
  } else if (billingCountdown?.label && billingCountdown.label !== '—') {
    lines.push(`До оплаты: ${escapeHtml(billingCountdown.label)}`);
  }
  if (account?.paymentIssues?.length) {
    lines.push(`Проблемы: ${escapeHtml(account.paymentIssues.join(' • '))}`);
  }

  lines.push('', '<b>Финансы</b>');
  const spendToday = Number.isFinite(account?.spendTodayUsd)
    ? account.spendTodayUsd
    : Number.isFinite(project?.metrics?.spendTodayUsd)
    ? project.metrics.spendTodayUsd
    : null;
  lines.push(
    `Потрачено сегодня: <b>${
      Number.isFinite(spendToday) ? formatUsd(spendToday, { digitsBelowOne: 2, digitsAboveOne: 2 }) : '—'
    }</b>`,
  );

  const nextPayment = account?.billingNextAt || project?.billingNextAt || null;
  const nextPaymentLabel = formatDateLabel(nextPayment, { timezone });
  if (nextPaymentLabel) {
    const countdownLabel = billingCountdown?.label && billingCountdown.label !== '—' ? ` (${billingCountdown.label})` : '';
    lines.push(`Дата следующей оплаты: ${escapeHtml(nextPaymentLabel)}${countdownLabel}`);
  }

  if (Number.isFinite(account?.debtUsd) && account.debtUsd !== 0) {
    lines.push(`Долг: <b>${formatUsd(account.debtUsd, { digitsBelowOne: 2, digitsAboveOne: 2 })}</b>`);
  }

  const last4 =
    account?.defaultPaymentMethodLast4 ||
    account?.default_card_last4 ||
    account?.card_last4 ||
    account?.paymentMethodLast4 ||
    null;
  if (last4) {
    lines.push(`Карта по умолчанию: 💳 ****${escapeHtml(String(last4))}`);
  }

  lines.push('', '<b>Актуальные кампании</b>');
  const campaigns = Array.isArray(account?.campaignSummaries) ? account.campaignSummaries : [];
  lines.push(...buildCampaignLines(campaigns));

  const cpaRange = formatCpaRange(account?.cpaMinUsd, account?.cpaMaxUsd);
  if (cpaRange) {
    lines.push(`CPA (7д): ${cpaRange}`);
  }

  const kpi = extractProjectKpi(rawProject);
  lines.push('', '<b>KPI</b>', ...formatKpiLines(kpi));

  const schedule = extractScheduleSettings(rawProject);
  lines.push('', '<b>Расписание</b>', ...formatScheduleLines(schedule, { timezone }));

  const alerts = extractAlertSettings(rawProject);
  lines.push('', '<b>Алерты</b>', ...formatAlertLines(alerts, { account, campaigns }));

  return { text: lines.join('\n'), campaigns, kpi };
}

function formatReportPresetLabel(preset) {
  switch (preset) {
    case 'today':
      return 'Сегодня';
    case 'yesterday':
      return 'Вчера';
    case 'week':
      return 'Последние 7 дней';
    case 'month':
      return 'С начала месяца';
    default:
      return 'Период';
  }
}

function resolveReportRange(preset, { since, until, timezone } = {}) {
  const normalized = String(preset || '').toLowerCase();
  const datePreset = REPORT_PRESET_MAP[normalized] || null;
  const range = { preset: normalized || null, timezone: timezone || null };

  if (datePreset) {
    range.datePreset = datePreset;
    range.label = formatReportPresetLabel(normalized);
    return range;
  }

  if (since && until) {
    range.since = formatDateIsoInTimeZone(since, timezone);
    range.until = formatDateIsoInTimeZone(until, timezone);
    range.label = `${formatDateLabel(range.since, { timezone })} — ${formatDateLabel(range.until, {
      timezone,
    })}`.replace(/\s+—\s+$/, '');
    return range;
  }

  return range;
}

function parseCustomDateRangeInput(text, { timezone } = {}) {
  if (!text) {
    return { errors: ['Укажите даты в формате YYYY-MM-DD YYYY-MM-DD.'], range: null };
  }

  const tokens = String(text)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length < 2) {
    return { errors: ['Нужно указать две даты: начало и конец периода.'], range: null };
  }

  const normalize = (token) => {
    if (!token) return null;
    const cleaned = token.replace(/[.,]/g, '-');
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned;
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(cleaned)) {
      const [day, month, year] = cleaned.split('-');
      return `${year}-${month}-${day}`;
    }
    return null;
  };

  const sinceRaw = normalize(tokens[0]);
  const untilRaw = normalize(tokens[1]);
  const errors = [];

  if (!sinceRaw || !parseDateInput(sinceRaw)) {
    errors.push('Не удалось распознать дату начала. Формат: YYYY-MM-DD.');
  }
  if (!untilRaw || !parseDateInput(untilRaw)) {
    errors.push('Не удалось распознать дату окончания. Формат: YYYY-MM-DD.');
  }

  if (errors.length > 0) {
    return { errors, range: null };
  }

  const sinceIso = formatDateIsoInTimeZone(sinceRaw, timezone);
  const untilIso = formatDateIsoInTimeZone(untilRaw, timezone);
  if (sinceIso > untilIso) {
    errors.push('Дата начала не может быть позже даты окончания.');
    return { errors, range: null };
  }

  const range = resolveReportRange(null, { since: sinceIso, until: untilIso, timezone });
  range.label = `${formatDateLabel(sinceIso, { timezone })} — ${formatDateLabel(untilIso, { timezone })}`;
  range.since = sinceIso;
  range.until = untilIso;
  return { errors, range };
}

function buildReportKpiLine(kpi, { totalSpend, totalLeads, totalDailyBudget }) {
  if (!kpi) {
    return null;
  }

  const parts = [];
  if (Number.isFinite(kpi.cpl) || Number.isFinite(kpi.cpa)) {
    const target = Number.isFinite(kpi.cpl) ? kpi.cpl : kpi.cpa;
    const label = Number.isFinite(kpi.cpl) ? 'CPL' : 'CPA';
    const actual = Number.isFinite(totalLeads) && totalLeads > 0 ? totalSpend / totalLeads : null;
    const ok = Number.isFinite(actual) ? actual <= target : false;
    const emoji = ok ? '✅' : '⚠️';
    parts.push(`${label}≤${formatUsd(target, { digitsBelowOne: 2, digitsAboveOne: 0 })} ${emoji}`);
  }

  if (Number.isFinite(kpi.leadsPerDay)) {
    const ok = Number.isFinite(totalLeads) ? totalLeads >= kpi.leadsPerDay : false;
    const emoji = ok ? '✅' : '⚠️';
    parts.push(`Л/д≥${formatInteger(kpi.leadsPerDay)} ${emoji}`);
  }

  if (Number.isFinite(kpi.dailyBudget)) {
    const ok = Number.isFinite(totalDailyBudget) ? totalDailyBudget <= kpi.dailyBudget : true;
    const emoji = ok ? '✅' : '⚠️';
    parts.push(`Бюд/д≤${formatInteger(kpi.dailyBudget)} ${emoji}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return `KPI: ${parts.join(' | ')}`;
}

function buildProjectReportPreview({ project, account, rawProject, preset, report }) {
  const lines = [];
  const codeLine = project?.code ? `#${project.code}` : project?.id ? `#${project.id}` : null;
  if (codeLine) {
    lines.push(escapeHtml(codeLine));
  }

  const periodLabel = report?.range?.label || formatReportPresetLabel(preset);
  lines.push(`<b>Отчёт</b> (${escapeHtml(periodLabel)})`);

  const campaigns = Array.isArray(report?.campaigns)
    ? report.campaigns
    : Array.isArray(account?.campaignSummaries)
    ? account.campaignSummaries
    : [];
  let totalSpendComputed = 0;
  let totalLeadsComputed = 0;

  if (campaigns.length === 0) {
    lines.push('• Данных по кампаниям пока нет.');
  } else {
    for (const campaign of campaigns) {
      const spend = Number.isFinite(campaign.spendUsd) ? campaign.spendUsd : null;
      const leads = Number.isFinite(campaign.leads) ? campaign.leads : null;
      if (Number.isFinite(spend)) {
        totalSpendComputed += spend;
      }
      if (Number.isFinite(leads)) {
        totalLeadsComputed += leads;
      }

      const spendText = Number.isFinite(spend)
        ? formatUsd(spend, { digitsBelowOne: 2, digitsAboveOne: 2 })
        : '—';
      const leadsText = Number.isFinite(leads) ? formatInteger(leads) : '—';
      const cpl = Number.isFinite(spend) && Number.isFinite(leads) && leads > 0 ? spend / leads : null;
      const cplText = Number.isFinite(cpl)
        ? formatUsd(cpl, { digitsBelowOne: 2, digitsAboveOne: 0 })
        : '—';
      lines.push(`• <b>${escapeHtml(campaign.name)}</b> — ${spendText} | Лиды: ${leadsText} | CPL: ${cplText}`);
    }
  }

  const totalSpend = Number.isFinite(report?.totals?.spendUsd) ? report.totals.spendUsd : totalSpendComputed;
  const totalLeads = Number.isFinite(report?.totals?.leads) ? report.totals.leads : totalLeadsComputed;
  const totalCpl = Number.isFinite(report?.totals?.cpaUsd)
    ? report.totals.cpaUsd
    : Number.isFinite(totalSpend) && Number.isFinite(totalLeads) && totalLeads > 0
    ? totalSpend / totalLeads
    : null;

  const totalSpendText = Number.isFinite(totalSpend)
    ? formatUsd(totalSpend, { digitsBelowOne: 2, digitsAboveOne: 2 })
    : '—';
  const totalLeadsText = Number.isFinite(totalLeads) ? formatInteger(totalLeads) : '—';
  const totalCplText = Number.isFinite(totalCpl)
    ? formatUsd(totalCpl, { digitsBelowOne: 2, digitsAboveOne: 0 })
    : '—';

  lines.push(`<b>ИТОГО:</b> ${totalSpendText} | Лиды: ${totalLeadsText} | CPL: ${totalCplText}`);

  const kpi = extractProjectKpi(rawProject);
  const kpiLine = buildReportKpiLine(kpi, {
    totalSpend,
    totalLeads,
    totalDailyBudget: Number.isFinite(account?.spendTodayUsd) ? account.spendTodayUsd : totalSpend,
  });

  if (kpiLine) {
    lines.push(kpiLine);
  }

  if (Number.isFinite(report?.totals?.reach) || Number.isFinite(report?.totals?.impressions)) {
    const reachText = Number.isFinite(report?.totals?.reach) ? formatInteger(report.totals.reach) : '—';
    const impressionsText = Number.isFinite(report?.totals?.impressions)
      ? formatInteger(report.totals.impressions)
      : '—';
    const clicksText = Number.isFinite(report?.totals?.clicks)
      ? formatInteger(report.totals.clicks)
      : '—';
    lines.push(`Охват: ${reachText} | Показы: ${impressionsText} | Клики: ${clicksText}`);
  }

  return { text: lines.join('\n'), campaigns };
}

function buildProjectDetailKeyboard(base, { chatUrl } = {}) {
  const keyboard = [];
  keyboard.push([
    { text: '📊 Сегодня', callback_data: `${base}:report:today` },
    { text: '📅 Вчера', callback_data: `${base}:report:yesterday` },
    { text: '🗓 7 дней', callback_data: `${base}:report:week` },
  ]);
  keyboard.push([
    { text: '📆 Месяц', callback_data: `${base}:report:month` },
    { text: '📍 Диапазон', callback_data: `${base}:report:custom` },
    { text: '📄 CSV', callback_data: `${base}:report:csv` },
  ]);
  keyboard.push([
    { text: '📈 Сводный отчёт', callback_data: `${base}:digest` },
    { text: '🎯 KPI', callback_data: `${base}:kpi` },
    { text: '⏸ Автопауза', callback_data: `${base}:autopause` },
  ]);
  keyboard.push([
    { text: '⚙️ Настройки', callback_data: `${base}:settings` },
    { text: '💳 Оплата', callback_data: `${base}:payment` },
    chatUrl ? { text: '💬 Чат', url: chatUrl } : { text: '💬 Чат', callback_data: `${base}:chat` },
  ]);
  keyboard.push([
    { text: '🔁 Обновить', callback_data: `${base}:refresh` },
    { text: '⬅️ В админку', callback_data: 'admin:panel' },
  ]);

  return { inline_keyboard: keyboard };
}

function buildProjectReportKeyboard(base) {
  return {
    inline_keyboard: [
      [
        { text: 'Сегодня', callback_data: `${base}:report:today` },
        { text: 'Вчера', callback_data: `${base}:report:yesterday` },
        { text: '7 дней', callback_data: `${base}:report:week` },
      ],
      [
        { text: 'Месяц', callback_data: `${base}:report:month` },
        { text: 'Диапазон', callback_data: `${base}:report:custom` },
        { text: 'CSV', callback_data: `${base}:report:csv` },
      ],
      [
        { text: '📈 Сводный отчёт', callback_data: `${base}:digest` },
        { text: '⬅️ К проекту', callback_data: `${base}:open` },
      ],
    ],
  };
}

function cloneMetaStatus(status) {
  if (!status || typeof status !== 'object') {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(status));
  } catch (error) {
    console.warn('Failed to clone meta status', error);
    return { ...status };
  }
}

function pickMetaStatus(envStatus) {
  if (!envStatus || typeof envStatus !== 'object') {
    return null;
  }
  return envStatus;
}

function buildMetaAdminSection(metaStatus, { timezone } = {}) {
  const section = [];
  const status = pickMetaStatus(metaStatus) || {};
  const message = typeof status.message === 'string' ? status.message.trim() : '';
  if (message) {
    section.push(`Сообщение: ${escapeHtml(message)}`);
  }

  section.push('<b>Facebook</b>');

  const facebook = status.facebook && typeof status.facebook === 'object' ? status.facebook : {};
  const connected = Boolean(facebook.connected);
  const connectionEmoji = connected ? '🟢' : '🔴';
  section.push(`Статус: ${connectionEmoji} ${connected ? 'Подключено' : 'Не подключено'}`);

  if (!connected && !facebook.error && (!Array.isArray(facebook.adAccounts) || facebook.adAccounts.length === 0)) {
    section.push('Данные Meta ещё не загружены.');
  }

  if (facebook.stale) {
    section.push('⚠️ Данные требуют обновления — показаны сохранённые значения.');
  }

  if (facebook.error) {
    section.push(`Ошибка Meta: ${escapeHtml(String(facebook.error))}`);
  }

  if (facebook.accountName) {
    section.push(`Аккаунт: <b>${escapeHtml(facebook.accountName)}</b>`);
  }

  if (facebook.accountId) {
    section.push(`ID: <code>${escapeHtml(facebook.accountId)}</code>`);
  }

  const adAccounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
  section.push(`Рекламных аккаунтов: <b>${adAccounts.length}</b>`);

  for (const account of adAccounts) {
    const accountLines = buildMetaAdAccountLines(account);
    if (accountLines.length > 0) {
      section.push(...accountLines);
    }
  }

  const updatedAt = facebook.updatedAt || facebook.updated_at;
  if (updatedAt) {
    section.push(`Обновлено: ${escapeHtml(formatTimestamp(updatedAt, timezone))}`);
  }

  return section;
}

function buildMetaAdAccountLines(account) {
  if (!account || typeof account !== 'object') {
    return [];
  }

  const lines = [];
  const name = account.name || account.id || 'Рекламный аккаунт';
  const statusText =
    account.statusLabel || account.status_label || account.paymentStatusLabel || account.status || '';
  const issueHints = [];
  if (account.paymentIssues && Array.isArray(account.paymentIssues)) {
    issueHints.push(...account.paymentIssues.filter(Boolean));
  }
  if (account.paymentIssue) {
    issueHints.push(account.paymentIssue);
  }
  if (account.blockReason || account.block_reason) {
    issueHints.push(account.blockReason || account.block_reason);
  }
  if (account.debtComment || account.debt_comment) {
    issueHints.push(account.debtComment || account.debt_comment);
  }

  const requiresAttention = Boolean(
    account.requiresAttention ||
      account.paymentIssue ||
      account.paymentIssues?.length ||
      account.blocked ||
      /payment/i.test(String(account.status || '')),
  );
  const badge = requiresAttention ? '⚠️' : '✅';
  const headerDetails = [statusText, issueHints.length ? issueHints.join(' • ') : '']
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' • ');
  const headerSuffix = headerDetails ? ` — ${escapeHtml(headerDetails)}` : '';
  lines.push(`• ${badge} <b>${escapeHtml(name)}</b>${headerSuffix}`);

  const last4 =
    account.defaultPaymentMethodLast4 ||
    account.default_card_last4 ||
    account.card_last4 ||
    account.paymentMethodLast4;
  if (last4) {
    lines.push(`  ◦ 💳 ****${escapeHtml(String(last4))}`);
  }

  const debt =
    account.debtUsd ?? account.debt_usd ?? account.debtUSD ?? account.debt ?? account.balance_due_usd;
  if (Number.isFinite(Number(debt)) && Number(debt) !== 0) {
    lines.push(`  ◦ Долг: <b>${formatUsd(Number(debt), { digitsBelowOne: 2, digitsAboveOne: 2 })}</b>`);
  }

  const running = account.runningCampaigns ?? account.campaignsRunning ?? account.activeCampaigns;
  const cpaMin = account.cpaMinUsd ?? account.cpaMin ?? account.cpa_min_usd ?? account.cpa_min;
  const cpaMax = account.cpaMaxUsd ?? account.cpaMax ?? account.cpa_max_usd ?? account.cpa_max;
  const cpaRange = formatCpaRange(cpaMin, cpaMax);
  if (Number.isFinite(Number(running)) || cpaRange) {
    const runningText = Number.isFinite(Number(running)) ? `<b>${Number(running)}</b>` : '<b>0</b>';
    const cpaText = cpaRange ? ` (CPA: ${cpaRange})` : '';
    lines.push(`  ◦ Кампании: ${runningText}${cpaText}`);
  }

  return lines;
}

function normalizeProjectRecord(key, raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: key.replace(PROJECT_KEY_PREFIX, ''),
      key,
      name: key.replace(PROJECT_KEY_PREFIX, ''),
      adAccountId: '',
    };
  }

  const keyId = key.replace(PROJECT_KEY_PREFIX, '');
  const meta = raw.meta || {};
  const billing = raw.billing || {};
  const metrics = raw.metrics || {};
  const chat = raw.chat || raw.telegram || raw.telegram_chat || {};

  const projectId = raw.id || raw.code || raw.project_id || keyId;
  const adAccountId =
    raw.meta_account_id ||
    raw.ad_account_id ||
    raw.account_id ||
    meta.adAccountId ||
    meta.accountId ||
    raw.facebook_account_id ||
    '';

  const chatId =
    chat.id ||
    chat.chat_id ||
    raw.chat_id ||
    raw.telegram_chat_id ||
    raw.telegram_chat ||
    raw.telegram_chat_id ||
    null;
  const threadId =
    chat.thread_id ||
    chat.topic_id ||
    raw.thread_id ||
    raw.topic_id ||
    raw.telegram_topic_id ||
    null;
  const chatUrl = chat.url || raw.chat_url || raw.telegram_chat_url || buildTelegramTopicUrl(chatId, threadId);

  return {
    id: projectId,
    key,
    code: raw.code || raw.slug || raw.short_code || '',
    name: raw.name || raw.title || meta.projectName || meta.accountName || `Проект ${projectId}`,
    description: raw.description || '',
    adAccountId: adAccountId ? String(adAccountId) : '',
    chatId: chatId ? String(chatId) : '',
    threadId: threadId ? String(threadId) : '',
    chatTitle: chat.title || chat.chat_title || raw.chat_title || '',
    chatUrl,
    billingNextAt:
      billing.next_payment_at ||
      billing.next_payment_due_at ||
      raw.billing_next_at ||
      raw.billing_due_at ||
      raw.next_payment_at ||
      null,
    metrics: {
      spendTodayUsd: metrics.spend_today_usd ?? raw.spend_today_usd ?? null,
      currency: metrics.currency || raw.currency || null,
    },
    statusNote: raw.status_note || raw.status || '',
  };
}

function buildProjectSummaries(projectRecords, metaStatus, { timezone } = {}) {
  const projects = Array.isArray(projectRecords) ? projectRecords : [];
  const status = pickMetaStatus(metaStatus) || {};
  const facebook = status.facebook && typeof status.facebook === 'object' ? status.facebook : {};
  const accounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
  const accountById = new Map();
  for (const account of accounts) {
    if (!account || typeof account !== 'object') continue;
    const accountId = account.accountId || account.id;
    if (accountId) {
      accountById.set(String(accountId), account);
    }
  }

  const now = new Date();
  const summaries = [];

  for (const record of projects) {
    if (!record) continue;
    const account = record.adAccountId ? accountById.get(String(record.adAccountId)) : null;
    const spendUsd =
      (account && Number.isFinite(Number(account.spendTodayUsd)) ? Number(account.spendTodayUsd) : null) ??
      (Number.isFinite(Number(record.metrics?.spendTodayUsd)) ? Number(record.metrics.spendTodayUsd) : null);

    const currency = account?.currency || record.metrics?.currency || 'USD';
    const billingSource = record.billingNextAt || account?.billingNextAt || account?.billing_next_at;
    const daysUntil = formatDaysUntil(billingSource, { now });
    const statusEmoji = determineAccountSignal(account, { daysUntilDue: daysUntil });
    const accountStatusLabel =
      account?.paymentStatusLabel || account?.statusLabel || account?.status || record.statusNote || '—';
    const paymentIssues = [];
    if (Array.isArray(account?.paymentIssues)) {
      paymentIssues.push(...account.paymentIssues.filter(Boolean));
    }
    if (account?.paymentIssue) {
      paymentIssues.push(account.paymentIssue);
    }
    if (record.statusNote) {
      paymentIssues.push(record.statusNote);
    }

    const debt = Number.isFinite(Number(account?.debtUsd)) ? Number(account.debtUsd) : null;
    const cardLast4 =
      account?.defaultPaymentMethodLast4 ||
      account?.default_card_last4 ||
      account?.card_last4 ||
      account?.paymentMethodLast4 ||
      '';

    const campaignsRunning = Number.isFinite(Number(account?.runningCampaigns))
      ? Number(account.runningCampaigns)
      : null;
    const cpaRange = formatCpaRange(account?.cpaMinUsd, account?.cpaMaxUsd);

    const headerParts = [
      record.name || (account?.name ?? record.id),
      spendUsd !== null ? formatUsd(spendUsd, { digitsBelowOne: 2, digitsAboveOne: 2 }) : '—',
      daysUntil.label,
    ];

    const lines = [];
    lines.push(`<b>${escapeHtml(headerParts.join(' | '))}</b>`);
    lines.push(`Статус: ${statusEmoji} ${escapeHtml(accountStatusLabel)}`);

    if (cardLast4) {
      lines.push(`Оплата: 💳 ****${escapeHtml(String(cardLast4))}`);
    }

    if (debt !== null && debt !== 0) {
      lines.push(`Долг: <b>${formatUsd(debt, { digitsBelowOne: 2, digitsAboveOne: 2 })}</b>`);
    }

    if (campaignsRunning !== null || cpaRange) {
      const campaignsText = campaignsRunning !== null ? `${campaignsRunning}` : '0';
      const suffix = cpaRange ? ` | CPA: ${cpaRange}` : '';
      lines.push(`Кампании: <b>${campaignsText}</b>${suffix}`);
    }

    if (paymentIssues.length > 0) {
      lines.push(`Проблемы: ${escapeHtml(paymentIssues.join(' • '))}`);
    }

    if (record.chatTitle) {
      lines.push(`Чат: ${escapeHtml(record.chatTitle)}`);
    }

    if (record.code) {
      lines.push(`Код проекта: <code>${escapeHtml(record.code)}</code>`);
    }

    summaries.push({
      id: record.id,
      callbackId: normalizeProjectIdForCallback(record.id),
      chatUrl: record.chatUrl || '',
      lines,
      daysUntil,
      spendUsd,
      currency,
    });
  }

  if (summaries.length === 0 && accounts.length > 0) {
    for (const account of accounts) {
      if (!account) continue;
      const daysUntil = formatDaysUntil(account.billingNextAt || account.billing_next_at, { now });
      const statusEmoji = determineAccountSignal(account, { daysUntilDue: daysUntil });
      const header = [
        account.name || account.id || 'Рекламный аккаунт',
        account.spendTodayUsd !== null && account.spendTodayUsd !== undefined
          ? formatUsd(Number(account.spendTodayUsd), { digitsBelowOne: 2, digitsAboveOne: 2 })
          : '—',
        daysUntil.label,
      ];
      const lines = [];
      lines.push(`<b>${escapeHtml(header.join(' | '))}</b>`);
      const statusLabel = account.paymentStatusLabel || account.statusLabel || account.status || '—';
      lines.push(`Статус: ${statusEmoji} ${escapeHtml(statusLabel)}`);
      summaries.push({
        id: account.accountId || account.id,
        callbackId: normalizeProjectIdForCallback(account.accountId || account.id),
        chatUrl: '',
        lines,
        daysUntil,
      });
    }
  }

  return summaries;
}

function renderAdminDashboard({
  metaStatus,
  projectSummaries,
  webhook,
  totals,
  timezone,
}) {
  const lines = ['<b>Админ-панель</b>'];
  const status = pickMetaStatus(metaStatus) || {};
  const message = typeof status.message === 'string' ? status.message.trim() : '';
  if (message) {
    lines.push('', `Сообщение: ${escapeHtml(message)}`);
  }

  const facebook = status.facebook && typeof status.facebook === 'object' ? status.facebook : {};
  const connected = Boolean(facebook.connected);
  const connectionEmoji = connected ? '🟢' : '🔴';
  const accountLabel = facebook.accountName || (connected ? 'Подключено' : 'Нет данных');
  lines.push('', '<b>Facebook</b>');
  lines.push(`Статус: ${connectionEmoji} ${escapeHtml(accountLabel)}`);
  if (facebook.accountId) {
    lines.push(`ID: <code>${escapeHtml(facebook.accountId)}</code>`);
  }

  const adAccounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
  lines.push(`Рекламных аккаунтов: <b>${adAccounts.length}</b>`);
  const attention = adAccounts.filter((account) => determineAccountSignal(account, { daysUntilDue: { value: account.billingDueInDays ?? null } }) === '🔴');
  if (attention.length > 0) {
    lines.push(`Требуют внимания: <b>${attention.length}</b>`);
  }

  if (facebook.error) {
    lines.push(`Ошибка: ${escapeHtml(String(facebook.error))}`);
  }

  if (facebook.stale) {
    lines.push('⚠️ Показаны сохранённые данные.');
  }

  if (facebook.updatedAt || facebook.updated_at) {
    lines.push(
      `Обновлено: ${escapeHtml(
        formatTimestamp(facebook.updatedAt || facebook.updated_at, timezone),
      )}`,
    );
  }

  lines.push('', `<b>Проекты (${totals.projects})</b>`);
  if (projectSummaries.length === 0) {
    lines.push('Проекты ещё не настроены. Используйте меню ниже, чтобы подключить первый проект.');
  } else {
    for (const summary of projectSummaries) {
      lines.push('', ...summary.lines);
    }
  }

  if (webhook) {
    const webhookLines = [];
    const webhookActive = Boolean(webhook?.info?.url);
    webhookLines.push(`Вебхук: ${webhookActive ? '🟢' : '🔴'} ${
      webhookActive ? `<code>${escapeHtml(webhook.info.url)}</code>` : 'не настроен'
    }`);
    if (webhook?.info?.pending_update_count) {
      webhookLines.push(`В очереди: <b>${webhook.info.pending_update_count}</b>`);
    }
    if (webhook?.defaultUrl && (!webhookActive || webhook.info.url !== webhook.defaultUrl)) {
      webhookLines.push(`Рекомендуемый URL: <code>${escapeHtml(webhook.defaultUrl)}</code>`);
    }
    if (webhook?.error) {
      webhookLines.push(`Ошибка: ${escapeHtml(webhook.error)}`);
    }
    if (webhook?.ensured) {
      webhookLines.push('Автоматическое подключение выполнено ✅');
    }
    if (webhookLines.length > 0) {
      lines.push('', '<b>Telegram</b>', ...webhookLines);
    }
  }

  if (typeof totals.chats === 'number') {
    lines.push('', `Зарегистрированных чатов: <b>${totals.chats}</b>`);
  }

  return lines.join('\n');
}

function resolvePortalKpiMeta(kpi) {
  if (kpi && typeof kpi === 'object') {
    if (Number.isFinite(kpi.cpl)) {
      return { label: 'CPL', target: Number(kpi.cpl) };
    }
    if (Number.isFinite(kpi.cpa)) {
      return { label: 'CPA', target: Number(kpi.cpa) };
    }
  }
  return { label: 'CPA', target: null };
}

function selectPortalTopCampaigns(report, { limit = 3 } = {}) {
  const campaigns = Array.isArray(report?.campaigns) ? report.campaigns.slice() : [];
  campaigns.sort((a, b) => (b?.spendUsd ?? 0) - (a?.spendUsd ?? 0));

  return campaigns.slice(0, Math.max(0, limit)).map((campaign) => {
    const spendText = formatUsd(campaign?.spendUsd, { digitsBelowOne: 2, digitsAboveOne: 2 }) || '—';
    const cost = Number.isFinite(campaign?.cpaUsd)
      ? Number(campaign.cpaUsd)
      : safeDivision(campaign?.spendUsd, campaign?.leads);
    const costText = Number.isFinite(cost)
      ? formatUsd(cost, { digitsBelowOne: 2, digitsAboveOne: 2 }) || '—'
      : '—';

    return {
      id: campaign?.id || '',
      name: campaign?.name || (campaign?.id ? `Campaign ${campaign.id}` : 'Campaign'),
      spendText,
      costText,
    };
  });
}

function renderClientPortalPage({
  project,
  account,
  periods,
  timezone,
  generatedAt,
  managerLink,
  currency,
  kpi,
  insights = [],
  signature = '',
  csvLinks = [],
  feedbackStatus = '',
}) {
  const projectName = escapeHtml(project?.name || 'Проект');
  const projectCode = project?.code ? `<span class="project-code">#${escapeHtml(project.code)}</span>` : '';
  const currencyLabel = escapeHtml(currency || account?.currency || project?.metrics?.currency || 'USD');
  const snapshot = resolveTimezoneSnapshot(generatedAt, timezone);
  const updatedLabel = snapshot
    ? `${snapshot.day}.${snapshot.month}.${snapshot.year} ${String(snapshot.hour).padStart(2, '0')}:${String(snapshot.minute).padStart(2, '0')} (${escapeHtml(snapshot.timezone)})`
    : escapeHtml(new Date(generatedAt).toISOString());

  const billingSource =
    project?.billingNextAt ||
    account?.billingNextAt ||
    account?.billing_next_at ||
    account?.next_payment_date ||
    null;
  const billingCountdown = formatDaysUntil(billingSource, { now: generatedAt, showSign: false });
  const billingDateLabel = billingSource ? formatDateLabel(billingSource, { timezone }) : '';
  const billingText = billingDateLabel
    ? `${escapeHtml(billingDateLabel)}${billingCountdown.label !== '—' ? ` · ${escapeHtml(billingCountdown.label)}` : ''}`
    : '—';

  const kpiMeta = resolvePortalKpiMeta(kpi);

  const insightsList = Array.isArray(insights) ? insights.filter(Boolean) : [];
  const insightsBlock =
    insightsList.length > 0
      ? `<ul class="insights-list">${insightsList.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : '<p class="muted">Новых замечаний нет — показатели держатся стабильно.</p>';

  const csvSection = csvLinks.length
    ? `<section class="downloads">
        <h2 class="section-title">Экспорт отчётов</h2>
        <div class="download-buttons">
          ${csvLinks
            .map((link) => `<a class="secondary-button" href="${escapeHtml(link.href)}">${escapeHtml(link.label)} · CSV</a>`)
            .join('')}
        </div>
      </section>`
    : '';

  const feedbackNotice =
    feedbackStatus === 'sent'
      ? '<div class="notice success">Спасибо! Сообщение доставлено менеджеру.</div>'
      : feedbackStatus === 'error'
      ? '<div class="notice error">Не удалось отправить сообщение. Попробуйте ещё раз или воспользуйтесь кнопкой ниже.</div>'
      : '';

  const feedbackSection = `<section class="feedback">
      <h2 class="section-title">Задать вопрос</h2>
      ${feedbackNotice}
      <form method="post" class="feedback-form">
        <textarea name="message" rows="4" required placeholder="Напишите вопрос или комментарий…"></textarea>
        ${signature ? `<input type="hidden" name="sig" value="${escapeHtml(signature)}" />` : ''}
        <button type="submit">Отправить менеджеру</button>
      </form>
    </section>`;

  const metricDefs = [
    { key: 'spend', label: `Расход (${currencyLabel})` },
    { key: 'leads', label: 'Лиды' },
    { key: 'cpa', label: kpiMeta.label },
    { key: 'reach', label: 'Reach' },
    { key: 'impressions', label: 'Показы' },
    { key: 'frequency', label: 'Frequency' },
  ];

  const formatMetricValue = (report, key) => {
    if (!report || typeof report !== 'object' || !report.totals) {
      return '—';
    }
    const totals = report.totals;
    switch (key) {
      case 'spend': {
        const formatted = formatUsd(totals.spendUsd, { digitsBelowOne: 2, digitsAboveOne: 2 });
        return formatted || '—';
      }
      case 'leads':
        return formatInteger(totals.leads);
      case 'cpa': {
        const value = Number.isFinite(totals.cpaUsd)
          ? Number(totals.cpaUsd)
          : safeDivision(totals.spendUsd, totals.leads);
        const formatted = formatUsd(value, { digitsBelowOne: 2, digitsAboveOne: 2 });
        return formatted || '—';
      }
      case 'reach':
        return formatInteger(totals.reach);
      case 'impressions':
        return formatInteger(totals.impressions);
      case 'frequency': {
        const freq = safeDivision(totals.impressions, totals.reach);
        return formatFloat(freq, { digits: 2 });
      }
      default:
        return '—';
    }
  };

  const headerCells = periods
    .map((period) => {
      const subtitle = period?.report?.range?.label || '';
      return `<th><div>${escapeHtml(period.label)}</div>${subtitle ? `<span class="th-sub">${escapeHtml(subtitle)}</span>` : ''}</th>`;
    })
    .join('');

  const rows = metricDefs
    .map((metric) => {
      const cells = periods
        .map((period) => {
          const value = period?.error ? '—' : formatMetricValue(period?.report, metric.key);
          return `<td>${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr><th>${escapeHtml(metric.label)}</th>${cells}</tr>`;
    })
    .join('');

  const errorLines = periods
    .filter((period) => period?.error)
    .map((period) => `• ${escapeHtml(period.label)} — ${escapeHtml(period.error)}`);

  const errorBlock =
    errorLines.length > 0
      ? `<div class="error-block"><strong>⚠️ Не удалось обновить часть данных:</strong><br>${errorLines.join('<br>')}</div>`
      : '';

  const preferredOrder = ['week', 'month', 'today', 'yesterday'];
  let topSource = null;
  for (const key of preferredOrder) {
    topSource = periods.find(
      (period) =>
        period?.id === key &&
        !period?.error &&
        Array.isArray(period?.report?.campaigns) &&
        period.report.campaigns.length > 0,
    );
    if (topSource) {
      break;
    }
  }
  if (!topSource) {
    topSource = periods.find(
      (period) => !period?.error && Array.isArray(period?.report?.campaigns) && period.report.campaigns.length > 0,
    );
  }

  const topCampaigns = selectPortalTopCampaigns(topSource?.report, { limit: 3 });
  const topTitle = topSource ? `Топ кампании (${escapeHtml(topSource.label)})` : 'Топ кампании';
  const topBlock =
    topCampaigns.length > 0
      ? `<ul class="campaign-list">${topCampaigns
          .map(
            (item) =>
              `<li><span class="campaign-name">${escapeHtml(item.name)}</span><span class="campaign-metrics">${escapeHtml(
                item.spendText,
              )} | ${escapeHtml(kpiMeta.label)}: ${escapeHtml(item.costText)}</span></li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">Кампании ещё не накопили статистику.</p>';

  const managerButton = managerLink
    ? `<a class="primary-button" href="${escapeHtml(managerLink)}" target="_blank" rel="noopener noreferrer">Написать менеджеру</a>`
    : '<span class="primary-button disabled" aria-disabled="true">Ссылка на чат не настроена</span>';

  return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background-color: #0f1115;
        color: #f5f6f8;
      }
      body {
        margin: 0;
        background: #0f1115;
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      header {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: baseline;
        margin-bottom: 24px;
      }
      h1 {
        font-size: 1.75rem;
        margin: 0;
        font-weight: 600;
      }
      .project-code {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        padding: 4px 12px;
        font-size: 0.85rem;
        letter-spacing: 0.02em;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 32px;
      }
      .card {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 16px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .card label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8f9299;
      }
      .card strong {
        font-size: 1.2rem;
        font-weight: 600;
      }
      .stats-table {
        background: rgba(255, 255, 255, 0.02);
        border-radius: 20px;
        padding: 20px;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        min-width: 540px;
      }
      th,
      td {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        text-align: left;
        font-size: 0.95rem;
      }
      th {
        font-weight: 600;
      }
      td {
        font-variant-numeric: tabular-nums;
      }
      table tr:last-child th,
      table tr:last-child td {
        border-bottom: none;
      }
      .th-sub {
        display: block;
        margin-top: 4px;
        font-size: 0.75rem;
        color: #8f9299;
        font-weight: 400;
      }
      .section-title {
        margin: 36px 0 12px;
        font-size: 1.25rem;
        font-weight: 600;
      }
      .insights-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .insights-list li {
        position: relative;
        padding-left: 20px;
        color: #d6d8de;
      }
      .insights-list li::before {
        content: '•';
        position: absolute;
        left: 0;
        color: #4a9bff;
      }
      .campaign-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .campaign-name {
        display: block;
        font-weight: 600;
      }
      .campaign-metrics {
        color: #c7cad1;
        font-size: 0.9rem;
        margin-top: 2px;
        display: block;
      }
      .muted {
        color: #8f9299;
      }
      .primary-button {
        display: inline-block;
        margin-top: 32px;
        padding: 14px 24px;
        border-radius: 999px;
        background: linear-gradient(135deg, #3772ff, #4a9bff);
        color: #fff;
        text-decoration: none;
        font-weight: 600;
        letter-spacing: 0.03em;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .primary-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(55, 114, 255, 0.25);
      }
      .primary-button.disabled {
        background: rgba(255, 255, 255, 0.08);
        color: #8f9299;
        cursor: default;
        pointer-events: none;
      }
      .secondary-button {
        display: inline-block;
        padding: 12px 20px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: #f5f6f8;
        text-decoration: none;
        font-weight: 500;
        letter-spacing: 0.02em;
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .secondary-button:hover {
        background: rgba(74, 155, 255, 0.2);
        transform: translateY(-1px);
      }
      .download-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
      }
      .feedback-form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 12px;
      }
      .feedback-form textarea {
        min-height: 120px;
        resize: vertical;
        border-radius: 12px;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.02);
        color: #f5f6f8;
        font-family: inherit;
      }
      .feedback-form button {
        align-self: flex-start;
        padding: 12px 22px;
        border-radius: 999px;
        background: linear-gradient(135deg, #20bf55, #01baef);
        color: #fff;
        font-weight: 600;
        letter-spacing: 0.03em;
        border: none;
        cursor: pointer;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .feedback-form button:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 24px rgba(1, 186, 239, 0.25);
      }
      .notice {
        border-radius: 12px;
        padding: 12px 16px;
        margin-bottom: 12px;
        font-size: 0.95rem;
      }
      .notice.success {
        background: rgba(76, 175, 80, 0.15);
        color: #b7f5c0;
      }
      .notice.error {
        background: rgba(255, 99, 132, 0.15);
        color: #ffb3be;
      }
      .downloads {
        margin-top: 40px;
      }
      footer {
        margin-top: 40px;
        font-size: 0.8rem;
        color: #6f7279;
      }
      .error-block {
        margin-top: 16px;
        padding: 12px 16px;
        border-radius: 12px;
        background: rgba(255, 99, 132, 0.12);
        color: #ff9ba7;
      }
      @media (max-width: 640px) {
        header {
          flex-direction: column;
          align-items: flex-start;
        }
        .stats-table {
          padding: 16px;
        }
        th,
        td {
          padding: 10px 12px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${projectName}</h1>
        ${projectCode}
      </header>
      <section class="cards">
        <div class="card">
          <label>Следующая оплата</label>
          <strong>${billingText}</strong>
        </div>
        <div class="card">
          <label>Обновлено</label>
          <strong>${updatedLabel}</strong>
        </div>
        <div class="card">
          <label>Валюта отчётов</label>
          <strong>${currencyLabel}</strong>
        </div>
      </section>
      <section>
        <h2 class="section-title">Краткие выводы</h2>
        ${insightsBlock}
      </section>
      <section class="stats-table">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        ${errorBlock}
      </section>
      ${csvSection}
      <section>
        <h2 class="section-title">${topTitle}</h2>
        ${topBlock}
      </section>
      ${feedbackSection}
      ${managerButton}
      <footer>Portal powered by Targetbot · Таймзона: ${escapeHtml(timezone || snapshot?.timezone || 'UTC')}</footer>
    </main>
  </body>
</html>`;
}

function generatePortalInsights({ periods, kpi, currency }) {
  const list = [];
  if (!Array.isArray(periods) || periods.length === 0) {
    return ['Показатели недоступны — нет свежих отчётов Meta.'];
  }

  const totalsById = new Map();
  for (const period of periods) {
    if (!period || period.error || !period.report?.totals) {
      continue;
    }
    totalsById.set(period.id, period.report.totals);
  }

  const today = totalsById.get('today');
  const yesterday = totalsById.get('yesterday');
  const week = totalsById.get('week');
  const month = totalsById.get('month');

  const formatCurrencyValue = (value) => {
    const formatted = formatUsd(value, { digitsBelowOne: 2, digitsAboveOne: 2 });
    if (!formatted) {
      return '';
    }
    if (!currency || currency === 'USD') {
      return formatted;
    }
    return `${formatted.replace('$', '').trim()} ${currency}`.trim();
  };

  if (today && yesterday) {
    const spendChange = percentChange(today.spendUsd, yesterday.spendUsd);
    if (Number.isFinite(spendChange) && Math.abs(spendChange) >= 0.05) {
      const direction = spendChange > 0 ? 'вырос' : 'снизился';
      const percentText = formatChangePercent(spendChange, { digits: Math.abs(spendChange) < 0.15 ? 1 : 0 }) || '';
      list.push(`Расход сегодня ${direction} на ${percentText} относительно вчера.`);
    }

    const leadsChange = percentChange(today.leads, yesterday.leads);
    if (Number.isFinite(leadsChange) && Math.abs(leadsChange) >= 0.1) {
      const direction = leadsChange > 0 ? 'выше' : 'ниже';
      const percentText = formatChangePercent(leadsChange, { digits: 0 }) || '';
      list.push(`Количество лидов сегодня ${direction} вчерашнего на ${percentText}.`);
    }

    const todayCpa = safeDivision(today.spendUsd, today.leads);
    const yesterdayCpa = safeDivision(yesterday.spendUsd, yesterday.leads);
    const cpaChange = percentChange(todayCpa, yesterdayCpa);
    if (Number.isFinite(cpaChange) && Math.abs(cpaChange) >= 0.1) {
      const direction = cpaChange > 0 ? 'вырос' : 'снизился';
      const percentText = formatChangePercent(cpaChange, { digits: 0 }) || '';
      list.push(`Средний ${kpi?.cpl ? 'CPL' : 'CPA'} сегодня ${direction} на ${percentText} относительно вчера.`);
    }
  }

  if (today && !yesterday && Number(today.spendUsd) > 0) {
    list.push(`Сегодня запущены кампании с расходом ${formatCurrencyValue(today.spendUsd)}.`);
  }

  const kpiMeta = resolvePortalKpiMeta(kpi);
  const weekCost = Number.isFinite(week?.cpaUsd) ? week.cpaUsd : safeDivision(week?.spendUsd, week?.leads);
  if (Number.isFinite(kpiMeta.target) && Number.isFinite(weekCost)) {
    const diffRatio = kpiMeta.target ? (weekCost - kpiMeta.target) / kpiMeta.target : null;
    if (Number.isFinite(diffRatio) && Math.abs(diffRatio) >= 0.1) {
      const direction = diffRatio > 0 ? 'выше' : 'ниже';
      const percentText = formatChangePercent(diffRatio, { digits: 0 }) || '';
      list.push(`${kpiMeta.label} за 7 дней ${direction} KPI на ${percentText} (факт: ${formatCurrencyValue(weekCost)}).`);
    } else {
      list.push(`${kpiMeta.label} за 7 дней соответствует KPI (факт: ${formatCurrencyValue(weekCost)}).`);
    }
  }

  if (Number.isFinite(kpi?.leadsPerDay) && week && Number.isFinite(week.leads)) {
    const avgLeads = week.leads / 7;
    const diffRatio = percentChange(avgLeads, kpi.leadsPerDay);
    if (Number.isFinite(diffRatio) && Math.abs(diffRatio) >= 0.1) {
      const direction = diffRatio > 0 ? 'выше' : 'ниже';
      const percentText = formatChangePercent(diffRatio, { digits: 0 }) || '';
      list.push(`Средний дневной поток лидов за неделю ${direction} цели на ${percentText}.`);
    } else {
      list.push(
        `Средний поток лидов за неделю близок к цели (${avgLeads.toFixed(1)} из ${kpi.leadsPerDay} в день).`,
      );
    }
  }

  if (month && Number.isFinite(month.spendUsd)) {
    list.push(`С начала месяца израсходовано ${formatCurrencyValue(month.spendUsd)}.`);
  }

  if (list.length === 0) {
    list.push('Показатели стабильны — значимых отклонений не обнаружено.');
  }

  return list;
}

function renderPortalCsv({ project, account, period, report, timezone, generatedAt, currency, kpi }) {
  const lines = [];
  const add = (section, name, metric, value, unit = '') => {
    lines.push([section, name, metric, value, unit].map(toCsvValue).join(','));
  };

  add('meta', 'project_name', 'value', project?.name || '', '');
  add('meta', 'project_code', 'value', project?.code || project?.id || '', '');
  add('meta', 'account_name', 'value', account?.name || account?.id || '', '');
  if (timezone) {
    add('meta', 'timezone', 'value', timezone, '');
  }
  add('meta', 'generated_at', 'value', new Date(generatedAt).toISOString(), '');

  if (report?.range?.label) {
    add('range', period?.label || '', 'label', report.range.label, '');
  }
  if (report?.range?.since || report?.range?.until) {
    add('range', period?.label || '', 'since', report.range.since || '', '');
    add('range', period?.label || '', 'until', report.range.until || '', '');
  }

  const totals = report?.totals || {};
  const kpiMeta = resolvePortalKpiMeta(kpi);
  add('totals', period?.label || '', 'spend', formatCsvNumber(totals.spendUsd), currency || 'USD');
  add('totals', period?.label || '', 'leads', formatCsvNumber(totals.leads, { digits: 0 }), '');
  const cost = Number.isFinite(totals.cpaUsd) ? totals.cpaUsd : safeDivision(totals.spendUsd, totals.leads);
  add('totals', period?.label || '', kpiMeta.label.toLowerCase(), formatCsvNumber(cost), currency || 'USD');
  add('totals', period?.label || '', 'reach', formatCsvNumber(totals.reach, { digits: 0 }), '');
  add('totals', period?.label || '', 'impressions', formatCsvNumber(totals.impressions, { digits: 0 }), '');
  const frequency = safeDivision(totals.impressions, totals.reach);
  add('totals', period?.label || '', 'frequency', formatCsvNumber(frequency), '');

  const campaigns = Array.isArray(report?.campaigns) ? report.campaigns : [];
  const topCampaigns = campaigns.slice(0, 20);
  for (const campaign of topCampaigns) {
    const name = campaign?.name || campaign?.id || 'Campaign';
    add('campaign', name, 'spend', formatCsvNumber(campaign?.spendUsd), currency || 'USD');
    add('campaign', name, 'leads', formatCsvNumber(campaign?.leads, { digits: 0 }), '');
    const campaignCost = Number.isFinite(campaign?.cpaUsd)
      ? campaign.cpaUsd
      : safeDivision(campaign?.spendUsd, campaign?.leads);
    add('campaign', name, kpiMeta.label.toLowerCase(), formatCsvNumber(campaignCost), currency || 'USD');
  }

  return lines.join('\n');
}

function toCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function formatCsvNumber(value, { digits = 2 } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '';
  }
  return num.toFixed(digits);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTelegramId(value) {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }
  return null;
}

function formatTimestamp(timestamp, timezone) {
  if (!timestamp) {
    return 'unknown';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }

  const pad = (value) => String(value).padStart(2, '0');

  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const parts = formatter.formatToParts(date);
      const lookup = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
      return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}`;
    } catch (error) {
      console.warn('Failed to format timestamp with timezone', timezone, error);
    }
  }

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function formatLogLine(entry, { timezone, limit = 120 } = {}) {
  if (!entry || typeof entry !== 'object') {
    return '• unknown event';
  }

  const timestamp = formatTimestamp(entry.ts, timezone);
  const kind = entry.kind ? `<code>${escapeHtml(entry.kind)}</code>` : '<code>event</code>';
  const statusText = entry.status ? ` ${escapeHtml(`[${entry.status}]`)}` : '';
  const detailSource =
    entry.name ?? entry.reason ?? entry.text ?? entry.error ?? entry.chat_id ?? entry.user_id ?? '';
  const detailRaw = String(detailSource ?? '').trim();
  const detailTrimmed = detailRaw.length > limit ? `${detailRaw.slice(0, limit)}…` : detailRaw;
  const detail = detailTrimmed ? ` — ${escapeHtml(detailTrimmed)}` : '';

  return `• ${escapeHtml(timestamp)} — ${kind}${statusText}${detail}`;
}

function jsonResponse(body, init = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  return new Response(payload, { ...init, headers: JSON_HEADERS });
}

function htmlResponse(body, init = {}) {
  return new Response(body, { ...init, headers: HTML_HEADERS });
}

function textResponse(body, init = {}) {
  return new Response(body, { ...init, headers: TEXT_HEADERS });
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('JSON parse error', error);
    return null;
  }
}

function isValidWebhookToken(candidate, botToken) {
  if (!candidate || !botToken) {
    return false;
  }

  const normalizedCandidate = String(candidate).trim();
  if (!normalizedCandidate) {
    return false;
  }

  const validTokens = new Set([String(botToken)]);
  const shortToken = String(botToken).split(':')[0];
  if (shortToken) {
    validTokens.add(shortToken);
  }

  return validTokens.has(normalizedCandidate);
}

function isValidMetaManageToken(candidate, config) {
  if (!candidate || !config) {
    return false;
  }

  const token = String(candidate).trim();
  if (!token) {
    return false;
  }

  if (isValidWebhookToken(token, config.botToken)) {
    return true;
  }

  if (config.metaManageToken && token === config.metaManageToken) {
    return true;
  }

  if (config.metaLongToken && token === config.metaLongToken) {
    return true;
  }

  if (config.metaAppSecret && token === config.metaAppSecret) {
    return true;
  }

  return false;
}

function parseAuthorizationToken(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const bearerMatch = trimmed.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1].trim();
  }

  const tokenMatch = trimmed.match(/^Token\s+(.+)$/i);
  if (tokenMatch) {
    return tokenMatch[1].trim();
  }

  return '';
}

function pickFirstFilled(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

function safeDecode(value) {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch (error) {
    console.warn('Failed to decode component', value, error);
    return value;
  }
}

async function sha256Hex(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    return '';
  }

  try {
    const encoded = new TextEncoder().encode(String(value));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    console.warn('Failed to compute SHA-256 hash', error);
    return '';
  }
}

async function portalSignatureMatches(signature, { code, tokens } = {}) {
  const candidate = typeof signature === 'string' ? signature.trim() : '';
  if (!candidate) {
    return false;
  }

  const normalizedTokens = [];
  if (tokens && typeof tokens[Symbol.iterator] === 'function') {
    for (const token of tokens) {
      if (typeof token !== 'string') {
        continue;
      }
      const trimmed = token.trim();
      if (trimmed) {
        normalizedTokens.push(trimmed);
      }
    }
  }

  for (const token of normalizedTokens) {
    if (token === candidate) {
      return true;
    }
  }

  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    return false;
  }

  const base = code ? String(code).trim() : '';
  for (const token of normalizedTokens) {
    const digest = await sha256Hex(base ? `${base}:${token}` : token);
    if (digest && digest === candidate) {
      return true;
    }
  }

  return false;
}

function createAbort(timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

function parseAdminIds(rawValue) {
  const ids = new Set();
  const source = typeof rawValue === 'string' ? rawValue : '';

  for (const chunk of source.split(/[,\s]+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    ids.add(trimmed);
  }

  if (ids.size === 0) {
    for (const fallback of DEFAULT_ADMIN_IDS) {
      ids.add(fallback);
    }
  }

  return ids;
}

function resolveKv(env, name) {
  if (env && typeof name === 'string' && env[name] && typeof env[name].get === 'function') {
    return env[name];
  }
  if (env && env.DB && typeof env.DB.get === 'function') {
    return env.DB;
  }
  return null;
}

class KvStorage {
  constructor(env) {
    this.env = env;
  }

  namespace(name) {
    return resolveKv(this.env, name);
  }

  async getJson(bindingName, key) {
    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.get !== 'function') return null;
    const raw = await namespace.get(key);
    return safeJsonParse(raw);
  }

  async putJson(bindingName, key, value, options = {}) {
    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.put !== 'function') return false;
    await namespace.put(key, JSON.stringify(value), options);
    return true;
  }

  async deleteKey(bindingName, key) {
    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.delete !== 'function') return false;
    await namespace.delete(key);
    return true;
  }

  async listKeys(bindingName, prefix, limit = 100) {
    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.list !== 'function') return [];
    const result = await namespace.list({ prefix, limit });
    if (!result || !Array.isArray(result.keys)) return [];
    return result.keys.map((item) => item.name).filter(Boolean);
  }

  async appendTelegramLog(entry, { limit = TELEGRAM_LOG_LIMIT } = {}) {
    const namespace = this.namespace('LOGS_NAMESPACE') ?? this.namespace('DB');
    if (!namespace || typeof namespace.get !== 'function' || typeof namespace.put !== 'function') {
      return;
    }

    const now = new Date().toISOString();
    const record = { ts: now, ...entry };

    const raw = await namespace.get(TELEGRAM_LOG_KEY);
    let list = [];
    if (raw) {
      const parsed = safeJsonParse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    }

    list.push(record);
    if (list.length > limit) {
      list = list.slice(list.length - limit);
    }

    await namespace.put(TELEGRAM_LOG_KEY, JSON.stringify(list));
  }

  async readTelegramLog(limit = 10) {
    const namespace = this.namespace('LOGS_NAMESPACE') ?? this.namespace('DB');
    if (!namespace || typeof namespace.get !== 'function') return [];
    const raw = await namespace.get(TELEGRAM_LOG_KEY);
    const parsed = safeJsonParse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(Math.max(parsed.length - limit, 0));
  }

  async readMetaStatus() {
    const data = await this.getJson('DB', META_STATUS_KEY);
    return pickMetaStatus(data);
  }
}

class MetaClient {
  constructor({ accessToken, version = META_DEFAULT_GRAPH_VERSION, timeoutMs = 10000, fetcher = fetch } = {}) {
    this.accessToken = typeof accessToken === 'string' ? accessToken.trim() : '';
    this.version = version || META_DEFAULT_GRAPH_VERSION;
    this.timeoutMs = timeoutMs;
    this.fetcher = fetcher;
  }

  get isUsable() {
    return this.accessToken.length > 0;
  }

  buildUrl(path, searchParams = null) {
    const base = `https://graph.facebook.com/${this.version.replace(/^\/+|\/+$/g, '')}/`;
    let url;
    if (typeof path === 'string' && /^https?:/i.test(path)) {
      url = new URL(path);
    } else {
      const normalized = typeof path === 'string' ? path.replace(/^\/+/, '') : '';
      url = new URL(normalized, base);
    }

    if (searchParams && typeof searchParams === 'object') {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    url.searchParams.set('access_token', this.accessToken);
    return url;
  }

  async request(path, { searchParams, method = 'GET', body } = {}) {
    if (!this.isUsable) {
      throw new Error('Meta access token отсутствует');
    }

    const url = this.buildUrl(path, searchParams);
    const init = { method, headers: {} };
    if (body) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }

    const controller = createAbort(this.timeoutMs);
    init.signal = controller.signal;

    try {
      const response = await this.fetcher(url.toString(), init);
      const text = await response.text();
      const data = text ? safeJsonParse(text) ?? text : null;

      if (!response.ok) {
        const description = data?.error?.message || data?.message || text || `HTTP ${response.status}`;
        const error = new Error(description);
        error.code = data?.error?.code;
        throw error;
      }

      if (data && typeof data === 'object' && data.error) {
        const error = new Error(data.error?.message || 'Meta API error');
        error.code = data.error?.code;
        throw error;
      }

      return data;
    } finally {
      controller.dispose();
    }
  }
}

class MetaService {
  constructor({ config, storage, env, fetcher = fetch } = {}) {
    this.config = config;
    this.storage = storage;
    this.env = env;
    this.fetcher = fetcher;
  }

  async resolveAccessToken() {
    if (this.config?.metaLongToken) {
      return this.config.metaLongToken;
    }

    if (typeof this.env?.FB_LONG_TOKEN === 'string' && this.env.FB_LONG_TOKEN.trim()) {
      return this.env.FB_LONG_TOKEN.trim();
    }

    if (typeof this.env?.META_LONG_TOKEN === 'string' && this.env.META_LONG_TOKEN.trim()) {
      return this.env.META_LONG_TOKEN.trim();
    }

    const namespace = resolveKv(this.env, 'DB');
    if (namespace && typeof namespace.get === 'function') {
      try {
        const raw = await namespace.get(META_TOKEN_KEY);
        if (typeof raw === 'string' && raw.trim()) {
          const parsed = safeJsonParse(raw);
          if (parsed && typeof parsed === 'object') {
            const token = parsed.token || parsed.access_token || parsed.value;
            if (typeof token === 'string' && token.trim()) {
              return token.trim();
            }
          }
          return raw.trim();
        }
      } catch (error) {
        console.warn('Failed to read meta token from KV', error);
      }
    }

    return '';
  }

  async debugToken({ token } = {}) {
    const target = typeof token === 'string' && token.trim() ? token.trim() : await this.resolveAccessToken();
    if (!target) {
      throw new Error('Meta токен не задан.');
    }

    if (!this.config?.metaAppId || !this.config?.metaAppSecret) {
      throw new Error('Укажите FB_APP_ID и FB_APP_SECRET для debug_token.');
    }

    const inspector = new MetaClient({
      accessToken: `${this.config.metaAppId}|${this.config.metaAppSecret}`,
      version: this.config?.metaGraphVersion || META_DEFAULT_GRAPH_VERSION,
      fetcher: this.fetcher,
    });

    return inspector.request('/debug_token', {
      searchParams: { input_token: target },
    });
  }

  createEmptyStatus({ updatedAt = new Date().toISOString(), error = null } = {}) {
    return {
      message: '',
      facebook: {
        connected: false,
        accountName: '',
        accountId: '',
        adAccounts: [],
        updatedAt,
        stale: Boolean(error),
        error,
      },
    };
  }

  markStatusStale(status, { updatedAt = new Date().toISOString(), error = null } = {}) {
    const clone = cloneMetaStatus(status) || this.createEmptyStatus({ updatedAt, error });
    const facebook = clone.facebook && typeof clone.facebook === 'object' ? clone.facebook : {};
    clone.facebook = {
      connected: error ? false : Boolean(facebook.connected),
      accountName: facebook.accountName || '',
      accountId: facebook.accountId || '',
      adAccounts: Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [],
      updatedAt,
      stale: true,
      error: error || facebook.error || null,
    };
    return clone;
  }

  isFresh(status) {
    if (!status || typeof status !== 'object') return false;
    const updatedAt = status.facebook?.updatedAt || status.facebook?.updated_at;
    if (!updatedAt) return false;
    const updated = Date.parse(updatedAt);
    if (!Number.isFinite(updated)) return false;
    return Date.now() - updated <= META_OVERVIEW_MAX_AGE_MS;
  }

  async ensureOverview({ backgroundRefresh = false, executionContext } = {}) {
    const cached = await this.storage.readMetaStatus();
    if (this.isFresh(cached)) {
      return { status: cached, source: 'cache', refreshed: false, stale: false, error: cached?.facebook?.error ?? null };
    }

    if (backgroundRefresh && executionContext && cached) {
      executionContext.waitUntil(
        this.refreshOverview().catch((error) => {
          console.error('Meta background refresh failed', error);
        }),
      );
      const staleStatus = this.markStatusStale(cached, {
        updatedAt: new Date().toISOString(),
        error: cached?.facebook?.error ?? null,
      });
      return { status: staleStatus, source: 'stale-cache', refreshed: false, stale: true, error: staleStatus.facebook?.error ?? null };
    }

    return this.refreshOverview();
  }

  async refreshOverview() {
    const now = new Date().toISOString();
    const token = await this.resolveAccessToken();
    if (!token) {
      const status = this.createEmptyStatus({ updatedAt: now, error: 'Meta токен не задан' });
      await this.storage.putJson('DB', META_STATUS_KEY, status);
      return { status, source: 'error', refreshed: false, stale: false, error: status.facebook.error };
    }

    const client = new MetaClient({
      accessToken: token,
      version: this.config?.metaGraphVersion || META_DEFAULT_GRAPH_VERSION,
      fetcher: this.fetcher,
    });

    try {
      const status = await this.collectOverview({ client, now });
      await this.storage.putJson('DB', META_STATUS_KEY, status);
      return { status, source: 'live', refreshed: true, stale: false, error: null };
    } catch (error) {
      console.error('Meta overview refresh failed', error);
      const previous = await this.storage.readMetaStatus();
      const fallback = this.markStatusStale(previous, {
        updatedAt: now,
        error: error?.message || 'Meta API error',
      });
      await this.storage.putJson('DB', META_STATUS_KEY, fallback);
      return { status: fallback, source: 'error', refreshed: false, stale: true, error: fallback.facebook.error };
    }
  }

  async collectOverview({ client, now }) {
    const nowDate = parseDateInput(now) || new Date();
    let profile = null;
    try {
      profile = await client.request('/me', {
        searchParams: { fields: 'id,name' },
      });
    } catch (error) {
      console.warn('Meta profile request failed', error);
    }

    const adAccountsRaw = await this.fetchAllAdAccounts(client);
    const transformed = adAccountsRaw
      .map((account) => this.transformAdAccount(account, { now: nowDate }))
      .filter((account) => account !== null);

    const enriched = await this.enrichAdAccounts(client, transformed, { now: nowDate });

    return {
      message: '',
      facebook: {
        connected: Boolean(profile?.id) || transformed.length > 0,
        accountName: profile?.name || '',
        accountId: profile?.id || '',
        adAccounts: enriched,
        updatedAt: now,
        stale: false,
        error: null,
      },
    };
  }

  async fetchAllAdAccounts(client) {
    const fields = [
      'id',
      'account_id',
      'name',
      'account_status',
      'disable_reason',
      'disable_reason_details',
      'balance',
      'amount_spent',
      'currency',
      'spend_cap',
      'spend_cap_action',
      'default_payment_method{last4,display_string}',
      'funding_source_details{display_string}',
      'business_name',
      'owner_business{name}',
      'adspaymentcycle{threshold_amount,payment_method_last4}',
    ].join(',');

    return this.collectPaginated(client, '/me/adaccounts', { limit: '50', fields });
  }

  async collectPaginated(client, path, initialParams = {}, overallLimit = 150) {
    let url = path;
    let params = { ...initialParams };
    const collected = [];

    while (url && collected.length < overallLimit) {
      const response = await client.request(url, { searchParams: params });
      const data = Array.isArray(response?.data) ? response.data : [];
      collected.push(...data);

      if (response?.paging?.next) {
        url = response.paging.next;
        params = null;
      } else {
        break;
      }
    }

    return collected;
  }

  async enrichAdAccounts(client, accounts, { now } = {}) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return [];
    }

    const results = accounts.slice();
    let index = 0;
    const concurrency = Math.min(3, accounts.length);

    const worker = async () => {
      while (index < accounts.length) {
        const current = index++;
        const account = results[current];
        const withCampaigns = await this.fetchCampaignSnapshot(client, account);
        results[current] = await this.enrichAccountFinancials(client, withCampaigns, { now });
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
  }

  async enrichAccountFinancials(client, account, { now } = {}) {
    if (!account || !account.id) {
      return account;
    }

    const updated = { ...account };

    try {
      const insights = await client.request(`/${account.id}/insights`, {
        searchParams: {
          date_preset: 'today',
          time_increment: '1',
          limit: '1',
          fields: 'spend',
        },
      });

      if (Array.isArray(insights?.data) && insights.data.length > 0) {
        const spendValue = parseMetaCurrency(insights.data[0]?.spend);
        if (Number.isFinite(spendValue)) {
          updated.spendTodayUsd = spendValue;
        }
      }
    } catch (error) {
      console.warn('Failed to load ad account spend', account.id, error);
    }

    if (updated.billingNextAt || updated.billing_next_at) {
      const countdown = formatDaysUntil(updated.billingNextAt || updated.billing_next_at, { now });
      updated.billingDueInDays = countdown.value;
      updated.billingDueLabel = countdown.label;
    }

    return updated;
  }

  async fetchCampaignSnapshot(client, account) {
    const accountId = account?.id || (account?.accountId ? `act_${account.accountId}` : null);
    if (!accountId) {
      return account;
    }

    try {
      const response = await client.request(`/${accountId}/campaigns`, {
        searchParams: {
          limit: '50',
          effective_status: '["ACTIVE","PAUSED","SCHEDULED","IN_PROCESS"]',
          fields:
            'id,name,effective_status,insights.date_preset(last_7d){spend,actions,action_values,cost_per_action_type,reach,impressions,frequency,clicks,inline_link_clicks}',
        },
      });

      const campaigns = Array.isArray(response?.data) ? response.data : [];
      const activeCount = campaigns.filter((item) => String(item?.effective_status || '').toUpperCase() === 'ACTIVE').length;
      const cpaSamples = [];
      const summaries = [];

      for (const campaign of campaigns) {
        if (Array.isArray(campaign?.insights?.data)) {
          cpaSamples.push(...collectCpaSamples(campaign.insights.data));
          const summary = normalizeCampaignSummary(campaign);
          if (summary) {
            summaries.push(summary);
          }
        } else {
          const summary = normalizeCampaignSummary(campaign);
          if (summary) {
            summaries.push(summary);
          }
        }
      }

      const cpaMin = cpaSamples.length ? Math.min(...cpaSamples) : null;
      const cpaMax = cpaSamples.length ? Math.max(...cpaSamples) : null;

      account.runningCampaigns = activeCount;
      account.cpaMinUsd = Number.isFinite(cpaMin) ? cpaMin : null;
      account.cpaMaxUsd = Number.isFinite(cpaMax) ? cpaMax : null;
      account.campaignSummaries = summaries.sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0));
    } catch (error) {
      console.warn('Failed to load campaign stats', accountId, error);
    }

    return account;
  }

  async fetchAccountReport({ project, account, preset, range, since, until, timezone, campaignIds, limit = 40 } = {}) {
    const targetRange = range || resolveReportRange(preset, { since, until, timezone });
    const accountCandidate =
      account?.id ||
      (account?.accountId ? `act_${account.accountId}` : null) ||
      (project?.adAccountId ? `act_${String(project.adAccountId).replace(/^act_/, '')}` : null) ||
      null;

    if (!accountCandidate) {
      throw new Error('У проекта не указан рекламный аккаунт.');
    }

    const accountId = String(accountCandidate).startsWith('act_')
      ? String(accountCandidate)
      : `act_${String(accountCandidate)}`;

    const token = await this.resolveAccessToken();
    if (!token) {
      throw new Error('Meta токен не задан.');
    }

    const client = new MetaClient({
      accessToken: token,
      version: this.config?.metaGraphVersion || META_DEFAULT_GRAPH_VERSION,
      fetcher: this.fetcher,
    });

    const params = {
      level: 'campaign',
      time_increment: 'all_days',
      sort: '-spend',
      limit: String(Math.max(1, Math.min(Number(limit) || 40, 100))),
      fields:
        'campaign_id,campaign_name,spend,actions,action_values,cost_per_action_type,reach,impressions,frequency,inline_link_clicks,clicks,date_start,date_stop',
    };

    if (targetRange?.datePreset) {
      params.date_preset = targetRange.datePreset;
    } else if (targetRange?.since && targetRange?.until) {
      params.time_range = JSON.stringify({ since: targetRange.since, until: targetRange.until });
    }

    if (Array.isArray(campaignIds) && campaignIds.length > 0) {
      params.filtering = JSON.stringify([
        { field: 'campaign.id', operator: 'IN', value: campaignIds.map((value) => String(value)) },
      ]);
    }

    const response = await client.request(`/${accountId}/insights`, { searchParams: params });
    const entries = Array.isArray(response?.data) ? response.data : [];

    const campaigns = [];
    let totalSpend = 0;
    let totalLeads = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let sinceDetected = null;
    let untilDetected = null;

    for (const entry of entries) {
      const summary = normalizeInsightEntry(entry);
      if (!summary) {
        continue;
      }

      campaigns.push(summary);

      if (Number.isFinite(summary.spendUsd)) {
        totalSpend += summary.spendUsd;
      }
      if (Number.isFinite(summary.leads)) {
        totalLeads += summary.leads;
      }
      if (Number.isFinite(summary.reach)) {
        totalReach += summary.reach;
      }
      if (Number.isFinite(summary.impressions)) {
        totalImpressions += summary.impressions;
      }
      if (Number.isFinite(summary.clicks)) {
        totalClicks += summary.clicks;
      }

      if (!sinceDetected && entry?.date_start) {
        sinceDetected = entry.date_start;
      }
      if (entry?.date_stop) {
        untilDetected = entry.date_stop;
      }
    }

    campaigns.sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0));

    const totals = {
      spendUsd: campaigns.length > 0 ? totalSpend : null,
      leads: campaigns.length > 0 ? totalLeads : null,
      cpaUsd: totalLeads > 0 ? totalSpend / totalLeads : null,
      reach: totalReach > 0 ? totalReach : null,
      impressions: totalImpressions > 0 ? totalImpressions : null,
      clicks: totalClicks > 0 ? totalClicks : null,
    };

    const rangeInfo = { ...targetRange };
    if (!rangeInfo.since && sinceDetected) {
      rangeInfo.since = formatDateIsoInTimeZone(sinceDetected, timezone || targetRange?.timezone);
    }
    if (!rangeInfo.until && untilDetected) {
      rangeInfo.until = formatDateIsoInTimeZone(untilDetected, timezone || targetRange?.timezone);
    }
    if (!rangeInfo.label && (rangeInfo.since || rangeInfo.until)) {
      const sinceLabel = rangeInfo.since ? formatDateLabel(rangeInfo.since, { timezone }) : '';
      const untilLabel = rangeInfo.until ? formatDateLabel(rangeInfo.until, { timezone }) : '';
      rangeInfo.label = sinceLabel && untilLabel ? `${sinceLabel} — ${untilLabel}` : sinceLabel || untilLabel || '';
    }

    return {
      campaigns,
      totals,
      range: rangeInfo,
      currency: account?.currency || project?.metrics?.currency || project?.currency || null,
    };
  }

  async fetchCampaignTimeseries({
    project,
    account,
    days = 3,
    timezone,
    now = new Date(),
    limit = 80,
  } = {}) {
    const accountCandidate =
      account?.id ||
      (account?.accountId ? `act_${account.accountId}` : null) ||
      (project?.adAccountId ? `act_${String(project.adAccountId).replace(/^act_/, '')}` : null) ||
      null;

    if (!accountCandidate) {
      throw new Error('У проекта не указан рекламный аккаунт.');
    }

    const accountId = String(accountCandidate).startsWith('act_')
      ? String(accountCandidate)
      : `act_${String(accountCandidate)}`;

    const token = await this.resolveAccessToken();
    if (!token) {
      throw new Error('Meta токен не задан.');
    }

    const client = new MetaClient({
      accessToken: token,
      version: this.config?.metaGraphVersion || META_DEFAULT_GRAPH_VERSION,
      fetcher: this.fetcher,
    });

    const normalizedDays = Math.max(2, Math.min(10, Number(days) || 3));
    const params = {
      level: 'campaign',
      time_increment: '1',
      sort: '-date_start',
      limit: String(Math.max(1, Math.min(Number(limit) || 80, 200))),
      fields:
        'campaign_id,campaign_name,spend,actions,action_values,cost_per_action_type,reach,impressions,frequency,inline_link_clicks,clicks,date_start,date_stop',
      date_preset: `last_${normalizedDays}d`,
    };

    const response = await client.request(`/${accountId}/insights`, { searchParams: params });
    const entries = Array.isArray(response?.data) ? response.data : [];

    const localSnapshot = resolveTimezoneSnapshot(now, timezone || this.config?.defaultTimezone || 'UTC');
    const localDateIso = localSnapshot?.dateIso || null;

    const series = new Map();

    for (const entry of entries) {
      const summary = normalizeInsightEntry(entry);
      if (!summary) {
        continue;
      }

      const day = summary.dateStart || entry?.date_start || null;
      if (localDateIso && day && String(day) >= localDateIso) {
        continue;
      }

      let bucket = series.get(summary.id);
      if (!bucket) {
        bucket = { id: summary.id, name: summary.name, entries: [] };
        series.set(summary.id, bucket);
      }

      bucket.entries.push({
        dateStart: summary.dateStart || entry?.date_start || null,
        dateStop: summary.dateStop || entry?.date_stop || null,
        metrics: summary,
      });
    }

    const result = [];
    for (const bucket of series.values()) {
      bucket.entries.sort((a, b) => {
        const first = a.dateStart || a.dateStop || '';
        const second = b.dateStart || b.dateStop || '';
        return first.localeCompare(second);
      });

      const latestEntry = bucket.entries[bucket.entries.length - 1] || null;
      const previousEntry = bucket.entries[bucket.entries.length - 2] || null;

      result.push({
        id: bucket.id,
        name: bucket.name,
        entries: bucket.entries.map((item) => ({
          ...item.metrics,
          dateStart: item.dateStart || null,
          dateStop: item.dateStop || null,
        })),
        latest: latestEntry
          ? {
              ...latestEntry.metrics,
              dateStart: latestEntry.dateStart || null,
              dateStop: latestEntry.dateStop || null,
            }
          : null,
        previous: previousEntry
          ? {
              ...previousEntry.metrics,
              dateStart: previousEntry.dateStart || null,
              dateStop: previousEntry.dateStop || null,
            }
          : null,
      });
    }

    return result;
  }

  transformAdAccount(raw, { now } = {}) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const statusCode = raw.account_status ?? raw.status;
    const disableReason = raw.disable_reason ?? raw.disableReason;
    const spendCapAction = raw.spend_cap_action ?? raw.spendCapAction;
    const paymentStatusLabel = derivePaymentStatus(statusCode, disableReason, spendCapAction);

    const paymentIssues = [];
    const disableLabel = describeDisableReason(disableReason);
    if (disableLabel) {
      paymentIssues.push(disableLabel);
    }

    const normalizedStatus = Number(statusCode);
    if (normalizedStatus === 3) {
      paymentIssues.push('Оплата не прошла');
    }
    if (normalizedStatus === 7) {
      paymentIssues.push('Требуется закрыть задолженность');
    }
    if (spendCapAction && String(spendCapAction).toUpperCase() === 'STOP_DELIVERY') {
      paymentIssues.push('Достигнут лимит расходов');
    }

    const defaultPayment = raw.default_payment_method || raw.defaultPaymentMethod || {};
    const fundingDetails = raw.funding_source_details || raw.fundingSourceDetails || {};
    const paymentCycle = raw.adspaymentcycle || raw.adsPaymentCycle || {};
    const last4 =
      defaultPayment.last4 ||
      extractLast4Digits(defaultPayment.display_string) ||
      paymentCycle.payment_method_last4 ||
      extractLast4Digits(fundingDetails.display_string);

    const balance = parseMetaCurrency(raw.balance);
    const debtUsd = Number.isFinite(balance) && balance > 0 ? balance : null;

    const id = raw.id || (raw.account_id ? `act_${raw.account_id}` : null);
    const accountId = raw.account_id || (typeof raw.id === 'string' ? raw.id.replace(/^act_/, '') : '');

    const billingNextAt =
      paymentCycle.next_payment_date ||
      paymentCycle.next_payment_due_date ||
      paymentCycle.due_date ||
      raw.billing_next_at ||
      raw.next_bill_date ||
      raw.next_payment_date ||
      null;
    const billingCountdown = formatDaysUntil(billingNextAt, { now });
    const billingIso = parseDateInput(billingNextAt)?.toISOString?.() || (billingNextAt ? String(billingNextAt) : null);

    return {
      id,
      accountId,
      name: raw.name || accountId || id || 'Рекламный аккаунт',
      status: statusCode,
      statusLabel: describeAccountStatus(statusCode),
      paymentStatusLabel,
      paymentIssues,
      paymentIssue: paymentIssues[0] || '',
      defaultPaymentMethodLast4: last4 || '',
      debtUsd,
      runningCampaigns: null,
      cpaMinUsd: null,
      cpaMaxUsd: null,
      currency: raw.currency || raw.default_currency || 'USD',
      billingNextAt: billingIso,
      billingDueInDays: billingCountdown.value,
      billingDueLabel: billingCountdown.label,
      requiresAttention:
        paymentIssues.length > 0 ||
          Boolean(debtUsd && debtUsd > 0) ||
          (normalizedStatus && normalizedStatus !== 1 && normalizedStatus !== 0),
    };
  }
}
class TelegramClient {
  constructor(token, { timeoutMs = TELEGRAM_TIMEOUT_MS } = {}) {
    this.token = typeof token === 'string' ? token.trim() : '';
    this.timeoutMs = timeoutMs;
  }

  get isUsable() {
    return this.token.length > 0;
  }

  async call(method, payload = {}) {
    if (!this.isUsable) {
      throw new Error('Telegram token is missing');
    }

    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    };

    const { signal, dispose } = createAbort(this.timeoutMs);
    init.signal = signal;

    try {
      const response = await fetch(url, init);
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (error) {
          throw new Error(`Telegram ответ не JSON: ${error.message}`);
        }
      }

      if (!response.ok) {
        const description = data?.description || text || `HTTP ${response.status}`;
        throw new Error(description);
      }

      if (data?.ok === false) {
        throw new Error(data?.description || 'Telegram API error');
      }

      return data?.result ?? null;
    } catch (error) {
      const message = error?.message || String(error);
      if (/aborted|aborterror|timeout/i.test(message)) {
        throw new Error('Telegram API timeout');
      }
      throw new Error(message);
    } finally {
      dispose();
    }
  }

  async sendMessage(payload) {
    return this.call('sendMessage', payload);
  }

  async answerCallbackQuery(payload) {
    return this.call('answerCallbackQuery', payload);
  }

  async getMe() {
    return this.call('getMe', {});
  }

  async getWebhookInfo() {
    return this.call('getWebhookInfo', {});
  }

  async editMessageText(payload) {
    return this.call('editMessageText', payload);
  }

  async setWebhook(payload) {
    return this.call('setWebhook', payload);
  }

  async deleteWebhook(payload = {}) {
    return this.call('deleteWebhook', payload);
  }
}

class BotCommandContext {
  constructor(bot, update, message, args) {
    this.bot = bot;
    this.update = update;
    this.message = message;
    this.args = args;
  }

  get config() {
    return this.bot.config;
  }

  get storage() {
    return this.bot.storage;
  }

  get chat() {
    return this.message?.chat ?? null;
  }

  get chatId() {
    return this.chat?.id ?? null;
  }

  get threadId() {
    return this.message?.message_thread_id ?? null;
  }

  get user() {
    return this.message?.from ?? null;
  }

  get userId() {
    const id = this.user?.id;
    return typeof id === 'number' || typeof id === 'string' ? String(id) : null;
  }

  get userDisplayName() {
    const from = this.user;
    if (!from) return 'unknown';
    if (from.username) return `@${from.username}`;
    return [from.first_name, from.last_name].filter(Boolean).join(' ') || String(from.id ?? 'unknown');
  }

  get text() {
    return typeof this.message?.text === 'string' ? this.message.text : '';
  }

  defer(task) {
    const execution = this.bot.executionContext;
    if (!execution) return;
    let promise = null;
    if (typeof task === 'function') {
      try {
        promise = task();
      } catch (error) {
        console.error('defer task error', error);
        return;
      }
    } else {
      promise = task;
    }

    if (promise && typeof promise.then === 'function') {
      execution.waitUntil(
        promise.catch((error) => {
          console.error('Deferred task failed', error);
        }),
      );
    }
  }

  isAdmin() {
    if (!this.userId) return false;
    return this.config.adminIds.has(this.userId);
  }

  async reply(text, options = {}) {
    return this.bot.sendReply(this.message, text, options);
  }
}
class TelegramBot {
  constructor({ config, storage, telegram, env, executionContext, metaService }) {
    this.config = config;
    this.storage = storage;
    this.telegram = telegram;
    this.env = env;
    this.executionContext = executionContext;
    this.metaService = metaService;
    this.commands = new Map();

    this.registerDefaultCommands();
  }

  registerCommand(name, handler) {
    this.commands.set(name, handler);
  }

  registerDefaultCommands() {
    this.registerCommand('start', async (context) => {
      await context.reply(
        [
          '👋 <b>Targetbot подключен.</b>',
          '• /help — список команд',
          '• /register — запомнить текущий топик',
          '• /admin — админ-панель (для администраторов)',
          '• /pingtest — проверка связи (10 сообщений за 10 секунд)',
          '• /cancel — отменить ввод в админских формах',
        ].join('\n'),
      );
    });

    this.registerCommand('help', async (context) => {
      await context.reply(
        [
          '<b>Доступные команды</b>',
          '/start — краткая справка',
          '/help — подсказка по командам',
          '/register — сохранить чат и тему для автоотчётов',
          '/admin — открыть административную панель',
          '/report &lt;code&gt; [period] — (зарезервировано)',
          '/digest &lt;code&gt; — (зарезервировано)',
          '/pingtest — 10 сообщений для проверки вебхука',
          '/cancel — отменить ввод текущей формы',
        ].join('\n'),
      );
    });

    this.registerCommand('register', async (context) => {
      const chatId = context.chatId;
      const threadId = context.threadId;
      if (!chatId) {
        await context.reply('❌ Не удалось определить чат.');
        return;
      }

      if (!threadId) {
        await context.reply('ℹ️ Команду <code>/register</code> нужно запускать внутри нужного топика (форум сообщения).');
        return;
      }

      const payload = {
        chat_id: chatId,
        thread_id: threadId,
        title: context.chat?.title ?? '',
        added_by: context.userId,
        added_by_name: context.userDisplayName,
        created_at: new Date().toISOString(),
      };

      const key = `${CHAT_KEY_PREFIX}${chatId}:${threadId}`;
      await this.storage.putJson('DB', key, payload);

      await context.reply(
        [
          '✅ Топик зарегистрирован.',
          `Chat ID: <code>${chatId}</code>`,
          `Thread ID: <code>${threadId}</code>`,
        ].join('\n'),
      );
    });

    this.registerCommand('admin', async (context) => {
      if (!context.isAdmin()) {
        await context.reply('⛔ Команда доступна только администраторам.');
        return;
      }

      const panel = await this.buildAdminPanelPayload();
      await context.reply(panel.text, { reply_markup: panel.reply_markup });
    });

    this.registerCommand('cancel', async (context) => {
      const userId = context.userId;
      if (!userId) {
        await context.reply('Команда доступна только пользователям.');
        return;
      }

      const session = await this.loadAdminSession(userId);
      if (!session) {
        await context.reply('Активных операций не найдено.');
        return;
      }

      await this.clearAdminSession(userId);
      await context.reply('🛑 Ввод остановлен. Изменения не сохранены.');
    });

    this.registerCommand('pingtest', async (context) => {
      await context.reply('🚀 Запускаю проверку: в течение 10 секунд придёт 10 сообщений.');
      context.defer(() => this.runPingTest(context));
    });
  }
  buildAdminSessionKey(userId) {
    if (!userId) {
      return null;
    }
    return `${ADMIN_SESSION_KEY_PREFIX}${userId}`;
  }

  async loadAdminSession(userId) {
    const key = this.buildAdminSessionKey(userId);
    if (!key) {
      return null;
    }
    try {
      const data = await this.storage.getJson('DB', key);
      if (data && typeof data === 'object') {
        return data;
      }
    } catch (error) {
      console.warn('Failed to load admin session', key, error);
    }
    return null;
  }

  async saveAdminSession(session) {
    if (!session || !session.userId) {
      return false;
    }
    const key = this.buildAdminSessionKey(session.userId);
    if (!key) {
      return false;
    }
    const now = new Date().toISOString();
    const payload = { ...session, updatedAt: now };
    if (!payload.createdAt) {
      payload.createdAt = now;
    }
    try {
      await this.storage.putJson('DB', key, payload);
      return true;
    } catch (error) {
      console.error('Failed to save admin session', key, error);
      return false;
    }
  }

  async clearAdminSession(userId) {
    const key = this.buildAdminSessionKey(userId);
    if (!key) {
      return false;
    }
    try {
      await this.storage.deleteKey('DB', key);
      return true;
    } catch (error) {
      console.warn('Failed to clear admin session', key, error);
      return false;
    }
  }

  async createMetaOAuthSession({ adminId, chatId, threadId } = {}) {
    const workerUrl = typeof this.config.workerUrl === 'string' ? this.config.workerUrl.trim() : '';
    if (!workerUrl) {
      return null;
    }

    const base = workerUrl.replace(/\/+$/, '');
    const sessionId = generateRandomToken(48);
    const payload = {
      sessionId,
      adminId: adminId ? String(adminId) : null,
      chatId: chatId ? String(chatId) : null,
      threadId: threadId ? String(threadId) : null,
      createdAt: new Date().toISOString(),
      returnTo: `${base}/fb_debug?session=${sessionId}`,
    };

    try {
      await this.storage.putJson('DB', `${META_OAUTH_SESSION_PREFIX}${sessionId}`, payload, {
        expirationTtl: META_OAUTH_SESSION_TTL_SECONDS,
      });
      this.queueLog({
        kind: 'meta_oauth_session',
        status: 'created',
        user_id: adminId || null,
        session_id: sessionId,
      });
      return { id: sessionId, link: `${base}/fb_auth?session=${sessionId}`, payload };
    } catch (error) {
      console.error('Failed to create Meta OAuth session', error);
      return null;
    }
  }

  async startProjectConnectSession({ userId, chatId, threadId, accounts = [] } = {}) {
    if (!userId) {
      return null;
    }

    const now = new Date().toISOString();
    const session = {
      kind: 'project_connect',
      userId,
      chatId: chatId ? String(chatId) : null,
      threadId: threadId ? String(threadId) : null,
      createdAt: now,
      updatedAt: now,
      draft: {
        chatId: chatId ? String(chatId) : '',
        threadId: threadId ? String(threadId) : '',
        code: '',
        name: '',
        adAccountId: '',
        timezone: this.config.defaultTimezone || '',
        currency: '',
        chatTitle: '',
      },
      accounts: Array.isArray(accounts)
        ? accounts.map((account) => ({
            id: String(account?.accountId ?? account?.id ?? '').replace(/^act_/, ''),
            name: account?.name || '',
            currency: account?.currency || '',
          }))
        : [],
    };

    await this.saveAdminSession(session);
    this.queueLog({
      kind: 'admin_session',
      status: 'started',
      session_kind: 'project_connect',
      user_id: userId,
    });
    return session;
  }

  async startAdminSession({ userId, chatId, threadId, project, kind, base }) {
    if (!userId || !kind || !project) {
      return null;
    }

    const projectKey =
      project.key ||
      `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(project.id || project.code || project.name || base || 'project')}`;

    const callbackId = normalizeProjectIdForCallback(project.id || project.code || base || project.name || 'project');

    const session = {
      kind,
      userId,
      chatId: chatId ? String(chatId) : null,
      threadId: threadId ? String(threadId) : null,
      projectKey,
      projectId: project.id || '',
      projectCode: project.code || '',
      projectName: project.name || '',
      projectCallbackId: callbackId,
      base,
      projectSnapshot: {
        id: project.id || '',
        code: project.code || '',
        name: project.name || '',
        adAccountId: project.adAccountId || '',
        chatId: project.chatId || '',
        threadId: project.threadId || '',
      },
      createdAt: new Date().toISOString(),
    };

    await this.saveAdminSession(session);
    this.queueLog({
      kind: 'admin_session',
      status: 'started',
      session_kind: kind,
      user_id: userId,
      project_key: projectKey,
    });
    return session;
  }

  async handleAdminSessionInput({ session, message, text }) {
    if (!session || !session.kind) {
      return { handled: false };
    }

    const userId = normalizeTelegramId(message?.from?.id);
    if (!userId || userId !== session.userId) {
      return { handled: false };
    }

    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) {
      await this.sendReply(message, 'Отправьте значения в указанном формате. Для отмены используйте /cancel или напишите «отмена».');
      return { handled: true };
    }

    if (/^\/?(cancel|отмена|стоп)$/i.test(trimmed)) {
      await this.clearAdminSession(userId);
      await this.sendReply(message, '🛑 Ввод остановлен. Изменения не сохранены.');
      this.queueLog({
        kind: 'admin_session',
        status: 'cancelled',
        session_kind: session.kind,
        user_id: userId,
        project_key: session.projectKey,
      });
      return { handled: true };
    }

    if (session.kind === 'kpi_edit') {
      return this.handleKpiSessionInput({ session, message, text: trimmed });
    }

    if (session.kind === 'schedule_edit') {
      return this.handleScheduleSessionInput({ session, message, text: trimmed });
    }

    if (session.kind === 'report_custom') {
      return this.handleReportCustomSessionInput({ session, message, text: trimmed });
    }

    if (session.kind === 'project_connect') {
      return this.handleProjectConnectSessionInput({ session, message, text: trimmed });
    }

    return { handled: false };
  }

  async handleKpiSessionInput({ session, message, text }) {
    const userId = session.userId;
    const parseResult = parseKpiFormInput(text);
    if (parseResult.errors.length > 0) {
      await this.sendReply(
        message,
        ['⚠️ Исправьте ошибки:', ...parseResult.errors.map((line) => `• ${escapeHtml(line)}`), '', 'Повторите ввод или используйте /cancel.'].join('\n'),
      );
      this.queueLog({
        kind: 'admin_session',
        status: 'error',
        session_kind: session.kind,
        user_id: userId,
        project_key: session.projectKey,
        error: 'parse_kpi',
      });
      return { handled: true };
    }

    if (parseResult.touched.size === 0) {
      await this.sendReply(message, 'Не удалось распознать поля. Укажите пары вида <code>cpa=2.4</code> или <code>currency=USD</code>.');
      return { handled: true };
    }

    const projectKey = session.projectKey;
    if (!projectKey) {
      await this.sendReply(message, 'Не удалось определить проект для сохранения KPI. Попробуйте открыть карточку проекта заново.');
      await this.clearAdminSession(userId);
      return { handled: true };
    }

    let raw = await this.storage.getJson('DB', projectKey);
    if (!raw || typeof raw !== 'object') {
      raw = {};
    }

    applyProjectIdentity(raw, session.projectSnapshot);

    const current =
      (raw.settings && raw.settings.kpi) ||
      raw.kpi ||
      (raw.metrics && raw.metrics.kpi) ||
      {};

    const next = { ...current };

    if (parseResult.touched.has('objective')) {
      if (parseResult.values.objective) {
        next.objective = parseResult.values.objective;
      } else {
        delete next.objective;
      }
    }
    if (parseResult.touched.has('currency')) {
      if (parseResult.values.currency) {
        next.currency = parseResult.values.currency;
      } else {
        delete next.currency;
      }
    }
    if (parseResult.touched.has('cpa')) {
      if (Number.isFinite(parseResult.values.cpa)) {
        next.cpa = parseResult.values.cpa;
      } else {
        delete next.cpa;
      }
    }
    if (parseResult.touched.has('cpl')) {
      if (Number.isFinite(parseResult.values.cpl)) {
        next.cpl = parseResult.values.cpl;
      } else {
        delete next.cpl;
      }
    }
    if (parseResult.touched.has('leadsPerDay')) {
      if (Number.isFinite(parseResult.values.leadsPerDay)) {
        next.leadsPerDay = parseResult.values.leadsPerDay;
      } else {
        delete next.leadsPerDay;
      }
    }
    if (parseResult.touched.has('dailyBudget')) {
      if (Number.isFinite(parseResult.values.dailyBudget)) {
        next.dailyBudget = parseResult.values.dailyBudget;
      } else {
        delete next.dailyBudget;
      }
    }

    const storedKpi = {};
    if (next.objective) {
      storedKpi.objective = next.objective;
    }
    if (Number.isFinite(next.cpa)) {
      storedKpi.cpa = next.cpa;
    }
    if (Number.isFinite(next.cpl)) {
      storedKpi.cpl = next.cpl;
    }
    if (Number.isFinite(next.leadsPerDay)) {
      storedKpi.leadsPerDay = next.leadsPerDay;
    }
    if (Number.isFinite(next.dailyBudget)) {
      storedKpi.dailyBudget = next.dailyBudget;
    }
    if (next.currency) {
      storedKpi.currency = next.currency;
    }

    const now = new Date().toISOString();
    raw.kpi = { ...storedKpi };
    raw.settings = raw.settings || {};
    raw.settings.kpi = { ...storedKpi };
    raw.metrics = raw.metrics || {};
    raw.metrics.kpi = { ...storedKpi };
    raw.updated_at = now;
    raw.updated_by = userId;

    await this.storage.putJson('DB', projectKey, raw);
    await this.clearAdminSession(userId);

    const lines = ['<b>KPI обновлены</b>', ...formatKpiLines(storedKpi), '', 'Можно открыть карточку проекта для просмотра изменений.'];

    const base = session.base || `admin:project:${session.projectCallbackId || ''}`;
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '⬅️ К проекту', callback_data: `${base}:open` }],
        [{ text: '⚙️ Настройки', callback_data: `${base}:settings` }],
      ],
    };

    await this.sendReply(message, lines.join('\n'), { reply_markup: replyMarkup });
    this.queueLog({
      kind: 'admin_session',
      status: 'saved',
      session_kind: session.kind,
      user_id: userId,
      project_key: projectKey,
    });

    return { handled: true };
  }

  async handleReportCustomSessionInput({ session, message, text }) {
    const userId = session.userId;
    const timezone = this.config.defaultTimezone;
    const parseResult = parseCustomDateRangeInput(text, { timezone });
    if (parseResult.errors.length > 0 || !parseResult.range) {
      await this.sendReply(
        message,
        [
          '<b>Ошибка диапазона</b>',
          ...parseResult.errors.map((line) => `• ${escapeHtml(line)}`),
          '',
          'Повторите ввод или используйте /cancel.',
        ].join('\n'),
      );
      this.queueLog({
        kind: 'admin_session',
        status: 'error',
        session_kind: session.kind,
        user_id: userId,
        project_key: session.projectKey,
        error: 'parse_custom_range',
      });
      return { handled: true };
    }

    const callbackId = session.projectCallbackId || session.projectId || session.projectName || '';
    const context = await this.resolveProjectContext(callbackId);
    if (!context.project) {
      await this.sendReply(
        message,
        'Не удалось найти проект для формирования отчёта. Попробуйте открыть карточку проекта заново.',
      );
      await this.clearAdminSession(userId);
      return { handled: true };
    }

    const scheduleSettings = extractScheduleSettings(context.rawProject);
    const effectiveTimezone = parseResult.range.timezone || scheduleSettings?.timezone || this.config.defaultTimezone;
    const campaignFilter = extractReportCampaignFilter(context.rawProject);

    let reportData = null;
    if (this.metaService) {
      try {
        reportData = await this.metaService.fetchAccountReport({
          project: context.project,
          account: context.account,
          range: { ...parseResult.range, timezone: effectiveTimezone },
          timezone: effectiveTimezone,
          campaignIds: campaignFilter,
        });
      } catch (error) {
        await this.sendReply(
          message,
          ['⚠️ Не удалось запросить данные Meta:', escapeHtml(error?.message || String(error))].join('\n'),
        );
        this.queueLog({
          kind: 'admin_session',
          status: 'error',
          session_kind: session.kind,
          user_id: userId,
          project_key: session.projectKey,
          error: 'meta_fetch_failed',
        });
        return { handled: true };
      }
    }

    const preview = buildProjectReportPreview({
      project: context.project,
      account: context.account,
      rawProject: context.rawProject,
      preset: parseResult.range.preset || 'custom',
      report: reportData,
    });

    let bodyText = preview.text;
    if (!this.metaService) {
      bodyText = `${bodyText}\n⚠️ Meta сервис недоступен — показаны данные панели.`;
    } else if (!reportData) {
      bodyText = `${bodyText}\n⚠️ Не удалось получить выгрузку Meta.`;
    }

    const base = session.base || `admin:project:${session.projectCallbackId || ''}`;

    await this.sendReply(message, bodyText, {
      reply_markup: buildProjectReportKeyboard(base),
    });

    await this.clearAdminSession(userId);

    this.queueLog({
      kind: 'admin_session',
      status: 'saved',
      session_kind: session.kind,
      user_id: userId,
      project_key: session.projectKey,
      range: reportData?.range || parseResult.range,
    });

    return { handled: true };
  }

  async handleProjectConnectSessionInput({ session, message, text }) {
    const userId = session.userId;
    const updates = parseKeyValueForm(text);
    let shouldSave = false;
    let touched = false;

    if (!session.draft || typeof session.draft !== 'object') {
      session.draft = {
        chatId: session.chatId || '',
        threadId: session.threadId || '',
        code: '',
        name: '',
        adAccountId: '',
        timezone: this.config.defaultTimezone || '',
        currency: '',
        chatTitle: '',
      };
    }
    const draft = session.draft;

    if (updates.size === 0) {
      await this.sendReply(message, this.renderProjectConnectDraft(session));
      return { handled: true };
    }

    for (const [rawKey, rawValue] of updates) {
      const key = String(rawKey || '').toLowerCase();
      const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();

      if (!key) {
        continue;
      }

      if (['save', 'done', 'готово', 'сохранить'].includes(key)) {
        shouldSave = true;
        continue;
      }

      if (!value) {
        continue;
      }

      switch (key) {
        case 'account':
        case 'ad_account':
        case 'adaccount':
        case 'ad': {
          const normalized = value.replace(/\s+/g, '').replace(/^act_/, '');
          if (normalized) {
            draft.adAccountId = `act_${normalized}`;
            touched = true;
          }
          break;
        }
        case 'chat': {
          const parts = value.split(':');
          const chatId = parts[0]?.trim();
          const thread = parts[1]?.trim();
          if (chatId) {
            draft.chatId = chatId;
            touched = true;
          }
          if (thread) {
            draft.threadId = thread;
          }
          break;
        }
        case 'thread':
        case 'topic':
          draft.threadId = value;
          touched = true;
          break;
        case 'code':
          draft.code = value.toLowerCase();
          touched = true;
          break;
        case 'name':
          draft.name = value;
          touched = true;
          break;
        case 'timezone':
          draft.timezone = value;
          touched = true;
          break;
        case 'currency':
          draft.currency = value.toUpperCase();
          touched = true;
          break;
        case 'title':
        case 'chat_title':
          draft.chatTitle = value;
          touched = true;
          break;
        case 'portal':
        case 'portal_token':
        case 'token':
          draft.portalToken = value;
          touched = true;
          break;
        case 'kpi':
          draft.kpiNote = value;
          touched = true;
          break;
        default:
          break;
      }
    }

    await this.saveAdminSession(session);

    if (shouldSave) {
      const result = await this.finishProjectConnectSession(session);
      if (!result.ok) {
        const errorMessage = this.describeProjectConnectError(result.error, result.detail);
        await this.sendReply(message, errorMessage);
        return { handled: true };
      }

      await this.clearAdminSession(userId);

      const record = result.record;
      const lines = [
        '<b>Проект подключён</b>',
        `Код: <code>${escapeHtml(record.code)}</code>`,
        `Аккаунт: <code>act_${escapeHtml(String(record.meta_account_id || record.ad_account_id))}</code>`,
        `Чат: <code>${escapeHtml(record.chat.id)}</code>${
          record.chat.thread_id ? ` / <code>${escapeHtml(record.chat.thread_id)}</code>` : ''
        }`,
        `Таймзона: ${escapeHtml(record.settings?.timezone || 'UTC')}`,
        '',
        'Откройте /admin → Проекты, чтобы настроить KPI, отчёты и алерты.',
      ];

      await this.sendReply(message, lines.join('\n'));
      return { handled: true };
    }

    if (!touched) {
      await this.sendReply(
        message,
        'Укажите поля вида <code>account=act_123</code>, <code>chat=-100123:5</code>, <code>code=project</code>. Для сохранения отправьте <code>save</code>.',
      );
      return { handled: true };
    }

    await this.sendReply(message, this.renderProjectConnectDraft(session));
    return { handled: true };
  }

  describeProjectConnectError(code, detail) {
    switch (code) {
      case 'account_required':
        return 'Укажите рекламный аккаунт: <code>account=act_123456789</code>.';
      case 'chat_required':
        return 'Укажите чат проекта: <code>chat=-100123456789:5</code>.';
      case 'thread_required':
        return 'Укажите topic ID в форуме: <code>thread=5</code>.';
      case 'code_invalid':
        return 'Код проекта не распознан. Используйте латинские буквы, цифры и дефис: <code>code=project-name</code>.';
      case 'code_conflict':
        return 'Проект с таким кодом уже существует. Укажите другой <code>code=</code>.';
      case 'storage_failed':
        return `Не удалось сохранить проект: ${escapeHtml(detail || 'ошибка KV')}`;
      default:
        return 'Не удалось сохранить проект. Попробуйте ещё раз или обратитесь к разработчику.';
    }
  }

  renderProjectConnectDraft(session) {
    const draft = session.draft || {};
    const accounts = Array.isArray(session.accounts) ? session.accounts : [];
    const lines = [
      '<b>Черновик проекта</b>',
      `Аккаунт: ${draft.adAccountId ? `<code>${escapeHtml(draft.adAccountId)}</code>` : '—'}`,
      `Чат: ${draft.chatId ? `<code>${escapeHtml(draft.chatId)}</code>` : '—'}${
        draft.threadId ? ` / <code>${escapeHtml(draft.threadId)}</code>` : ''
      }`,
      `Код: ${draft.code ? `<code>${escapeHtml(draft.code)}</code>` : '—'}`,
      `Название: ${draft.name ? escapeHtml(draft.name) : '—'}`,
      `Таймзона: ${escapeHtml(draft.timezone || this.config.defaultTimezone || 'не задана')}`,
      '',
      'Заполните недостающие поля и отправьте <code>save</code>, чтобы сохранить проект. Для отмены используйте /cancel.',
    ];

    if (accounts.length > 0) {
      lines.push('', '<b>Доступные аккаунты</b>');
      const preview = accounts.slice(0, 6);
      for (const account of preview) {
        lines.push(
          `• <code>act_${escapeHtml(account.id)}</code> — ${escapeHtml(account.name || 'без названия')} (${escapeHtml(
            account.currency || 'USD',
          )})`,
        );
      }
      if (accounts.length > preview.length) {
        lines.push(`… и ещё ${accounts.length - preview.length}`);
      }
    }

    return lines.join('\n');
  }

  async finishProjectConnectSession(session) {
    const draft = session.draft || {};

    if (!draft.adAccountId) {
      return { ok: false, error: 'account_required' };
    }
    if (!draft.chatId) {
      return { ok: false, error: 'chat_required' };
    }
    if (!draft.threadId) {
      return { ok: false, error: 'thread_required' };
    }

    const slugSource = draft.code || draft.name || draft.adAccountId;
    const slug = normalizeProjectIdForCallback(slugSource || '');
    if (!slug) {
      return { ok: false, error: 'code_invalid' };
    }

    const projectKey = `${PROJECT_KEY_PREFIX}${slug}`;
    const existing = await this.storage.getJson('DB', projectKey);
    if (existing) {
      return { ok: false, error: 'code_conflict' };
    }

    const accountId = String(draft.adAccountId).replace(/^act_/, '');
    const accountMeta = Array.isArray(session.accounts)
      ? session.accounts.find((account) => account.id === accountId)
      : null;

    const record = {
      id: slug,
      code: draft.code || slug,
      name: draft.name || accountMeta?.name || slug,
      ad_account_id: accountId,
      meta_account_id: accountId,
      chat: {
        id: draft.chatId,
        thread_id: draft.threadId,
        title: draft.chatTitle || '',
        url: buildTelegramTopicUrl(draft.chatId, draft.threadId),
      },
      settings: {
        timezone: draft.timezone || this.config.defaultTimezone || 'UTC',
      },
      metrics: {
        currency: draft.currency || accountMeta?.currency || 'USD',
      },
      meta: {
        accountId,
      },
      created_at: new Date().toISOString(),
    };

    if (draft.portalToken) {
      record.portal = { token: draft.portalToken };
    }
    if (draft.kpiNote) {
      record.notes = { kpi: draft.kpiNote };
    }

    try {
      await this.storage.putJson('DB', projectKey, record);
    } catch (error) {
      console.error('Failed to persist project record', projectKey, error);
      return { ok: false, error: 'storage_failed', detail: error?.message || String(error) };
    }

    this.queueLog({
      kind: 'project',
      status: 'created',
      project_key: projectKey,
      user_id: session.userId,
    });

    return { ok: true, key: projectKey, record };
  }

  async handleScheduleSessionInput({ session, message, text }) {
    const userId = session.userId;
    const parseResult = parseScheduleFormInput(text);
    if (parseResult.errors.length > 0) {
      await this.sendReply(
        message,
        ['⚠️ Исправьте ошибки:', ...parseResult.errors.map((line) => `• ${escapeHtml(line)}`), '', 'Повторите ввод или используйте /cancel.'].join('\n'),
      );
      this.queueLog({
        kind: 'admin_session',
        status: 'error',
        session_kind: session.kind,
        user_id: userId,
        project_key: session.projectKey,
        error: 'parse_schedule',
      });
      return { handled: true };
    }

    if (parseResult.touched.size === 0) {
      await this.sendReply(
        message,
        'Укажите параметры расписания, например <code>times=09:30,19:00</code> или <code>quiet_weekends=yes</code>.',
      );
      return { handled: true };
    }

    const projectKey = session.projectKey;
    if (!projectKey) {
      await this.sendReply(message, 'Не удалось определить проект для сохранения расписания. Попробуйте открыть карточку проекта заново.');
      await this.clearAdminSession(userId);
      return { handled: true };
    }

    let raw = await this.storage.getJson('DB', projectKey);
    if (!raw || typeof raw !== 'object') {
      raw = {};
    }

    applyProjectIdentity(raw, session.projectSnapshot);

    const current =
      (raw.settings && raw.settings.schedule) ||
      raw.schedule ||
      (raw.reporting && raw.reporting.schedule) ||
      {};

    const next = { ...current };

    if (parseResult.touched.has('cadence')) {
      if (parseResult.values.cadence) {
        next.cadence = parseResult.values.cadence;
      } else {
        delete next.cadence;
      }
    }

    if (parseResult.touched.has('timezone')) {
      if (parseResult.values.timezone) {
        next.timezone = parseResult.values.timezone;
      } else {
        delete next.timezone;
      }
    }

    if (parseResult.touched.has('times')) {
      if (Array.isArray(parseResult.values.times) && parseResult.values.times.length > 0) {
        next.times = parseResult.values.times;
      } else {
        delete next.times;
      }
    }

    if (parseResult.touched.has('periods')) {
      if (Array.isArray(parseResult.values.periods) && parseResult.values.periods.length > 0) {
        next.periods = parseResult.values.periods;
      } else {
        delete next.periods;
      }
    }

    if (parseResult.touched.has('quietWeekends')) {
      if (parseResult.values.quietWeekends === null) {
        delete next.quietWeekends;
        delete next.quiet_weekends;
        delete next.mute_weekends;
      } else {
        const flag = Boolean(parseResult.values.quietWeekends);
        next.quietWeekends = flag;
        next.quiet_weekends = flag;
        next.mute_weekends = flag;
      }
    }

    const storedSchedule = {};
    if (next.cadence) {
      storedSchedule.cadence = next.cadence;
    }
    if (Array.isArray(next.times) && next.times.length > 0) {
      storedSchedule.times = next.times;
    }
    if (Array.isArray(next.periods) && next.periods.length > 0) {
      storedSchedule.periods = next.periods;
    }
    if (next.timezone) {
      storedSchedule.timezone = next.timezone;
    }
    if (typeof next.quietWeekends === 'boolean') {
      storedSchedule.quietWeekends = next.quietWeekends;
      storedSchedule.quiet_weekends = next.quietWeekends;
      storedSchedule.mute_weekends = next.quietWeekends;
    }

    const now = new Date().toISOString();
    raw.schedule = { ...storedSchedule };
    raw.settings = raw.settings || {};
    raw.settings.schedule = { ...storedSchedule };
    raw.reporting = raw.reporting || {};
    raw.reporting.schedule = { ...storedSchedule };
    raw.updated_at = now;
    raw.updated_by = userId;

    await this.storage.putJson('DB', projectKey, raw);
    await this.clearAdminSession(userId);

    const lines = [
      '<b>Расписание сохранено</b>',
      ...formatScheduleLines(storedSchedule, { timezone: this.config.defaultTimezone }),
      '',
      'Настройки можно скорректировать повторно в любой момент.',
    ];

    const base = session.base || `admin:project:${session.projectCallbackId || ''}`;
    const replyMarkup = {
      inline_keyboard: [
        [{ text: '⬅️ К проекту', callback_data: `${base}:open` }],
        [{ text: '🎯 KPI', callback_data: `${base}:kpi` }],
      ],
    };

    await this.sendReply(message, lines.join('\n'), { reply_markup: replyMarkup });
    this.queueLog({
      kind: 'admin_session',
      status: 'saved',
      session_kind: session.kind,
      user_id: userId,
      project_key: projectKey,
    });

    return { handled: true };
  }

  async runPingTest(context) {
    const chatId = context.chatId;
    if (!chatId) return;
    const threadId = context.threadId;

    for (let i = 1; i <= 10; i += 1) {
      await delay(1000);
      const payload = {
        chat_id: chatId,
        text: `Проверка связи ${i}/10 — ${new Date().toISOString()}`,
        disable_notification: true,
      };
      if (threadId) {
        payload.message_thread_id = threadId;
      }
      try {
        await this.sendMessageWithFallback(payload, context.message);
      } catch (error) {
        console.error('Ping test send error', error);
        break;
      }
    }
  }

  async processReportSchedules({ now = new Date() } = {}) {
    const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 200);
    if (projectKeys.length === 0) {
      return;
    }

    let metaStatus = null;
    if (this.metaService) {
      try {
        const metaResult = await this.metaService.ensureOverview({
          backgroundRefresh: true,
          executionContext: this.executionContext,
        });
        metaStatus = metaResult?.status ?? metaResult ?? null;
      } catch (error) {
        console.error('Scheduled ensureOverview failed', error);
        metaStatus = await this.storage.readMetaStatus();
      }
    } else {
      metaStatus = await this.storage.readMetaStatus();
    }

    const accounts = Array.isArray(metaStatus?.facebook?.adAccounts)
      ? metaStatus.facebook.adAccounts
      : [];
    const accountMap = new Map();
    for (const account of accounts) {
      const accountId = String(account?.accountId ?? account?.id ?? '').replace(/^act_/, '');
      if (accountId) {
        accountMap.set(accountId, account);
      }
    }

    const adminTargets = Array.from(this.config.adminIds);
    const adminRecipient = adminTargets.length > 0 ? adminTargets[0] : null;

    for (const projectKey of projectKeys) {
      let rawProject = null;
      try {
        rawProject = (await this.storage.getJson('DB', projectKey)) || {};
      } catch (error) {
        console.warn('Failed to read project for schedule', projectKey, error);
        continue;
      }

      const project = normalizeProjectRecord(projectKey, rawProject);
      const schedule = extractScheduleSettings(rawProject);
      if (!schedule) {
        continue;
      }

      const timezone = schedule.timezone || this.config.defaultTimezone || 'UTC';
      const snapshot = resolveTimezoneSnapshot(now, timezone);
      if (!shouldRunScheduleToday(schedule, snapshot.weekday)) {
        continue;
      }

      const times = Array.isArray(schedule.times) && schedule.times.length > 0 ? schedule.times : [REPORT_DEFAULT_TIME];
      const periods = Array.isArray(schedule.periods) && schedule.periods.length > 0 ? schedule.periods : ['today'];

      const state = await this.readReportState(projectKey);
      let stateChanged = false;

      const accountId = project?.adAccountId ? String(project.adAccountId).replace(/^act_/, '') : null;
      const account = accountId ? accountMap.get(accountId) || accountMap.get(project.adAccountId) || null : null;
      const campaignFilter = extractReportCampaignFilter(rawProject);
      const baseCallbackId = normalizeProjectIdForCallback(project.id || project.code || project.name || projectKey);

      for (const timeToken of times) {
        const normalizedTime = normalizeTimeToken(timeToken);
        const timeMinutes = timeStringToMinutes(normalizedTime);
        if (timeMinutes === null) {
          continue;
        }

        const diff = Math.abs(snapshot.minutes - timeMinutes);
        if (diff > REPORT_TOLERANCE_MINUTES) {
          continue;
        }

        for (const period of periods) {
          const slotId = `${normalizedTime}|${period}`;
          const slotState = state.slots?.[slotId] || {};
          if (slotState.date === snapshot.dateIso) {
            continue;
          }

          let reportData = null;
          if (this.metaService) {
            try {
              reportData = await this.metaService.fetchAccountReport({
                project,
                account,
                preset: period,
                timezone,
                campaignIds: campaignFilter,
              });
            } catch (error) {
              console.error('Scheduled report fetch failed', project.id || projectKey, error);
              this.queueLog({
                kind: 'report',
                status: 'error',
                project_id: project.id,
                project_key: projectKey,
                error: error?.message || String(error),
                action: `schedule:${period}`,
              });
              continue;
            }
          }

          const preview = buildProjectReportPreview({
            project,
            account,
            rawProject,
            preset: period,
            report: reportData,
          });

          let text = preview.text;
          if (!this.metaService) {
            text = `${text}\n⚠️ Meta сервис недоступен — показаны данные панели.`;
          } else if (!reportData) {
            text = `${text}\n⚠️ Не удалось получить выгрузку Meta.`;
          }

          const targets = [];
          if (project.chatId) {
            const payload = {
              chat_id: project.chatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            };
            if (project.threadId) {
              payload.message_thread_id = Number(project.threadId);
            }
            targets.push({ payload, kind: 'project' });
          }

          if (adminRecipient) {
            targets.push({
              kind: 'admin',
              payload: {
                chat_id: adminRecipient,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: buildProjectReportKeyboard(`admin:project:${baseCallbackId}`),
              },
            });
          }

          let sent = false;
          for (const target of targets) {
            try {
              await this.sendMessageWithFallback(target.payload);
              sent = true;
            } catch (error) {
              console.error('Scheduled report send failed', target.payload.chat_id, error);
            }
          }

          if (sent) {
            state.slots[slotId] = {
              date: snapshot.dateIso,
              sent_at: new Date().toISOString(),
              preset: period,
            };
            stateChanged = true;
            this.queueLog({
              kind: 'report',
              status: 'sent',
              project_id: project.id,
              project_key: projectKey,
              chat_id: project.chatId || null,
              action: `schedule:${period}`,
            });
          }
        }
      }

      if (stateChanged) {
        await this.writeReportState(projectKey, state);
      }
    }
  }

  async processAlerts({ now = new Date() } = {}) {
    const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 200);
    if (projectKeys.length === 0) {
      return;
    }

    let metaStatus = null;
    if (this.metaService) {
      try {
        const metaResult = await this.metaService.ensureOverview({
          backgroundRefresh: true,
          executionContext: this.executionContext,
        });
        metaStatus = metaResult?.status ?? metaResult ?? null;
      } catch (error) {
        console.error('Scheduled ensureOverview for alerts failed', error);
        metaStatus = await this.storage.readMetaStatus();
      }
    } else {
      metaStatus = await this.storage.readMetaStatus();
    }

    const accounts = Array.isArray(metaStatus?.facebook?.adAccounts)
      ? metaStatus.facebook.adAccounts
      : [];
    const accountMap = new Map();
    for (const account of accounts) {
      const accountId = account?.accountId || account?.id;
      if (accountId) {
        accountMap.set(String(accountId).replace(/^act_/, ''), account);
      }
    }

    const adminTargets = Array.from(this.config.adminIds);

    for (const projectKey of projectKeys) {
      let rawProject = null;
      try {
        rawProject = (await this.storage.getJson('DB', projectKey)) || {};
      } catch (error) {
        console.warn('Failed to read project for alerts', projectKey, error);
        continue;
      }

      const project = normalizeProjectRecord(projectKey, rawProject);
      const account = project.adAccountId ? accountMap.get(String(project.adAccountId)) : null;

      const alerts = extractAlertSettings(rawProject) || {};
      if (!alerts) {
        continue;
      }

      const schedule = extractScheduleSettings(rawProject) || {};
      const timezone = schedule.timezone || this.config.defaultTimezone || 'UTC';
      const snapshot = resolveTimezoneSnapshot(now, timezone);
      const localMinutes = snapshot?.minutes ?? 0;
      const localDateIso = snapshot?.dateIso || formatDateIsoInTimeZone(now, timezone);

      const baseCallbackId = normalizeProjectIdForCallback(project.id || project.code || project.name || projectKey);
      const base = `admin:project:${baseCallbackId}`;
      const chatButton = project.chatUrl
        ? { text: '💬 Чат', url: project.chatUrl }
        : { text: '💬 Чат', callback_data: `${base}:chat` };

      let campaignSeries = null;
      const ensureCampaignSeries = async () => {
        if (campaignSeries || !this.metaService || !account) {
          return campaignSeries || [];
        }
        campaignSeries = await this.metaService.fetchCampaignTimeseries({
          project,
          account,
          timezone,
          now,
        });
        return campaignSeries;
      };

      const state = (await this.readAlertState(projectKey)) || {};
      let stateChanged = false;

      const zeroConfig = alerts.zeroSpend;
      const zeroEnabled = Boolean(zeroConfig?.enabled ?? zeroConfig);
      if (zeroEnabled && account) {
        const zeroTimeToken = zeroConfig?.time || zeroConfig?.hour || ALERT_ZERO_DEFAULT_TIME;
        const zeroMinutes = timeStringToMinutes(zeroTimeToken) ?? timeStringToMinutes(ALERT_ZERO_DEFAULT_TIME);
        const spendToday = Number(account?.spendTodayUsd);
        const runningCampaigns = Number(account?.runningCampaigns);

        if (
          zeroMinutes !== null &&
          localMinutes >= zeroMinutes &&
          Number.isFinite(spendToday) &&
          spendToday === 0 &&
          Number.isFinite(runningCampaigns) &&
          runningCampaigns > 0
        ) {
          const zeroState = state.zeroSpend || {};
          if (zeroState.date !== localDateIso) {
            const lines = [
              '⚠️ <b>Нулевой расход</b>',
              `<b>${escapeHtml(project.name)}</b> — до ${zeroTimeToken} не зафиксирован spend.`,
              `Активных кампаний: <b>${runningCampaigns}</b>`,
              'Возможные причины: отклонения, исчерпан лимит, пауза или проблемы с оплатой.',
              'Проверьте Ads Manager и оплату, чтобы возобновить показ объявлений.',
            ];

            await this.sendProjectAlert({
              project,
              baseCallbackId,
              text: lines.join('\n'),
              extraRows: [[chatButton]],
              adminTargets,
              kind: 'zero_spend',
            });

            state.zeroSpend = {
              date: localDateIso,
              notifiedAt: new Date().toISOString(),
              checkTime: zeroMinutes,
            };
            stateChanged = true;
          }
        }
      }

      const billingConfig = alerts.billing;
      const billingEnabled = Boolean(billingConfig?.enabled ?? billingConfig);
      if (billingEnabled && account) {
        const billingTimes = normalizeTimeList(billingConfig?.times || billingConfig?.hours, ALERT_BILLING_DEFAULT_TIMES);
        const shouldCheckBilling = billingTimes.some((time) => {
          const minutes = timeStringToMinutes(time);
          return minutes !== null && localMinutes >= minutes;
        });

        if (shouldCheckBilling) {
          const signals = collectBillingSignals(account);
          const hasIssues =
            signals.issues.length > 0 || (Number.isFinite(signals.debtUsd) && Number(signals.debtUsd) > 0);

          if (hasIssues) {
            const billingState = state.billing || {};
            if (billingState.date !== localDateIso || billingState.fingerprint !== signals.fingerprint) {
              const lines = [
                '💳 <b>Проблемы с оплатой</b>',
                `<b>${escapeHtml(project.name)}</b> — требуется внимание.`,
              ];
              if (signals.issues.length > 0) {
                lines.push(`Причины: ${escapeHtml(signals.issues.join(' • '))}`);
              }
              if (Number.isFinite(signals.debtUsd) && signals.debtUsd !== 0) {
                lines.push(`Долг: <b>${formatUsd(signals.debtUsd, { digitsBelowOne: 2, digitsAboveOne: 2 })}</b>`);
              }
              if (signals.cardLast4) {
                lines.push(`Карта: 💳 ****${escapeHtml(String(signals.cardLast4))}`);
              }
              lines.push('Оплатите счёт или смените метод платежа, затем отметьте оплату в карточке проекта.');

              await this.sendProjectAlert({
                project,
                baseCallbackId,
                text: lines.join('\n'),
                extraRows: [[chatButton], [{ text: '💳 Отметить оплату', callback_data: `${base}:payment` }]],
                adminTargets,
                kind: 'billing',
              });

              state.billing = {
                date: localDateIso,
                fingerprint: signals.fingerprint,
                notifiedAt: new Date().toISOString(),
              };
              stateChanged = true;
            }
          }
        }
      }

      const anomaliesEnabled = Boolean(alerts.anomalies?.enabled ?? alerts.anomalies);
      const creativesEnabled = Boolean(alerts.creatives?.enabled ?? alerts.creatives);
      const kpi = extractProjectKpi(rawProject);
      const kpiTarget = Number.isFinite(kpi?.cpa)
        ? kpi.cpa
        : Number.isFinite(kpi?.cpl)
        ? kpi.cpl
        : null;
      const anomalyCutoff = timeStringToMinutes(alerts.anomalies?.time || '11:00') ?? timeStringToMinutes('11:00');

      if (
        anomaliesEnabled &&
        account &&
        this.metaService &&
        (anomalyCutoff === null || localMinutes >= anomalyCutoff)
      ) {
        const anomalyState = state.anomalies || {};
        if (anomalyState.lastCheckedDate !== localDateIso) {
          try {
            const series = await ensureCampaignSeries();
            const anomalies = detectCampaignAnomalies(series, { kpiTarget });

            anomalyState.lastCheckedDate = localDateIso;
            if (anomalies.length > 0) {
              const fingerprint = anomalies
                .slice(0, 5)
                .map((item) => `${item.id}:${item.reasons.join(',')}`)
                .join('|');

              if (anomalyState.fingerprint !== fingerprint || anomalyState.notifiedDate !== localDateIso) {
                const top = anomalies.slice(0, 3);
                const lines = [
                  '📉 <b>Аномалии в кампаниях</b>',
                  `<b>${escapeHtml(project.name)}</b> — обнаружены резкие изменения.`,
                ];

                for (const item of top) {
                  const reason = item.reasons.slice(0, 2).join('; ');
                  const cpaText = Number.isFinite(item.latestCpa)
                    ? formatUsd(item.latestCpa, { digitsBelowOne: 2, digitsAboveOne: 0 })
                    : '—';
                  lines.push(`• <b>${escapeHtml(item.name)}</b> — ${escapeHtml(reason)} (CPA ${cpaText})`);
                }
                if (anomalies.length > top.length) {
                  lines.push(`…ещё ${anomalies.length - top.length} кампаний`);
                }
                lines.push(
                  'Рекомендации: пересмотрите аудитории, обновите креативы, скорректируйте бюджет лучших/худших кампаний.',
                );

                await this.sendProjectAlert({
                  project,
                  baseCallbackId,
                  text: lines.join('\n'),
                  extraRows: [[chatButton], [{ text: '📈 Сводный отчёт', callback_data: `${base}:digest` }]],
                  adminTargets,
                  kind: 'anomaly',
                });

                anomalyState.fingerprint = fingerprint;
                anomalyState.notifiedDate = localDateIso;
              }
            }

            state.anomalies = anomalyState;
            stateChanged = true;
          } catch (error) {
            console.error('Anomaly detection failed', projectKey, error);
          }
        }
      }

      if (
        creativesEnabled &&
        account &&
        this.metaService &&
        Number.isFinite(kpiTarget) &&
        (anomalyCutoff === null || localMinutes >= anomalyCutoff)
      ) {
        const creativeState = state.creatives || {};
        if (creativeState.lastCheckedDate !== localDateIso) {
          try {
            const series = await ensureCampaignSeries();
            const fatigued = detectCreativeFatigue(series, { kpiTarget });

            creativeState.lastCheckedDate = localDateIso;
            if (fatigued.length > 0) {
              const fingerprint = fatigued
                .slice(0, 5)
                .map((item) => `${item.id}:${item.cpa?.toFixed?.(2) ?? ''}`)
                .join('|');

              if (creativeState.fingerprint !== fingerprint || creativeState.notifiedDate !== localDateIso) {
                const top = fatigued.slice(0, 3);
                const lines = [
                  '🧩 <b>Усталость креативов</b>',
                  `Цель CPA: ${formatUsd(kpiTarget, { digitsBelowOne: 2, digitsAboveOne: 0 })}`,
                ];

                for (const item of top) {
                  lines.push(
                    `• <b>${escapeHtml(item.name)}</b> — CPA ${formatUsd(item.cpa, {
                      digitsBelowOne: 2,
                      digitsAboveOne: 0,
                    })}, CTR ${formatPercentage(item.ctr, { digits: 1 })}, freq ${item.frequency.toFixed(1)}`,
                  );
                }
                if (fatigued.length > top.length) {
                  lines.push(`…ещё ${fatigued.length - top.length} кампаний требуют ротации.`);
                }
                lines.push('Совет: протестируйте новые креативы, обновите заголовки, снизьте частоту показов.');

                await this.sendProjectAlert({
                  project,
                  baseCallbackId,
                  text: lines.join('\n'),
                  extraRows: [[chatButton], [{ text: '🎯 KPI', callback_data: `${base}:kpi` }]],
                  adminTargets,
                  kind: 'creative_fatigue',
                });

                creativeState.fingerprint = fingerprint;
                creativeState.notifiedDate = localDateIso;
              }
            }

            state.creatives = creativeState;
            stateChanged = true;
          } catch (error) {
            console.error('Creative fatigue detection failed', projectKey, error);
          }
        }
      }

      if (
        anomaliesEnabled &&
        this.metaService &&
        account &&
        Number.isFinite(kpiTarget) &&
        (anomalyCutoff === null || localMinutes >= anomalyCutoff)
      ) {
        const kpiState = state.kpi || { streak: 0 };
        if (kpiState.lastCheckedDate !== localDateIso) {
          try {
            const report = await this.metaService.fetchAccountReport({
              project,
              account,
              preset: 'yesterday',
              timezone,
            });

            const totals = report?.totals || {};
            const spend = Number.isFinite(totals.spendUsd) ? totals.spendUsd : null;
            const leads = Number.isFinite(totals.leads) ? totals.leads : null;
            const actualCpa = Number.isFinite(totals.cpaUsd)
              ? totals.cpaUsd
              : safeDivision(totals.spendUsd, totals.leads);

            let streak = Number.isFinite(kpiState.streak) ? Number(kpiState.streak) : 0;
            let exceeded = false;
            if (Number.isFinite(actualCpa)) {
              exceeded = actualCpa > kpiTarget;
            } else if (Number.isFinite(spend) && spend > 0 && (!Number.isFinite(leads) || leads === 0)) {
              exceeded = true;
            }

            if (exceeded) {
              streak += 1;
            } else {
              streak = 0;
              kpiState.lastNotifiedDate = null;
            }

            kpiState.streak = streak;
            kpiState.lastCheckedDate = localDateIso;
            kpiState.lastValue = Number.isFinite(actualCpa) ? actualCpa : null;
            kpiState.lastSpend = spend;
            kpiState.lastLeads = leads;
            kpiState.updatedAt = new Date().toISOString();

            if (exceeded && streak >= 3 && kpiState.lastNotifiedDate !== localDateIso) {
              const actualText = Number.isFinite(actualCpa)
                ? formatUsd(actualCpa, { digitsBelowOne: 2, digitsAboveOne: 0 })
                : 'нет лидов';
              const targetText = formatUsd(kpiTarget, { digitsBelowOne: 2, digitsAboveOne: 0 });
              const spendText = Number.isFinite(spend)
                ? formatUsd(spend, { digitsBelowOne: 2, digitsAboveOne: 2 })
                : '—';
              const leadsText = Number.isFinite(leads) ? formatInteger(leads) : '0';

              const lines = [
                '⛔ <b>CPA выше KPI третий день</b>',
                `<b>${escapeHtml(project.name)}</b> — факт ${actualText} при KPI ${targetText}.`,
                `Серия превышений: <b>${streak}</b> дня подряд. Лидов: ${leadsText} | Spend: ${spendText}.`,
                'Включить автопаузу проблемных кампаний и пересмотреть KPI?',
              ];

              await this.sendProjectAlert({
                project,
                baseCallbackId,
                text: lines.join('\n'),
                extraRows: [
                  [chatButton],
                  [
                    { text: '⏸ Поставить на паузу', callback_data: `${base}:autopause` },
                    { text: '🎯 KPI', callback_data: `${base}:kpi` },
                  ],
                ],
                adminTargets,
                kind: 'kpi_overrun',
              });

              kpiState.lastNotifiedDate = localDateIso;
            }

            state.kpi = kpiState;
            stateChanged = true;
          } catch (error) {
            console.error('KPI streak evaluation failed', projectKey, error);
          }
        }
      }

      if (stateChanged) {
        await this.writeAlertState(projectKey, state);
      }
    }
  }

  async handleUpdate(update) {
    const message = update?.message || update?.edited_message || update?.channel_post;
    if (message) {
      return this.handleMessage(update, message);
    }

    const callback = update?.callback_query;
    if (callback) {
      return this.handleCallback(update, callback);
    }

    this.queueLog({ kind: 'ignored', reason: 'unsupported_update' });
    return { handled: false };
  }

  async handleMessage(update, message) {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!text.startsWith('/')) {
      const userId = normalizeTelegramId(message?.from?.id);
      if (userId && this.config.adminIds.has(userId)) {
        const session = await this.loadAdminSession(userId);
        if (session) {
          const result = await this.handleAdminSessionInput({ session, message, text });
          if (result?.handled) {
            return result;
          }
        }
      }

      this.queueLog({
        kind: 'message',
        chat_id: message?.chat?.id,
        thread_id: message?.message_thread_id,
        text: text.slice(0, 64),
      });
      return { handled: false, reason: 'not_a_command' };
    }

    const [commandToken, ...rest] = text.split(/\s+/);
    const commandName = commandToken.slice(1).toLowerCase();
    const args = rest;

    const handler = this.commands.get(commandName);
    const context = new BotCommandContext(this, update, message, args);

    if (!handler) {
      await context.reply('⚠️ Неизвестная команда. Используйте /help.');
      this.queueLog({
        kind: 'command',
        name: commandName,
        status: 'unknown',
        chat_id: context.chatId,
        user_id: context.userId,
      });
      return { handled: false, reason: 'unknown_command' };
    }

    try {
      await handler(context);
      this.queueLog({
        kind: 'command',
        name: commandName,
        status: 'ok',
        chat_id: context.chatId,
        user_id: context.userId,
      });
      return { handled: true };
    } catch (error) {
      console.error(`Command ${commandName} failed`, error);
      await context.reply('⚠️ Команда завершилась ошибкой. Попробуйте позже.');
      this.queueLog({
        kind: 'command',
        name: commandName,
        status: 'error',
        chat_id: context.chatId,
        user_id: context.userId,
        error: error?.message || String(error),
      });
      return { handled: false, error: error?.message || 'command_failed' };
    }
  }

  async handleCallback(update, callback) {
    const id = callback?.id;
    if (!id) {
      this.queueLog({ kind: 'callback', status: 'ignored', reason: 'missing_id' });
      return { handled: false };
    }

    const data = typeof callback?.data === 'string' ? callback.data : '';
    if (data.startsWith('admin:')) {
      return this.handleAdminCallback(callback, data);
    }

    try {
      await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'В разработке' });
      this.queueLog({ kind: 'callback', status: 'ok', data: callback?.data ?? null });
      return { handled: true };
    } catch (error) {
      console.error('Callback handler failed', error);
      this.queueLog({
        kind: 'callback',
        status: 'error',
        data: callback?.data ?? null,
        error: error?.message || String(error),
      });
      return { handled: false, error: error?.message || 'callback_failed' };
    }
  }

  async sendReply(message, text, options = {}) {
    if (!text) return null;
    const payload = {
      chat_id: message?.chat?.id,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options,
    };

    if (message?.message_thread_id && payload.message_thread_id === undefined) {
      payload.message_thread_id = message.message_thread_id;
    }

    if (message?.message_id && !payload.reply_parameters) {
      payload.reply_parameters = { message_id: message.message_id };
    }

    return this.sendMessageWithFallback(payload, message);
  }

  async sendMessageWithFallback(payload, message) {
    if (!payload.chat_id) {
      throw new Error('chat_id is required for sendMessage');
    }

    try {
      return await this.telegram.sendMessage(payload);
    } catch (error) {
      const baseError = error?.message || String(error);
      const fallbackPayload = { ...payload };
      let attemptedFallback = false;

      if (fallbackPayload.reply_parameters) {
        delete fallbackPayload.reply_parameters;
        attemptedFallback = true;
      }
      if (fallbackPayload.message_thread_id) {
        delete fallbackPayload.message_thread_id;
        attemptedFallback = true;
      }

      if (attemptedFallback) {
        try {
          const result = await this.telegram.sendMessage(fallbackPayload);
          this.queueLog({
            kind: 'send_fallback',
            chat_id: payload.chat_id,
            original_error: baseError,
          });
          return result;
        } catch (fallbackError) {
          const userId = message?.from?.id;
          if (userId && userId !== payload.chat_id) {
            try {
              await this.telegram.sendMessage({
                chat_id: userId,
                text: payload.text,
                parse_mode: payload.parse_mode ?? 'HTML',
                disable_web_page_preview: payload.disable_web_page_preview ?? true,
              });
              this.queueLog({
                kind: 'send_dm_fallback',
                chat_id: payload.chat_id,
                user_id: userId,
                original_error: baseError,
              });
              return null;
            } catch (dmError) {
              console.error('DM fallback failed', dmError);
              throw dmError;
            }
          }
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  async sendProjectAlert({ project, baseCallbackId, text, extraRows = [], adminTargets = [], kind }) {
    if (!text || !project) {
      return false;
    }

    const base = `admin:project:${baseCallbackId}`;
    const replyMarkup = buildAlertKeyboard(base, extraRows);
    const payloads = [];

    if (project.chatId) {
      const payload = {
        chat_id: project.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      };
      if (project.threadId) {
        payload.message_thread_id = Number(project.threadId);
      }
      payloads.push(payload);
    }

    const uniqueAdmins = Array.from(new Set((adminTargets || []).map((id) => String(id)))).filter(Boolean);
    for (const adminId of uniqueAdmins) {
      if (project.chatId && String(project.chatId) === adminId) {
        continue;
      }
      payloads.push({
        chat_id: adminId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      });
      break;
    }

    let sent = false;
    for (const payload of payloads) {
      try {
        await this.sendMessageWithFallback(payload);
        sent = true;
      } catch (error) {
        console.error('Alert send failed', payload.chat_id, error);
      }
    }

    if (sent) {
      this.queueLog({
        kind: 'alert',
        status: 'sent',
        alert_kind: kind,
        project_id: project.id,
        project_key: project.key,
        chat_id: project.chatId || null,
      });
    }

    return sent;
  }

  getDefaultWebhookUrl() {
    return resolveDefaultWebhookUrl(this.config);
  }

  async ensureWebhookActive({ autoRegister = true } = {}) {
    if (!this.telegram?.isUsable) {
      return { info: null, ensured: false, defaultUrl: this.getDefaultWebhookUrl(), error: 'telegram_unavailable' };
    }

    let info = null;
    let capturedError = null;
    try {
      info = await this.telegram.getWebhookInfo();
    } catch (error) {
      capturedError = error;
    }

    const defaultUrl = this.getDefaultWebhookUrl();
    let ensured = false;

    if (autoRegister && defaultUrl && (!info || !info.url)) {
      try {
        await this.telegram.setWebhook({ url: defaultUrl });
        ensured = true;
        info = await this.telegram.getWebhookInfo();
        capturedError = null;
        this.queueLog({ kind: 'webhook', status: 'auto_set', url: defaultUrl });
      } catch (error) {
        capturedError = error;
        this.queueLog({
          kind: 'webhook',
          status: 'auto_set_failed',
          url: defaultUrl,
          error: error?.message || String(error),
        });
      }
    }

    return {
      info,
      ensured,
      defaultUrl,
      error: capturedError ? capturedError?.message || String(capturedError) : null,
    };
  }

  async refreshWebhook({ dropPending = true } = {}) {
    if (!this.telegram?.isUsable) {
      return { ok: false, error: 'telegram_unavailable' };
    }

    let info = null;
    try {
      info = await this.telegram.getWebhookInfo();
    } catch (error) {
      info = null;
    }

    const currentUrl = typeof info?.url === 'string' ? info.url.trim() : '';
    const fallbackUrl = this.getDefaultWebhookUrl();
    const targetUrl = currentUrl || fallbackUrl;

    if (!targetUrl) {
      return { ok: false, error: 'webhook_url_unknown', info };
    }

    try {
      const deleteResult = await this.telegram.deleteWebhook({ drop_pending_updates: dropPending });
      await delay(500);
      const payload = { url: targetUrl };
      if (dropPending) {
        payload.drop_pending_updates = true;
      }
      const setResult = await this.telegram.setWebhook(payload);
      let finalInfo = null;
      try {
        finalInfo = await this.telegram.getWebhookInfo();
      } catch (error) {
        finalInfo = info;
      }
      this.queueLog({
        kind: 'webhook',
        status: 'refreshed',
        url: targetUrl,
        drop_pending_updates: dropPending,
      });
      return { ok: true, url: targetUrl, deleteResult, setResult, info: finalInfo };
    } catch (error) {
      const message = error?.message || String(error);
      this.queueLog({
        kind: 'webhook',
        status: 'refresh_failed',
        url: targetUrl,
        drop_pending_updates: dropPending,
        error: message,
      });
      return { ok: false, error: message, url: targetUrl, info };
    }
  }

  queueLog(entry) {
    if (!this.executionContext) return;
    const record = { ...entry };
    this.executionContext.waitUntil(
      this.storage
        .appendTelegramLog(record)
        .catch((error) => console.error('Failed to append telegram log', error)),
    );
  }

  async readReportState(projectKey) {
    if (!projectKey) {
      return { slots: {} };
    }
    const key = `${REPORT_STATE_PREFIX}${projectKey}`;
    const state = await this.storage.getJson('DB', key);
    if (!state || typeof state !== 'object') {
      return { slots: {} };
    }
    if (!state.slots || typeof state.slots !== 'object') {
      state.slots = {};
    }
    return state;
  }

  async writeReportState(projectKey, state) {
    if (!projectKey) {
      return false;
    }
    const key = `${REPORT_STATE_PREFIX}${projectKey}`;
    return this.storage.putJson('DB', key, state);
  }

  async readAlertState(projectKey) {
    if (!projectKey) {
      return {};
    }
    const key = `${ALERT_STATE_PREFIX}${projectKey}`;
    const state = await this.storage.getJson('DB', key);
    if (!state || typeof state !== 'object') {
      return {};
    }
    return state;
  }

  async writeAlertState(projectKey, state) {
    if (!projectKey) {
      return false;
    }
    const key = `${ALERT_STATE_PREFIX}${projectKey}`;
    return this.storage.putJson('DB', key, state);
  }

  async buildAdminPanelPayload({ forceMetaRefresh = false } = {}) {
    const metaPromise = this.metaService
      ? forceMetaRefresh
        ? this.metaService.refreshOverview()
        : this.metaService.ensureOverview({
            backgroundRefresh: true,
            executionContext: this.executionContext,
          })
      : this.storage.readMetaStatus();

    const [metaResult, chatKeys, projectKeys, recentLogs, webhookStatus] = await Promise.all([
      metaPromise,
      this.storage.listKeys('DB', CHAT_KEY_PREFIX, 100),
      this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 100),
      this.storage.readTelegramLog(5),
      this.ensureWebhookActive({ autoRegister: true }),
    ]);

    const metaStatus = this.metaService ? metaResult?.status ?? null : metaResult;

    const projectKeySlice = projectKeys.slice(0, ADMIN_PROJECT_PREVIEW_LIMIT);
    const projectRecords = await Promise.all(
      projectKeySlice.map(async (key) => {
        try {
          const data = await this.storage.getJson('DB', key);
          return normalizeProjectRecord(key, data);
        } catch (error) {
          console.warn('Failed to load project record', key, error);
          return normalizeProjectRecord(key, null);
        }
      }),
    );

    const projectSummaries = buildProjectSummaries(projectRecords, metaStatus, {
      timezone: this.config.defaultTimezone,
    });

    const dashboard = renderAdminDashboard({
      metaStatus,
      projectSummaries,
      webhook: webhookStatus,
      totals: { projects: projectKeys.length, chats: chatKeys.length },
      timezone: this.config.defaultTimezone,
    });

    const summary = [dashboard];

    if (projectKeys.length > projectRecords.length) {
      summary.push(
        '',
        `Показаны первые ${projectRecords.length} проектов из ${projectKeys.length}. Откройте раздел «Проекты» для полного списка.`,
      );
    }

    if (recentLogs.length > 0) {
      summary.push('', '<b>Последние события Telegram</b>');
      const preview = recentLogs
        .slice(Math.max(recentLogs.length - 3, 0))
        .reverse()
        .map((entry) => formatLogLine(entry, { timezone: this.config.defaultTimezone, limit: 80 }));
      summary.push(...preview);
    }

    const inlineKeyboard = [
      [
        { text: '🔐 Авторизоваться в Facebook', callback_data: 'admin:fb:auth' },
        { text: '➕ Подключить проект', callback_data: 'admin:project:connect' },
      ],
      [
        { text: '📁 Проекты', callback_data: 'admin:projects' },
        { text: '🔄 Обновиться', callback_data: 'admin:refresh' },
      ],
      [
        { text: '📄 Логи', callback_data: 'admin:logs' },
        { text: '🔁 Вебхук', callback_data: 'admin:webhook:refresh' },
      ],
    ];

    for (const summaryItem of projectSummaries) {
      const base = `admin:project:${summaryItem.callbackId}`;
      const chatButton = summaryItem.chatUrl
        ? { text: '💬 Перейти в чат', url: summaryItem.chatUrl }
        : { text: '💬 Перейти в чат', callback_data: `${base}:chat` };
      inlineKeyboard.push([
        chatButton,
        { text: 'ℹ️ Детали', callback_data: `${base}:open` },
        { text: '💳 Оплата', callback_data: `${base}:payment` },
      ]);
      inlineKeyboard.push([
        { text: '📊 Отчёт', callback_data: `${base}:report` },
        { text: '📈 Сводный отчёт', callback_data: `${base}:digest` },
        { text: '📄 CSV', callback_data: `${base}:report:csv` },
      ]);
      inlineKeyboard.push([
        { text: '🎯 Управление KPI', callback_data: `${base}:kpi` },
        { text: '⏸ Автопауза', callback_data: `${base}:autopause` },
        { text: '⚙️ Настройки', callback_data: `${base}:settings` },
      ]);
    }

    const replyMarkup = { inline_keyboard: inlineKeyboard };

    return { text: summary.join('\n'), reply_markup: replyMarkup };
  }

  async resolveProjectContext(callbackId, { forceMetaRefresh = false } = {}) {
    const rawCallback = String(callbackId ?? '');
    const targetId = normalizeProjectIdForCallback(rawCallback);
    const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 100);

    let matchedRecord = null;
    let matchedRaw = null;

    for (const key of projectKeys) {
      try {
        const raw = await this.storage.getJson('DB', key);
        const record = normalizeProjectRecord(key, raw);
        const candidates = new Set([
          normalizeProjectIdForCallback(record.id),
          normalizeProjectIdForCallback(record.code || record.name || ''),
          record.id ? String(record.id).toLowerCase() : '',
          record.code ? String(record.code).toLowerCase() : '',
        ]);

        if (candidates.has(targetId) || candidates.has(rawCallback.toLowerCase())) {
          matchedRecord = record;
          matchedRaw = raw || {};
          break;
        }
      } catch (error) {
        console.warn('Failed to resolve project record', key, error);
      }
    }

    let metaResult = null;
    if (this.metaService) {
      metaResult = forceMetaRefresh
        ? await this.metaService.refreshOverview()
        : await this.metaService.ensureOverview({
            backgroundRefresh: true,
            executionContext: this.executionContext,
          });
    } else {
      const status = await this.storage.readMetaStatus();
      metaResult = { status };
    }

    const metaStatus = metaResult?.status ?? metaResult ?? null;
    const accounts = Array.isArray(metaStatus?.facebook?.adAccounts)
      ? metaStatus.facebook.adAccounts
      : [];

    let account = null;
    if (matchedRecord?.adAccountId) {
      const targetAccountId = String(matchedRecord.adAccountId).replace(/^act_/, '');
      account = accounts.find((item) => {
        const accountId = String(item?.accountId ?? item?.id ?? '').replace(/^act_/, '');
        return accountId && accountId === targetAccountId;
      });
    }

    if (!account) {
      account = accounts.find((item) => {
        const accountId = String(item?.accountId ?? item?.id ?? '').replace(/^act_/, '');
        const normalized = normalizeProjectIdForCallback(accountId || item?.name || '');
        return normalized === targetId;
      });
    }

    if (!matchedRecord && account) {
      matchedRecord = {
        id: account.accountId || account.id,
        key: `${PROJECT_KEY_PREFIX}${account.accountId || account.id}`,
        code: '',
        name: account.name || account.id,
        adAccountId: account.accountId || account.id,
        chatId: '',
        threadId: '',
        chatTitle: '',
        chatUrl: '',
        metrics: {
          spendTodayUsd: account.spendTodayUsd ?? null,
          currency: account.currency || 'USD',
        },
      };
      matchedRaw = {};
    }

    return {
      project: matchedRecord,
      rawProject: matchedRaw,
      account: account || null,
      metaStatus,
    };
  }

  async handleAdminCallback(callback, data) {
    const id = callback?.id;
    const userId = normalizeTelegramId(callback?.from?.id);

    if (!userId || !this.config.adminIds.has(userId)) {
      if (id) {
        try {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: '⛔ Недостаточно прав для выполнения действия.',
            show_alert: true,
          });
        } catch (error) {
          console.error('Failed to answer unauthorized admin callback', error);
        }
      }

      this.queueLog({
        kind: 'callback',
        status: 'forbidden',
        data,
        user_id: userId,
      });
      return { handled: false, reason: 'not_admin' };
    }

    if (!id) {
      this.queueLog({ kind: 'callback', status: 'ignored', reason: 'missing_id', data });
      return { handled: false };
    }

    const message = callback?.message ?? null;
    const chatId = message?.chat?.id ?? callback?.from?.id ?? null;

    try {
      if (data === 'admin:fb:auth') {
        const workerUrl = typeof this.config.workerUrl === 'string' ? this.config.workerUrl.trim() : '';
        if (!workerUrl) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Укажите WORKER_URL в окружении воркера.',
            show_alert: true,
          });
          return { handled: false, reason: 'worker_url_missing' };
        }

        const session = await this.createMetaOAuthSession({
          adminId: userId,
          chatId,
          threadId: message?.message_thread_id ?? null,
        });

        if (!session) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось подготовить ссылку OAuth. Попробуйте позже.',
            show_alert: true,
          });
          return { handled: false, reason: 'oauth_session_failed' };
        }

        const body = [
          '<b>Авторизация Meta</b>',
          'Откройте ссылку, чтобы выдать боту доступ к рекламным аккаунтам.',
          'После завершения авторизации вернитесь в админ-панель — токен сохранится автоматически.',
        ];

        const replyMarkup = {
          inline_keyboard: [[{ text: 'Открыть Meta OAuth', url: session.link }]],
        };

        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: `${body.join('\n')}\n\n${escapeHtml(session.link)}`,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyMarkup,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Ссылка для авторизации отправлена.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
          action: 'meta_oauth_link',
        });
        return { handled: true };
      }

      if (data === 'admin:project:connect') {
        let accounts = [];
        if (this.metaService) {
          try {
            const overview = await this.metaService.ensureOverview({
              backgroundRefresh: true,
              executionContext: this.executionContext,
            });
            accounts = Array.isArray(overview?.status?.facebook?.adAccounts)
              ? overview.status.facebook.adAccounts
              : [];
          } catch (error) {
            console.warn('Failed to load Meta overview for project connect', error);
          }
        } else {
          const status = await this.storage.readMetaStatus();
          accounts = Array.isArray(status?.facebook?.adAccounts) ? status.facebook.adAccounts : [];
        }

        await this.startProjectConnectSession({
          userId,
          chatId,
          threadId: message?.message_thread_id ?? null,
          accounts,
        });

        const lines = [
          '<b>Подключение проекта</b>',
          'Укажите параметры через <code>ключ=значение</code>:',
          '<code>account=act_123456789</code>',
          '<code>chat=-100123456789:5</code>',
          '<code>code=my-project</code>',
          '<code>name=Название проекта</code>',
          '<code>timezone=Asia/Tashkent</code>',
          '',
          'После ввода отправьте <code>save</code>, чтобы сохранить проект, или /cancel для отмены.',
        ];

        if (Array.isArray(accounts) && accounts.length > 0) {
          lines.push('', '<b>Доступные аккаунты</b>');
          const preview = accounts.slice(0, 6);
          for (const account of preview) {
            const accountId = String(account?.accountId ?? account?.id ?? '').replace(/^act_/, '');
            lines.push(
              `• <code>act_${escapeHtml(accountId)}</code> — ${escapeHtml(account?.name || 'без названия')} (${escapeHtml(
                account?.currency || 'USD',
              )})`,
            );
          }
          if (accounts.length > preview.length) {
            lines.push(`… и ещё ${accounts.length - preview.length}`);
          }
        }

        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: lines.join('\n'),
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Форма отправлена.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
          action: 'project_connect_start',
        });
        return { handled: true };
      }

      if (data === 'admin:projects') {
        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 50);
        const items = projectKeys.map((key) => key.replace(PROJECT_KEY_PREFIX, '')).filter(Boolean);
        const body = items.length
          ? ['<b>Подключённые проекты</b>', ...items.map((item) => `• ${escapeHtml(item)}`)].join('\n')
          : '<b>Проекты пока не подключены.</b>';

        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: body,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Список проектов отправлен.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data === 'admin:webhook:refresh') {
        const result = await this.refreshWebhook({ dropPending: true });
        if (!result.ok) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: `Ошибка: ${result.error ?? 'не удалось обновить вебхук'}`,
            show_alert: true,
          });
          this.queueLog({
            kind: 'callback',
            status: 'error',
            data,
            chat_id: chatId,
            user_id: userId,
            error: result.error,
          });
          return { handled: false, error: result.error || 'webhook_refresh_failed' };
        }

        if (message?.message_id && message?.chat?.id) {
          const panel = await this.buildAdminPanelPayload();
          await this.telegram.editMessageText({
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: panel.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: panel.reply_markup,
          });
        }

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Вебхук перезапущен.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
          url: result.url,
        });
        return { handled: true };
      }

      if (data === 'admin:refresh') {
        if (!message?.message_id || !message?.chat?.id) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Сообщение больше недоступно',
            show_alert: true,
          });
          return { handled: false, reason: 'message_missing' };
        }

        const panel = await this.buildAdminPanelPayload({ forceMetaRefresh: true });
        await this.telegram.editMessageText({
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: panel.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: panel.reply_markup,
        });

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Панель обновлена.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: message.chat.id,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data === 'admin:panel') {
        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const panel = await this.buildAdminPanelPayload();
        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: panel.text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: panel.reply_markup,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Админ-панель отправлена.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data === 'admin:logs') {
        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const logs = await this.storage.readTelegramLog(10);
        const body = logs.length
          ? ['<b>Журнал Telegram</b>', ...logs.map((entry) => formatLogLine(entry, { timezone: this.config.defaultTimezone, limit: 120 }))].join('\n')
          : '<b>Журнал Telegram пуст.</b>';

        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: body,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Логи отправлены.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data.startsWith('admin:alert:')) {
        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Отмечено.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
          action: 'alert:dismiss',
        });
        return { handled: true };
      }

      if (data.startsWith('admin:project:')) {
        const parts = data.split(':');
        const projectId = parts[2] || '';
        const action = parts[3] || 'open';
        const subAction = parts[4] || '';
        const base = `admin:project:${projectId}`;

        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат для вывода информации о проекте.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const context = await this.resolveProjectContext(projectId, {
          forceMetaRefresh: action === 'refresh',
        });

        if (!context.project) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Проект не найден. Проверьте настройки админ-панели.',
            show_alert: true,
          });
          return { handled: false, reason: 'project_missing' };
        }

        if (action === 'open' || action === 'refresh') {
          const detail = buildProjectDetailMessage({
            project: context.project,
            account: context.account,
            rawProject: context.rawProject,
            timezone: this.config.defaultTimezone,
          });
          const replyMarkup = buildProjectDetailKeyboard(base, {
            chatUrl: context.project.chatUrl,
          });

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: detail.text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: replyMarkup,
            },
            message,
          );

          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: action === 'refresh' ? 'Данные проекта обновлены.' : 'Открываю проект.',
          });

          this.queueLog({
            kind: 'callback',
            status: 'ok',
            data,
            chat_id: chatId,
            user_id: userId,
            project_id: context.project.id,
          });

          return { handled: true };
        }

        if (action === 'report') {
          if (subAction === 'csv') {
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Экспорт CSV появится после подключения хранилища.',
              show_alert: true,
            });
            return { handled: true };
          }

          if (subAction === 'custom') {
            const session = await this.startAdminSession({
              userId,
              chatId,
              threadId: message?.message_thread_id ?? null,
              project: context.project,
              kind: 'report_custom',
              base,
            });

            await this.sendMessageWithFallback(
              {
                chat_id: chatId,
                text: [
                  '<b>Пользовательский период отчёта</b>',
                  'Отправьте даты в формате <code>YYYY-MM-DD YYYY-MM-DD</code>.',
                  'Например: <code>2024-05-01 2024-05-07</code>.',
                ].join('\n'),
                parse_mode: 'HTML',
                disable_web_page_preview: true,
              },
              message,
            );

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Жду диапазон дат в следующем сообщении.',
            });
            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: 'report:custom:start',
              session: session ? { kind: session.kind, project_key: session.projectKey } : null,
            });
            return { handled: true };
          }

          const preset = subAction || 'today';
          const scheduleSettings = extractScheduleSettings(context.rawProject);
          const timezone = scheduleSettings?.timezone || this.config.defaultTimezone;
          const campaignFilter = extractReportCampaignFilter(context.rawProject);

          let reportData = null;
          if (this.metaService) {
            try {
              reportData = await this.metaService.fetchAccountReport({
                project: context.project,
                account: context.account,
                preset,
                timezone,
                campaignIds: campaignFilter,
              });
            } catch (error) {
              const errorMessage = error?.message || 'Не удалось получить данные Meta.';
              await this.sendMessageWithFallback(
                {
                  chat_id: chatId,
                  text: ['<b>Ошибка при формировании отчёта</b>', escapeHtml(errorMessage)].join('\n'),
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                },
                message,
              );
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Не удалось получить данные Meta.',
                show_alert: true,
              });
              this.queueLog({
                kind: 'callback',
                status: 'error',
                data,
                chat_id: chatId,
                user_id: userId,
                project_id: context.project.id,
                action: `report:${preset}`,
                error: errorMessage,
              });
              return { handled: true };
            }
          }

          const preview = buildProjectReportPreview({
            project: context.project,
            account: context.account,
            rawProject: context.rawProject,
            preset,
            report: reportData,
          });

          let bodyText = preview.text;
          if (!this.metaService) {
            bodyText = `${bodyText}\n⚠️ Прямая выгрузка Meta недоступна — показаны сохранённые данные.`;
          } else if (!reportData) {
            bodyText = `${bodyText}\n⚠️ Не удалось получить свежий отчёт — показаны данные панели.`;
          }

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: bodyText,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: buildProjectReportKeyboard(base),
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Отчёт подготовлен.' });
          this.queueLog({
            kind: 'callback',
            status: 'ok',
            data,
            chat_id: chatId,
            user_id: userId,
            project_id: context.project.id,
            action: `report:${preset}`,
            range: reportData?.range || null,
          });

          return { handled: true };
        }

        if (action === 'digest') {
          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: [
                '<b>Сводный отчёт</b>',
                'В следующей итерации добавим комбинированный отчёт (неделя + сегодня/вчера) и автоматическую отправку клиенту.',
                'Сейчас можно воспользоваться кнопками периодов для просмотра статистики.',
              ].join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: buildProjectReportKeyboard(base),
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Сводный отчёт в разработке.' });
          return { handled: true };
        }

        if (action === 'kpi' && subAction === 'edit') {
          const session = await this.startAdminSession({
            userId,
            chatId,
            threadId: message?.message_thread_id ?? null,
            project: context.project,
            kind: 'kpi_edit',
            base,
          });

          const kpi = extractProjectKpi(context.rawProject);
          const instructions = [
            '<b>Редактор KPI</b>',
            'Отправьте параметры в формате <code>ключ=значение</code> в следующем сообщении. Примеры:',
            '<code>objective=LEAD_GENERATION</code>',
            '<code>cpa=2.4</code>',
            '<code>leads=12</code>',
            '<code>budget=50</code>',
            '<code>currency=USD</code>',
            'Чтобы очистить значение, укажите <code>-</code> (например, <code>cpl=-</code>). Для отмены — /cancel или «отмена».',
            '',
            '<b>Текущие KPI</b>',
            ...formatKpiLines(kpi),
          ];

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: instructions.join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                    { text: '⚙️ Настройки', callback_data: `${base}:settings` },
                  ],
                ],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Жду значения KPI.' });
          this.queueLog({
            kind: 'callback',
            status: 'ok',
            data,
            chat_id: chatId,
            user_id: userId,
            project_id: context.project.id,
            action: 'kpi_edit_start',
            session: session ? { kind: session.kind, project_key: session.projectKey } : null,
          });

          return { handled: true };
        }

        if (action === 'kpi') {
          const kpi = extractProjectKpi(context.rawProject);
          const body = ['<b>KPI проекта</b>', ...formatKpiLines(kpi)];
          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: body.join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✏️ Изменить KPI', callback_data: `${base}:kpi:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'KPI отображены.' });
          return { handled: true };
        }

        if (action === 'autopause') {
          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: [
                '<b>Автопауза</b>',
                'Настройка пауз кампаний по KPI появится после подключения автоматического управления.',
                'Подготовьте список кампаний и порог превышения CPL/CPA — бот будет отслеживать их ежедневно.',
              ].join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🕒 Изменить расписание', callback_data: `${base}:schedule:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Автопауза скоро будет.' });
          return { handled: true };
        }

        if (action === 'schedule' && subAction === 'edit') {
          const session = await this.startAdminSession({
            userId,
            chatId,
            threadId: message?.message_thread_id ?? null,
            project: context.project,
            kind: 'schedule_edit',
            base,
          });

          const schedule = extractScheduleSettings(context.rawProject);
          const instructions = [
            '<b>Редактор расписания</b>',
            'Укажите параметры через <code>ключ=значение</code>. Можно перечислять несколько ключей в одном сообщении:',
            '<code>cadence=daily</code>',
            '<code>times=09:30,19:00</code>',
            '<code>periods=today,week</code>',
            '<code>timezone=Asia/Tashkent</code>',
            '<code>quiet_weekends=yes</code>',
            'Чтобы очистить значение, укажите <code>-</code>. Для отмены — /cancel или «отмена».',
            '',
            '<b>Текущее расписание</b>',
            ...formatScheduleLines(schedule, { timezone: this.config.defaultTimezone }),
          ];

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: instructions.join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                    { text: '🎯 KPI', callback_data: `${base}:kpi` },
                  ],
                  [{ text: '⚙️ Настройки', callback_data: `${base}:settings` }],
                ],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Жду параметры расписания.' });
          this.queueLog({
            kind: 'callback',
            status: 'ok',
            data,
            chat_id: chatId,
            user_id: userId,
            project_id: context.project.id,
            action: 'schedule_edit_start',
            session: session ? { kind: session.kind, project_key: session.projectKey } : null,
          });

          return { handled: true };
        }

        if (action === 'settings') {
          const schedule = extractScheduleSettings(context.rawProject);
          const alerts = extractAlertSettings(context.rawProject);
          const body = [
            '<b>Настройки проекта</b>',
            '',
            '<b>Расписание</b>',
            ...formatScheduleLines(schedule, { timezone: this.config.defaultTimezone }),
            '',
            '<b>Алерты</b>',
            ...formatAlertLines(alerts, { account: context.account, campaigns: context.account?.campaignSummaries }),
            '',
            'Используйте кнопки ниже, чтобы изменить расписание или вернуться к проекту.',
          ];

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: body.join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🕒 Изменить расписание', callback_data: `${base}:schedule:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Настройки показаны.' });
          return { handled: true };
        }

        if (action === 'payment') {
          const lines = [
            '<b>Оплата Facebook</b>',
            'Чтобы отметить платёж вручную, отправьте сумму и дату в следующем сообщении.',
            'Например: <code>Оплатили 120$ 2024-05-12</code>.',
            'Бот зафиксирует событие в журнале и снимет предупреждение о задолженности.',
          ];

          await this.sendMessageWithFallback(
            {
              chat_id: chatId,
              text: lines.join('\n'),
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [[{ text: '⬅️ К проекту', callback_data: `${base}:open` }]],
              },
            },
            message,
          );

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Жду информацию об оплате.' });
          return { handled: true };
        }

        if (action === 'chat') {
          if (context.project.chatUrl) {
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Открываю чат проекта.',
              url: context.project.chatUrl,
            });
            return { handled: true };
          }

          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Чат проекта пока не привязан. Добавьте его в карточке проекта.',
            show_alert: true,
          });
          return { handled: true };
        }

        await this.telegram.answerCallbackQuery({
          callback_query_id: id,
          text: 'Действие пока не поддерживается.',
          show_alert: true,
        });
        return { handled: false, reason: `unhandled_action_${action}` };
      }

      await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Действие пока не поддерживается.' });
      this.queueLog({
        kind: 'callback',
        status: 'ignored',
        data,
        chat_id: chatId,
        user_id: userId,
      });
      return { handled: false, reason: 'unknown_admin_action' };
    } catch (error) {
      console.error('Admin callback failed', error);
      await this.telegram.answerCallbackQuery({
        callback_query_id: id,
        text: 'Ошибка обработки запроса. Попробуйте позже.',
        show_alert: true,
      });
      this.queueLog({
        kind: 'callback',
        status: 'error',
        data,
        chat_id: chatId,
        user_id: userId,
        error: error?.message || String(error),
      });
      return { handled: false, error: error?.message || 'admin_callback_failed' };
    }
  }
}
class AppConfig {
  constructor(env = {}) {
    this.botToken = AppConfig.resolveToken(env);
    this.adminIds = parseAdminIds(env.ADMIN_IDS);
    this.defaultTimezone = typeof env.DEFAULT_TZ === 'string' ? env.DEFAULT_TZ.trim() : '';
    this.workerUrl = typeof env.WORKER_URL === 'string' ? env.WORKER_URL.trim() : '';
    this.metaAppId = typeof env.FB_APP_ID === 'string' ? env.FB_APP_ID.trim() : '';
    this.metaAppSecret = typeof env.FB_APP_SECRET === 'string' ? env.FB_APP_SECRET.trim() : '';
    this.metaLongToken = AppConfig.resolveMetaLongToken(env);
    this.metaGraphVersion = AppConfig.resolveMetaGraphVersion(env);
    this.metaManageToken = AppConfig.resolveMetaManageToken(env);
    this.telegramWebhookUrl = AppConfig.resolveWebhookUrl(env);
    this.portalAccessToken = AppConfig.resolvePortalToken(env);
    this.metaOAuthRedirectUrl = AppConfig.resolveMetaRedirectUrl(env);
  }

  static resolveToken(env = {}) {
    const candidateKeys = [
      'BOT_TOKEN',
      'TG_API_TOKEN',
      'TG_BOT_TOKEN',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_TOKEN',
      'TELEGRAM_API_TOKEN',
      'TELEGRAM_BOT_API_TOKEN',
    ];

    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) return value;
    }

    return '';
  }

  static resolveWebhookUrl(env = {}) {
    const candidateKeys = ['TELEGRAM_WEBHOOK_URL', 'TG_WEBHOOK_URL', 'WEBHOOK_URL'];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }

  static resolveMetaLongToken(env = {}) {
    const candidateKeys = ['FB_LONG_TOKEN', 'META_LONG_TOKEN', 'META_ACCESS_TOKEN'];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }

  static resolveMetaGraphVersion(env = {}) {
    const candidateKeys = ['FB_GRAPH_VERSION', 'META_GRAPH_VERSION'];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return META_DEFAULT_GRAPH_VERSION;
  }

  static resolveMetaManageToken(env = {}) {
    const candidateKeys = ['META_MANAGE_TOKEN', 'FB_MANAGE_TOKEN', 'MANAGE_TOKEN'];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }

  static resolvePortalToken(env = {}) {
    const candidateKeys = ['PORTAL_TOKEN', 'PORTAL_SIGNING_SECRET', 'PORTAL_SECRET'];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }

  static resolveMetaRedirectUrl(env = {}) {
    const candidateKeys = [
      'META_REDIRECT_URL',
      'META_OAUTH_REDIRECT',
      'FB_REDIRECT_URL',
      'FB_OAUTH_REDIRECT',
    ];
    for (const key of candidateKeys) {
      const value = typeof env[key] === 'string' ? env[key].trim() : '';
      if (value) {
        return value;
      }
    }
    return '';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class WorkerApp {
  constructor(request, env, executionContext) {
    this.request = request;
    this.env = env;
    this.executionContext = executionContext;
    this.storage = new KvStorage(env);
    this.config = new AppConfig(env);
    this.metaService = new MetaService({ config: this.config, storage: this.storage, env: this.env });
    this._telegramClient = null;
    this._bot = null;
  }

  get telegramClient() {
    if (!this._telegramClient && this.config.botToken) {
      this._telegramClient = new TelegramClient(this.config.botToken, {});
    }
    return this._telegramClient;
  }

  get bot() {
    if (!this._bot) {
      const telegram = this.telegramClient;
      if (!telegram || !telegram.isUsable) {
        return null;
      }
      this._bot = new TelegramBot({
        config: this.config,
        storage: this.storage,
        telegram,
        env: this.env,
        executionContext: this.executionContext,
        metaService: this.metaService,
      });
    }
    return this._bot;
  }

  async handleFetch() {
    const url = new URL(this.request.url);

    const trimmedPath = url.pathname.replace(/\/+$/, '');
    const normalizedPath = trimmedPath || '/';

    if (
      this.request.method === 'POST' &&
      /^\/(tg|telegram|webhook)(\/.*)?$/i.test(trimmedPath || '/')
    ) {
      return this.handleTelegramWebhook({ url });
    }

    if (normalizedPath === '/health') {
      return this.handleHealth(url);
    }

    if (
      normalizedPath === '/manage/telegram/webhook' ||
      normalizedPath.startsWith('/manage/telegram/webhook/')
    ) {
      return this.handleTelegramWebhookManage(url, { normalizedPath });
    }

    if (normalizedPath === '/manage/meta' || normalizedPath.startsWith('/manage/meta/')) {
      return this.handleMetaManage(url, { normalizedPath });
    }

    if (normalizedPath === '/fb_auth') {
      return this.handleFacebookAuth(url);
    }

    if (normalizedPath === '/fb_cb') {
      return this.handleFacebookCallback(url);
    }

    if (normalizedPath === '/fb_debug') {
      return this.handleFacebookDebug(url);
    }

    if (normalizedPath.startsWith('/p/')) {
      return this.handleClientPortal(url, { normalizedPath });
    }

    if (normalizedPath === '/') {
      return htmlResponse('<h1>Targetbot (этап 1)</h1><p>Базовый каркас воркера активен.</p>');
    }

    return textResponse('Not found', { status: 404 });
  }

  async handleHealth(url) {
    const includeTelegram = url.searchParams.get('ping') === 'telegram' || url.searchParams.get('ping') === 'all';
    const includeLogs = url.searchParams.has('telegram_logs');
    const logsLimit = Number.parseInt(url.searchParams.get('telegram_logs_limit') || '', 10) || 10;

    const status = {
      ok: Boolean(this.config.botToken),
      timestamp: new Date().toISOString(),
      botToken: this.config.botToken ? 'present' : 'missing',
      adminIds: Array.from(this.config.adminIds),
      defaultTimezone: this.config.defaultTimezone || null,
      workerUrl: this.config.workerUrl || null,
    };

    if (includeTelegram && this.config.botToken) {
      try {
        const info = await this.telegramClient.getWebhookInfo();
        status.telegram = {
          ok: true,
          url: info?.url ?? null,
          pending_update_count: info?.pending_update_count ?? 0,
          has_custom_certificate: info?.has_custom_certificate ?? false,
          ip_address: info?.ip_address ?? null,
          last_error_date: info?.last_error_date ?? null,
          last_error_message: info?.last_error_message ?? null,
        };
      } catch (error) {
        status.telegram = { ok: false, error: error?.message || String(error) };
      }
    }

    if (includeLogs) {
      try {
        status.telegramLogs = await this.storage.readTelegramLog(Math.min(Math.max(logsLimit, 1), TELEGRAM_LOG_LIMIT));
      } catch (error) {
        status.telegramLogs = { error: error?.message || String(error) };
      }
    }

    return jsonResponse(status);
  }

  async handleTelegramWebhook({ url } = {}) {
    if (!this.config.botToken) {
      return jsonResponse({ ok: false, error: 'BOT_TOKEN отсутствует' }, { status: 503 });
    }

    let update;
    try {
      update = await this.request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    if (url) {
      const segments = url.pathname.split('/').filter(Boolean);
      const first = segments[0]?.toLowerCase();
      if (['tg', 'telegram', 'webhook'].includes(first) && segments.length === 2) {
        const candidate = segments[1];
        if (!isValidWebhookToken(candidate, this.config.botToken)) {
          return jsonResponse({ ok: false, error: 'invalid_webhook_token' }, { status: 403 });
        }
      }
    }

    const bot = this.bot;
    if (!bot) {
      return jsonResponse({ ok: false, error: 'bot_not_initialized' }, { status: 503 });
    }

    const result = await bot.handleUpdate(update);
    return jsonResponse({ ok: true, result });
  }

  async handleMetaManage(url, { normalizedPath } = {}) {
    if (!this.metaService) {
      return jsonResponse({ ok: false, error: 'meta_service_unavailable' }, { status: 503 });
    }

    const segments = typeof normalizedPath === 'string' ? normalizedPath.split('/').filter(Boolean) : [];
    const pathToken = segments.length >= 3 ? safeDecode(segments[2]) : '';
    const pathAction = segments.length >= 4 ? safeDecode(segments[3] || '') : '';

    const headerToken = pickFirstFilled(
      this.request.headers.get('x-meta-token'),
      this.request.headers.get('x-telegram-token'),
      parseAuthorizationToken(this.request.headers.get('authorization')),
    );

    const queryToken = pickFirstFilled(
      url.searchParams.get('token'),
      url.searchParams.get('access_token'),
      url.searchParams.get('auth'),
    );

    const token = pickFirstFilled(queryToken, pathToken, headerToken);
    if (!isValidMetaManageToken(token, this.config)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const actionCandidate = pickFirstFilled(url.searchParams.get('action'), pathAction);
    const action = (actionCandidate || 'info').toLowerCase();

    const wantsRefresh =
      action !== 'refresh' &&
      /^(1|true|yes|on)$/i.test(url.searchParams.get('refresh') || url.searchParams.get('force') || '');

    const backgroundParam = url.searchParams.get('background') || url.searchParams.get('bg') || '';
    const backgroundRefresh = backgroundParam
      ? /^(1|true|yes|on)$/i.test(backgroundParam)
      : action === 'ensure';

    if (action === 'refresh' || wantsRefresh) {
      try {
        const result = await this.metaService.refreshOverview();
        return jsonResponse({ ok: true, action: 'refresh', ...result });
      } catch (error) {
        return jsonResponse(
          { ok: false, error: error?.message || String(error), action: 'refresh' },
          { status: 502 },
        );
      }
    }

    try {
      const result = await this.metaService.ensureOverview({
        backgroundRefresh,
        executionContext: this.executionContext,
      });
      return jsonResponse({ ok: true, action: 'info', ...result });
    } catch (error) {
      return jsonResponse(
        { ok: false, error: error?.message || String(error), action: 'info' },
        { status: 502 },
      );
    }
  }

  buildWorkerAbsoluteUrl(path = '', { url } = {}) {
    const base =
      (typeof this.config.workerUrl === 'string' && this.config.workerUrl.trim()) ||
      (url?.origin ? url.origin.replace(/\/+$/, '') : '');
    if (!base) {
      return '';
    }

    if (!path) {
      return base;
    }

    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalized}`;
  }

  resolveMetaRedirectUrl(url, { session } = {}) {
    if (session?.redirectUri) {
      return session.redirectUri;
    }

    if (this.config.metaOAuthRedirectUrl) {
      return this.config.metaOAuthRedirectUrl;
    }

    const fallback = this.buildWorkerAbsoluteUrl('/fb_cb', { url });
    return fallback;
  }

  async loadMetaOauthSession(sessionId) {
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!id) {
      return null;
    }
    try {
      return await this.storage.getJson('DB', `${META_OAUTH_SESSION_PREFIX}${id}`);
    } catch (error) {
      console.warn('Failed to load Meta OAuth session', id, error);
      return null;
    }
  }

  async deleteMetaOauthSession(sessionId) {
    const id = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!id) {
      return false;
    }
    try {
      await this.storage.deleteKey('DB', `${META_OAUTH_SESSION_PREFIX}${id}`);
      return true;
    } catch (error) {
      console.warn('Failed to delete Meta OAuth session', id, error);
      return false;
    }
  }

  async handleFacebookAuth(url) {
    if (!this.config.metaAppId || !this.config.metaAppSecret) {
      return htmlResponse(
        '<h1>Meta OAuth не настроен</h1><p>Укажите переменные <code>FB_APP_ID</code> и <code>FB_APP_SECRET</code> в окружении воркера.</p>',
        { status: 503 },
      );
    }

    const sessionId = (url.searchParams.get('session') || '').trim();
    const session = await this.loadMetaOauthSession(sessionId);

    const tokenCandidate = pickFirstFilled(
      url.searchParams.get('token'),
      url.searchParams.get('auth'),
      url.searchParams.get('access_token'),
    );

    if (!session && !isValidMetaManageToken(tokenCandidate, this.config)) {
      return htmlResponse(
        '<h1>Доступ запрещён</h1><p>Добавьте параметр <code>token</code> или инициируйте авторизацию из админ-панели.</p>',
        { status: 403 },
      );
    }

    const redirectUri = this.resolveMetaRedirectUrl(url, { session });
    if (!redirectUri) {
      return htmlResponse(
        '<h1>Не удалось определить redirect_uri</h1><p>Задайте <code>META_REDIRECT_URL</code> или <code>WORKER_URL</code>.</p>',
        { status: 500 },
      );
    }

    const scopeCandidate = pickFirstFilled(
      url.searchParams.get('scope'),
      url.searchParams.get('scopes'),
      url.searchParams.get('permissions'),
      Array.isArray(session?.scopes) ? session.scopes.join(',') : '',
      session?.scope,
    );
    const scopeList = scopeCandidate
      ? Array.from(
          new Set(
            String(scopeCandidate)
              .split(/[\s,]+/)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        )
      : META_OAUTH_DEFAULT_SCOPES;

    const state = generateRandomToken(48);
    const createdAt = new Date().toISOString();
    const returnToCandidate = pickFirstFilled(url.searchParams.get('return_to'), session?.returnTo);
    const defaultReturn = this.buildWorkerAbsoluteUrl('/fb_debug', { url });
    const returnTo = returnToCandidate || defaultReturn;

    const statePayload = {
      state,
      createdAt,
      redirectUri,
      returnTo,
      scopes: scopeList,
      sessionId: sessionId || null,
      adminId: session?.adminId || null,
      chatId: session?.chatId || null,
      threadId: session?.threadId || null,
      workerUrl: this.config.workerUrl || null,
    };

    try {
      await this.storage.putJson('DB', `${META_OAUTH_STATE_PREFIX}${state}`, statePayload, {
        expirationTtl: META_OAUTH_STATE_TTL_SECONDS,
      });
    } catch (error) {
      console.error('Failed to persist Meta OAuth state', error);
      return htmlResponse(
        '<h1>OAuth недоступен</h1><p>Не удалось сохранить состояние авторизации. Повторите попытку позже.</p>',
        { status: 500 },
      );
    }

    const version = (this.config.metaGraphVersion || META_DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '');
    const dialogUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    dialogUrl.searchParams.set('client_id', this.config.metaAppId);
    dialogUrl.searchParams.set('redirect_uri', redirectUri);
    dialogUrl.searchParams.set('state', state);
    dialogUrl.searchParams.set('response_type', 'code');
    dialogUrl.searchParams.set('auth_type', 'rerequest');
    dialogUrl.searchParams.set('scope', scopeList.join(','));

    return Response.redirect(dialogUrl.toString(), 302);
  }

  async handleFacebookCallback(url) {
    const errorType = url.searchParams.get('error');
    if (errorType) {
      const message = url.searchParams.get('error_description') || url.searchParams.get('error_message') || 'Авторизация отменена.';
      return htmlResponse(
        `<h1>Meta OAuth не завершён</h1><p>${escapeHtml(message)}</p><p>Попробуйте снова из админ-панели.</p>`,
        { status: 400 },
      );
    }

    const code = (url.searchParams.get('code') || '').trim();
    const stateId = (url.searchParams.get('state') || '').trim();
    if (!code || !stateId) {
      return htmlResponse(
        '<h1>Параметры отсутствуют</h1><p>Не удалось получить код авторизации или state.</p>',
        { status: 400 },
      );
    }

    const stateKey = `${META_OAUTH_STATE_PREFIX}${stateId}`;
    let state = null;
    try {
      state = await this.storage.getJson('DB', stateKey);
    } catch (error) {
      console.warn('Failed to read Meta OAuth state', stateId, error);
    }

    if (!state) {
      return htmlResponse('<h1>Сессия истекла</h1><p>State не найден или устарел. Запустите авторизацию заново.</p>', {
        status: 400,
      });
    }

    await this.storage.deleteKey('DB', stateKey).catch((error) => {
      console.warn('Failed to cleanup Meta OAuth state', stateId, error);
    });

    if (!this.config.metaAppId || !this.config.metaAppSecret) {
      return htmlResponse(
        '<h1>Meta OAuth не настроен</h1><p>Укажите переменные <code>FB_APP_ID</code> и <code>FB_APP_SECRET</code>.</p>',
        { status: 503 },
      );
    }

    const redirectUri = state.redirectUri || this.resolveMetaRedirectUrl(url);
    if (!redirectUri) {
      return htmlResponse(
        '<h1>Не удалось определить redirect_uri</h1><p>Запросите авторизацию повторно с корректной конфигурацией.</p>',
        { status: 500 },
      );
    }

    const version = (this.config.metaGraphVersion || META_DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '');
    const exchangeParams = new URLSearchParams({
      client_id: this.config.metaAppId,
      redirect_uri: redirectUri,
      client_secret: this.config.metaAppSecret,
      code,
    });

    let shortLived = null;
    try {
      const response = await fetch(`https://graph.facebook.com/${version}/oauth/access_token?${exchangeParams.toString()}`);
      const data = await response.json();
      if (!response.ok || !data?.access_token) {
        throw new Error(data?.error?.message || `OAuth exchange failed (${response.status})`);
      }
      shortLived = data;
    } catch (error) {
      console.error('Meta OAuth exchange failed', error);
      return htmlResponse(
        `<h1>Не удалось получить токен</h1><p>${escapeHtml(error?.message || String(error))}</p>`,
        { status: 502 },
      );
    }

    let longLived = shortLived;
    try {
      const exchange = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
      exchange.searchParams.set('grant_type', 'fb_exchange_token');
      exchange.searchParams.set('client_id', this.config.metaAppId);
      exchange.searchParams.set('client_secret', this.config.metaAppSecret);
      exchange.searchParams.set('fb_exchange_token', shortLived.access_token);

      const response = await fetch(exchange);
      const data = await response.json();
      if (response.ok && data?.access_token) {
        longLived = data;
      }
    } catch (error) {
      console.warn('Meta long-lived exchange failed, falling back to short-lived token', error);
    }

    const accessToken = longLived?.access_token || shortLived?.access_token;
    if (!accessToken) {
      return htmlResponse('<h1>Токен пуст</h1><p>Meta не вернул access_token. Попробуйте ещё раз.</p>', { status: 502 });
    }

    const payload = {
      token: accessToken,
      access_token: accessToken,
      obtained_at: new Date().toISOString(),
      expires_in: longLived?.expires_in ?? shortLived?.expires_in ?? null,
      short_lived_expires_in: shortLived?.expires_in ?? null,
      token_type: longLived?.token_type || shortLived?.token_type || 'bearer',
      scope: Array.isArray(state?.scopes) ? state.scopes : META_OAUTH_DEFAULT_SCOPES,
      source: 'oauth',
    };

    let profile = null;
    try {
      const profileUrl = new URL(`https://graph.facebook.com/${version}/me`);
      profileUrl.searchParams.set('fields', 'id,name');
      profileUrl.searchParams.set('access_token', accessToken);
      const response = await fetch(profileUrl);
      const data = await response.json();
      if (response.ok) {
        profile = data;
        payload.profile = { id: data?.id || null, name: data?.name || null };
      }
    } catch (error) {
      console.warn('Meta profile fetch failed after OAuth', error);
    }

    try {
      await this.storage.putJson('DB', META_TOKEN_KEY, payload);
    } catch (error) {
      console.error('Failed to store Meta token', error);
      return htmlResponse(
        `<h1>Не удалось сохранить токен</h1><p>${escapeHtml(error?.message || String(error))}</p>`,
        { status: 500 },
      );
    }

    if (state.sessionId) {
      await this.deleteMetaOauthSession(state.sessionId);
    }

    if (this.metaService) {
      const refreshTask = this.metaService
        .refreshOverview()
        .catch((error) => console.error('Meta overview refresh after OAuth failed', error));
      if (this.executionContext?.waitUntil) {
        this.executionContext.waitUntil(refreshTask);
      } else {
        await refreshTask;
      }
    }

    const expiresIn = Number(longLived?.expires_in ?? shortLived?.expires_in ?? 0);
    const expiresLabel = expiresIn
      ? formatDaysUntil(new Date(Date.now() + expiresIn * 1000)).label
      : '—';

    const successLines = [
      '<h1>Meta OAuth завершён</h1>',
      '<p>Токен сохранён в Cloudflare KV и будет использоваться для запросов Graph API.</p>',
      profile?.name ? `<p>Подключённый профиль: <strong>${escapeHtml(profile.name)}</strong></p>` : '',
      expiresLabel !== '—' ? `<p>Срок действия токена: <strong>${escapeHtml(expiresLabel)}</strong></p>` : '',
      state.returnTo ? `<p><a href="${escapeHtml(state.returnTo)}">Вернуться к диагностике</a></p>` : '',
    ].filter(Boolean);

    const successHtml = successLines.join('');

    const notifyTargets = [];
    if (state.chatId) {
      notifyTargets.push({
        chat_id: state.chatId,
        message_thread_id: state.threadId ? Number(state.threadId) : undefined,
      });
    }
    if (state.adminId && (!state.chatId || state.chatId !== state.adminId)) {
      notifyTargets.push({ chat_id: state.adminId });
    }

    if (notifyTargets.length > 0 && this.telegramClient?.isUsable) {
      const textLines = [
        '✅ <b>Meta OAuth завершён</b>',
        profile?.name ? `Профиль: <b>${escapeHtml(profile.name)}</b>` : null,
        expiresLabel !== '—' ? `Срок действия: <b>${escapeHtml(expiresLabel)}</b>` : null,
        'Токен обновлён и сохранён в KV.',
      ].filter(Boolean);
      const text = textLines.join('\n');
      for (const target of notifyTargets) {
        try {
          await this.telegramClient.sendMessage({
            chat_id: target.chat_id,
            message_thread_id: target.message_thread_id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        } catch (error) {
          console.error('Failed to notify OAuth completion', target.chat_id, error);
        }
      }
    }

    return htmlResponse(successHtml);
  }

  async handleFacebookDebug(url) {
    const sessionId = (url.searchParams.get('session') || '').trim();
    const session = await this.loadMetaOauthSession(sessionId);
    const tokenCandidate = pickFirstFilled(
      url.searchParams.get('token'),
      url.searchParams.get('auth'),
      url.searchParams.get('access_token'),
    );

    if (!session && !isValidMetaManageToken(tokenCandidate, this.config)) {
      return htmlResponse(
        '<h1>Доступ запрещён</h1><p>Используйте параметр <code>token</code> или ссылку из админ-панели.</p>',
        { status: 403 },
      );
    }

    let stored = null;
    try {
      stored = await this.storage.getJson('DB', META_TOKEN_KEY);
    } catch (error) {
      console.warn('Failed to read stored Meta token', error);
    }

    const refreshDebug = /^(1|true|yes|refresh)$/i.test(url.searchParams.get('refresh') || '');
    let debugInfo = null;
    if (refreshDebug && this.metaService) {
      try {
        debugInfo = await this.metaService.debugToken({ token: stored?.token || stored?.access_token });
      } catch (error) {
        debugInfo = { error: error?.message || String(error) };
      }
    }

    const parts = [
      '<h1>Meta OAuth диагностика</h1>',
      stored
        ? `<p>Токен сохранён: <strong>${escapeHtml(stored.obtained_at || stored.updated_at || 'неизвестно')}</strong></p>`
        : '<p>Токен не найден в KV.</p>',
      stored?.profile?.name
        ? `<p>Профиль: <strong>${escapeHtml(stored.profile.name)}</strong> (ID: ${escapeHtml(stored.profile.id || '—')})</p>`
        : '',
      stored?.expires_in
        ? `<p>Осталось: <strong>${escapeHtml(
            formatDaysUntil(new Date(Date.now() + Number(stored.expires_in) * 1000)).label,
          )}</strong></p>`
        : '',
      '<details><summary>Сырые данные токена</summary><pre>',
      escapeHtml(JSON.stringify(stored, null, 2) || 'null'),
      '</pre></details>',
    ];

    if (debugInfo) {
      parts.push('<details open><summary>debug_token</summary><pre>');
      parts.push(escapeHtml(JSON.stringify(debugInfo, null, 2)));
      parts.push('</pre></details>');
    } else {
      parts.push(
        `<p><a href="${escapeHtml(url.toString().includes('?') ? `${url.toString()}&refresh=1` : `${url.toString()}?refresh=1`)}">Обновить debug_token</a></p>`,
      );
    }

    return htmlResponse(parts.join(''));
  }

  async handleClientPortal(url, { normalizedPath } = {}) {
    if (!this.metaService) {
      return htmlResponse('<h1>Портал недоступен</h1><p>Сервис Meta временно отключён.</p>', { status: 503 });
    }

    const method = (this.request.method || 'GET').toUpperCase();
    const segments = typeof normalizedPath === 'string' ? normalizedPath.split('/').filter(Boolean) : [];
    if (segments.length < 2) {
      return htmlResponse('<h1>Ссылка некорректна</h1><p>Не указан код проекта.</p>', { status: 400 });
    }

    const projectCode = safeDecode(segments[1] || '');
    if (!projectCode) {
      return htmlResponse('<h1>Ссылка некорректна</h1><p>Не удалось распознать проект.</p>', { status: 400 });
    }

    let signature = pickFirstFilled(
      url.searchParams.get('sig'),
      url.searchParams.get('signature'),
      url.searchParams.get('token'),
      url.searchParams.get('key'),
    );

    let formPayload = null;
    let jsonPayload = null;

    if (method === 'POST') {
      const contentType = (this.request.headers.get('content-type') || '').toLowerCase();
      try {
        if (contentType.includes('application/json')) {
          jsonPayload = await this.request.json();
        } else {
          formPayload = await this.request.formData();
        }
      } catch (error) {
        console.warn('Failed to parse portal request body', error);
      }

      if (!signature) {
        signature = pickFirstFilled(
          formPayload && typeof formPayload.get === 'function' ? formPayload.get('sig') : null,
          jsonPayload && typeof jsonPayload === 'object' ? jsonPayload.sig : null,
        );
      }
    }

    if (!signature) {
      return htmlResponse(
        '<h1>Требуется подпись</h1><p>Добавьте параметр <code>sig</code> или запросите новую ссылку у менеджера.</p>',
        { status: 401 },
      );
    }

    const refreshRequested = url.searchParams.get('refresh') === '1';
    const context = await this.resolveProjectContext(projectCode, {
      forceMetaRefresh: refreshRequested,
    });

    if (!context?.project) {
      return htmlResponse('<h1>Проект не найден</h1><p>Ссылка устарела или проект ещё не подключён.</p>', { status: 404 });
    }

    const tokens = extractPortalTokens(context.rawProject);
    if (this.config.portalAccessToken) {
      tokens.add(this.config.portalAccessToken);
    }
    if (this.config.metaManageToken) {
      tokens.add(this.config.metaManageToken);
    }

    if (tokens.size === 0) {
      return htmlResponse(
        '<h1>Доступ ограничен</h1><p>Для проекта ещё не настроен токен клиентского портала.</p>',
        { status: 403 },
      );
    }

    const projectIdentifier = context.project.code || context.project.id || projectCode;
    const signatureOk = await portalSignatureMatches(signature, {
      code: projectIdentifier,
      tokens,
    });

    if (!signatureOk) {
      return htmlResponse(
        '<h1>Доступ запрещён</h1><p>Проверьте подпись ссылки или запросите новую у менеджера проекта.</p>',
        { status: 403 },
      );
    }

    const timezone =
      extractScheduleSettings(context.rawProject)?.timezone || this.config.defaultTimezone || 'UTC';
    const campaignFilter = extractReportCampaignFilter(context.rawProject);
    const kpi = extractProjectKpi(context.rawProject);

    const definitions = [
      { id: 'today', label: 'Сегодня', preset: 'today' },
      { id: 'yesterday', label: 'Вчера', preset: 'yesterday' },
      { id: 'week', label: '7 дней', preset: 'week' },
      { id: 'month', label: 'МТД', preset: 'month' },
    ];

    if (method === 'POST') {
      return this.handleClientPortalPost({
        context,
        signature,
        projectCode,
        url,
        formData: formPayload,
        jsonBody: jsonPayload,
      });
    }

    const formatParam = (url.searchParams.get('format') || '').toLowerCase();
    if (formatParam === 'csv') {
      const targetId = (url.searchParams.get('period') || '').toLowerCase();
      const definition = definitions.find((item) => item.id === targetId) || definitions[0];
      return this.handleClientPortalCsv({
        context,
        definition,
        timezone,
        campaignFilter,
        kpi,
        url,
        projectCode,
      });
    }

    const periods = [];
    let inferredCurrency = context.account?.currency || context.project?.metrics?.currency || null;

    for (const definition of definitions) {
      try {
        const report = await this.metaService.fetchAccountReport({
          project: context.project,
          account: context.account,
          preset: definition.preset,
          timezone,
          campaignIds: campaignFilter,
        });

        if (!inferredCurrency && report?.currency) {
          inferredCurrency = report.currency;
        }

        periods.push({ id: definition.id, label: definition.label, report, error: null });
      } catch (error) {
        periods.push({
          id: definition.id,
          label: definition.label,
          report: null,
          error: error?.message || 'Не удалось загрузить статистику',
        });
      }
    }

    const managerLink =
      context.project?.chatUrl || buildTelegramTopicUrl(context.project?.chatId, context.project?.threadId);

    const insights = generatePortalInsights({
      periods,
      kpi,
      currency: inferredCurrency || context.account?.currency || 'USD',
    });

    const csvLinks = definitions.map((definition) => {
      const linkUrl = new URL(url.toString());
      linkUrl.searchParams.set('format', 'csv');
      linkUrl.searchParams.set('period', definition.id);
      linkUrl.searchParams.delete('feedback');
      if (!linkUrl.searchParams.get('sig')) {
        linkUrl.searchParams.set('sig', signature);
      }
      return { id: definition.id, label: definition.label, href: linkUrl.toString() };
    });

    const feedbackStatus = url.searchParams.get('feedback') || '';

    const html = renderClientPortalPage({
      project: context.project,
      account: context.account,
      periods,
      timezone,
      generatedAt: new Date(),
      managerLink,
      currency: inferredCurrency,
      kpi,
      insights,
      signature,
      csvLinks,
      feedbackStatus,
    });

    return htmlResponse(html);
  }

  async handleClientPortalPost({ context, signature, projectCode, url, formData, jsonBody }) {
    let messageText = '';
    if (formData && typeof formData.get === 'function') {
      const raw = formData.get('message');
      messageText = raw ? String(raw).trim() : '';
    }
    if (!messageText && jsonBody && typeof jsonBody === 'object') {
      const raw = jsonBody.message ?? jsonBody.text ?? '';
      messageText = raw ? String(raw).trim() : '';
    }

    const acceptHeader = (this.request.headers.get('accept') || '').toLowerCase();
    const contentTypeHeader = (this.request.headers.get('content-type') || '').toLowerCase();
    const wantsJson =
      acceptHeader.includes('application/json') || contentTypeHeader.includes('application/json');

    if (!messageText) {
      if (wantsJson) {
        return jsonResponse({ ok: false, error: 'message_required' }, { status: 400 });
      }
      const failureUrl = new URL(url.toString());
      if (!failureUrl.searchParams.get('sig') && signature) {
        failureUrl.searchParams.set('sig', signature);
      }
      failureUrl.searchParams.set('feedback', 'error');
      failureUrl.searchParams.delete('format');
      failureUrl.searchParams.delete('period');
      return Response.redirect(failureUrl.toString(), 303);
    }

    try {
      await this.sendPortalFeedback({ context, projectCode, messageText });
    } catch (error) {
      console.error('Portal feedback delivery failed', error);
      if (wantsJson) {
        return jsonResponse({ ok: false, error: error?.message || 'delivery_failed' }, { status: 502 });
      }
      const failureUrl = new URL(url.toString());
      if (!failureUrl.searchParams.get('sig') && signature) {
        failureUrl.searchParams.set('sig', signature);
      }
      failureUrl.searchParams.set('feedback', 'error');
      failureUrl.searchParams.delete('format');
      failureUrl.searchParams.delete('period');
      return Response.redirect(failureUrl.toString(), 303);
    }

    if (wantsJson) {
      return jsonResponse({ ok: true });
    }

    const redirectTarget = new URL(url.toString());
    if (!redirectTarget.searchParams.get('sig') && signature) {
      redirectTarget.searchParams.set('sig', signature);
    }
    redirectTarget.searchParams.set('feedback', 'sent');
    redirectTarget.searchParams.delete('format');
    redirectTarget.searchParams.delete('period');
    return Response.redirect(redirectTarget.toString(), 303);
  }

  async handleClientPortalCsv({ context, definition, timezone, campaignFilter, kpi, url, projectCode }) {
    let report;
    try {
      report = await this.metaService.fetchAccountReport({
        project: context.project,
        account: context.account,
        preset: definition.preset,
        timezone,
        campaignIds: campaignFilter,
      });
    } catch (error) {
      return htmlResponse(
        `<h1>Не удалось подготовить CSV</h1><p>${escapeHtml(error?.message || String(error))}</p>`,
        { status: 502 },
      );
    }

    const currency =
      report?.currency || context.account?.currency || context.project?.metrics?.currency || 'USD';

    const csv = renderPortalCsv({
      project: context.project,
      account: context.account,
      period: { id: definition.id, label: definition.label },
      report,
      timezone,
      generatedAt: new Date(),
      currency,
      kpi,
    });

    const filenameBase = normalizeProjectIdForCallback(
      context.project?.code || context.project?.id || projectCode || 'project',
    );
    const filename = `${filenameBase || 'project'}-${definition.id}.csv`;

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  }

  async sendPortalFeedback({ context, projectCode, messageText }) {
    const telegram = this.telegramClient;
    if (!telegram?.isUsable) {
      throw new Error('telegram_unavailable');
    }

    const project = context.project || {};
    const account = context.account || {};

    const lines = [
      '💬 <b>Сообщение из клиентского портала</b>',
      project.name || project.code || project.id || projectCode
        ? `Проект: <b>${escapeHtml(project.name || project.code || project.id || projectCode)}</b>`
        : null,
      account.name ? `Рекламный аккаунт: <code>${escapeHtml(account.name)}</code>` : null,
      '',
      escapeHtml(messageText),
    ].filter(Boolean);

    const text = lines.join('\n');
    const payloads = [];

    if (project.chatId) {
      const payload = {
        chat_id: project.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (project.threadId) {
        payload.message_thread_id = Number(project.threadId);
      }
      payloads.push(payload);
    }

    for (const adminId of this.config.adminIds) {
      if (!adminId) {
        continue;
      }
      if (payloads.some((payload) => String(payload.chat_id) === String(adminId))) {
        continue;
      }
      payloads.push({
        chat_id: adminId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    }

    if (payloads.length === 0) {
      throw new Error('no_targets');
    }

    let delivered = false;
    for (const payload of payloads) {
      try {
        await telegram.sendMessage(payload);
        delivered = true;
      } catch (error) {
        console.error('Portal feedback send failed', payload.chat_id, error);
      }
    }

    if (!delivered) {
      throw new Error('delivery_failed');
    }
    return true;
  }

  async handleTelegramWebhookManage(url, { normalizedPath } = {}) {
    if (!this.config.botToken) {
      return jsonResponse({ ok: false, error: 'BOT_TOKEN отсутствует' }, { status: 503 });
    }

    if (!this.telegramClient?.isUsable) {
      return jsonResponse({ ok: false, error: 'telegram_client_unavailable' }, { status: 503 });
    }

    const segments = typeof normalizedPath === 'string'
      ? normalizedPath.split('/').filter(Boolean)
      : [];
    const pathToken = segments.length >= 4 ? safeDecode(segments[3]) : '';
    const pathAction = segments.length >= 5 ? safeDecode(segments[4] || '') : '';

    const headerToken = pickFirstFilled(
      this.request.headers.get('x-telegram-token'),
      parseAuthorizationToken(this.request.headers.get('authorization')),
    );

    const token = pickFirstFilled(url.searchParams.get('token'), url.searchParams.get('bot'), pathToken, headerToken);
    if (!isValidWebhookToken(token, this.config.botToken)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const actionFromQuery = pickFirstFilled(url.searchParams.get('action'), pathAction)?.toLowerCase();
    const method = this.request.method.toUpperCase();
    const action =
      actionFromQuery || (method === 'POST' ? 'set' : method === 'DELETE' ? 'delete' : 'info');
    const dropPending = /^(1|true|yes|on)$/i.test(url.searchParams.get('drop') || '');

    const defaultUrl = resolveDefaultWebhookUrl(this.config, { origin: url.origin });

    const telegram = this.telegramClient;

    switch (action) {
      case 'info': {
        try {
          const info = await telegram.getWebhookInfo();
          return jsonResponse({ ok: true, action: 'info', info, suggested_url: defaultUrl });
        } catch (error) {
          return jsonResponse(
            { ok: false, error: error?.message || String(error), action: 'info' },
            { status: 502 },
          );
        }
      }

      case 'delete': {
        try {
          const result = await telegram.deleteWebhook({ drop_pending_updates: dropPending });
          return jsonResponse({
            ok: true,
            action: 'delete',
            drop_pending_updates: dropPending,
            result,
          });
        } catch (error) {
          return jsonResponse(
            { ok: false, error: error?.message || String(error), action: 'delete' },
            { status: 502 },
          );
        }
      }

      case 'set':
      case 'refresh': {
        const explicitUrl = url.searchParams.get('url')?.trim();
        const targetUrl = explicitUrl || defaultUrl;
        if (!targetUrl) {
          return jsonResponse(
            { ok: false, error: 'missing_webhook_url', action },
            { status: 400 },
          );
        }

        const secretToken = url.searchParams.get('secret')?.trim();
        const maxConnections = Number.parseInt(url.searchParams.get('max_connections') || '', 10);
        const updatesParam = url.searchParams.get('updates') || '';
        const allowedUpdates = updatesParam
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const ipAddress = url.searchParams.get('ip_address')?.trim();

        const payload = { url: targetUrl };
        if (secretToken) {
          payload.secret_token = secretToken;
        }
        if (Number.isFinite(maxConnections) && maxConnections > 0) {
          payload.max_connections = maxConnections;
        }
        if (allowedUpdates.length > 0) {
          payload.allowed_updates = allowedUpdates;
        }
        if (ipAddress) {
          payload.ip_address = ipAddress;
        }
        if (dropPending) {
          payload.drop_pending_updates = true;
        }

        try {
          let deleteResult = null;
          if (action === 'refresh') {
            deleteResult = await telegram.deleteWebhook({ drop_pending_updates: dropPending });
            await delay(500);
          }

          const setResult = await telegram.setWebhook(payload);
          return jsonResponse({
            ok: true,
            action,
            url: targetUrl,
            drop_pending_updates: dropPending,
            delete_result: deleteResult,
            set_result: setResult,
            allowed_updates: payload.allowed_updates ?? null,
            max_connections: payload.max_connections ?? null,
            ip_address: payload.ip_address ?? null,
            secret_token: secretToken ? 'set' : null,
          });
        } catch (error) {
          return jsonResponse(
            { ok: false, error: error?.message || String(error), action },
            { status: 502 },
          );
        }
      }

      default:
        return jsonResponse({ ok: false, error: 'unsupported_action' }, { status: 400 });
    }
  }

  async handleScheduled(event) {
    if (!this.executionContext) {
      return;
    }

    const bot = this.bot;
    if (bot) {
      const scheduledNow = event?.scheduledTime ? new Date(event.scheduledTime) : new Date();
      this.executionContext.waitUntil(
        bot
          .processReportSchedules({ now: scheduledNow })
          .catch((error) => {
            console.error('Scheduled report processing failed', error);
          }),
      );
      this.executionContext.waitUntil(
        bot
          .processAlerts({ now: scheduledNow })
          .catch((error) => {
            console.error('Scheduled alert processing failed', error);
          }),
      );
    }

    if (this.config.botToken && this.telegramClient?.isUsable) {
      this.executionContext.waitUntil(
        (async () => {
          try {
            await this.telegramClient.getMe();
          } catch (error) {
            console.error('Scheduled Telegram getMe failed', error);
          }
        })(),
      );
    }

    if (this.metaService) {
      this.executionContext.waitUntil(
        this.metaService.refreshOverview().catch((error) => {
          console.error('Scheduled Meta refresh failed', error);
        }),
      );
    }
  }
}

const worker = {
  async fetch(request, env, executionContext) {
    const app = new WorkerApp(request, env, executionContext);
    try {
      return await app.handleFetch();
    } catch (error) {
      console.error('Unhandled fetch error', error);
      return jsonResponse(
        { ok: false, error: error?.message || 'internal_error' },
        { status: 500 },
      );
    }
  },

  async scheduled(event, env, executionContext) {
    const app = new WorkerApp(new Request('https://worker.invalid/'), env, executionContext);
    return app.handleScheduled(event);
  },
};

export default worker;
