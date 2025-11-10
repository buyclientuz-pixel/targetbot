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
const DEFAULT_TIMEZONE_FALLBACK = 'Asia/Tashkent';
const TELEGRAM_TIMEOUT_MS = 9000;
const TELEGRAM_LOG_KEY = 'log:telegram';
const TELEGRAM_LOG_LIMIT = 50;
const CHAT_KEY_PREFIX = 'chat:';
const PROJECT_KEY_PREFIX = 'project:';
const ADMIN_SESSION_KEY_PREFIX = 'admin:session:';
const META_STATUS_KEY = 'meta:status';
const META_TOKEN_KEY = 'meta:auth';
const META_TOKEN_FALLBACK_KEY = 'meta:token';
const META_ACCOUNT_SNAPSHOT_KEY = 'meta:accounts';
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
const META_OVERVIEW_MAX_AGE_MS = 30 * 60 * 1000;
const ADMIN_PROJECT_PREVIEW_LIMIT = 6;
const REPORT_STATE_PREFIX = 'report:state:';
const REPORT_DEFAULT_TIME = '10:00';
const REPORT_TOLERANCE_MINUTES = 7;
const REPORT_PRESET_MAP = {
  today: 'today',
  yesterday: 'yesterday',
  week: 'last_7d',
  month: 'this_month',
  year: 'this_year',
};
const ALERT_STATE_PREFIX = 'alert:state:';
const AUTOPAUSE_STATE_PREFIX = 'autopause:state:';
const ALERT_ZERO_DEFAULT_TIME = '12:00';
const ALERT_ZERO_TIME_OPTIONS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'];
const ALERT_BILLING_DEFAULT_TIMES = ['10:00', '14:00', '18:00'];
const ALERT_FREQUENCY_THRESHOLD = 3.5;
const ALERT_CTR_THRESHOLD = 0.5;
const ALERT_CPA_THRESHOLD_MULTIPLIER = 1.2;
const KPI_OBJECTIVE_OPTIONS = [
  { value: 'LEAD_GENERATION', label: 'Лиды' },
  { value: 'CONVERSIONS', label: 'Продажи' },
  { value: 'OUTCOME_SALES', label: 'Покупки' },
  { value: 'MESSAGES', label: 'Сообщения' },
  { value: 'TRAFFIC', label: 'Трафик' },
  { value: 'AWARENESS', label: 'Узнаваемость' },
  { value: 'REACH', label: 'Охват' },
];
const KPI_CURRENCY_OPTIONS = ['USD', 'EUR', 'UZS', 'RUB', 'KZT'];
const KPI_FIELD_CONFIG = {
  cpa: { label: 'CPA', type: 'money', steps: [-5, -1, -0.5, -0.1, 0.1, 0.5, 1, 5] },
  cpl: { label: 'CPL', type: 'money', steps: [-5, -1, -0.5, -0.1, 0.1, 0.5, 1, 5] },
  leadsPerDay: { label: 'Лидов/день', type: 'int', steps: [-10, -5, -1, 1, 5, 10] },
  dailyBudget: { label: 'Бюджет/день', type: 'int', steps: [-100, -20, -5, 5, 20, 100] },
};
const SCHEDULE_PERIOD_OPTIONS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: 'week', label: '7 дней' },
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];
const SCHEDULE_TIME_OPTIONS = ['08:00', '09:00', '09:30', '10:00', '12:00', '14:00', '16:00', '18:00', '19:00', '20:00'];
const SCHEDULE_CADENCE_OPTIONS = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekdays', label: 'По будням' },
  { value: 'weekends', label: 'По выходным' },
  { value: 'weekly', label: 'Раз в неделю' },
];
const AUTOPAUSE_THRESHOLD_OPTIONS = [2, 3, 4, 5];
const GROUP_CHAT_TYPES = new Set(['group', 'supergroup']);

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

function formatCpaRange(minValue, maxValue, campaigns = []) {
  const register = (value, target) => {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) {
      target.push(amount);
    }
  };

  const candidates = [];
  register(minValue, candidates);
  register(maxValue, candidates);

  if (Array.isArray(campaigns)) {
    for (const campaign of campaigns) {
      if (!campaign) continue;
      register(campaign.cpaUsd, candidates);
      register(campaign.cpa, candidates);
      register(campaign.costPerResultUsd, candidates);
      register(campaign.cost_per_result_usd, candidates);
      register(campaign.cost_per_lead_usd, candidates);
      register(campaign.cost_per_action, candidates);
      register(campaign.cost_per_lead, candidates);
      register(campaign.cost_per_purchase, candidates);
      register(campaign.costPerLeadUsd, candidates);
      register(campaign.costPerPurchaseUsd, candidates);
      if (Array.isArray(campaign.cost_per_action_type)) {
        for (const action of campaign.cost_per_action_type) {
          if (!action) continue;
          register(action.value, candidates);
        }
      }
    }
  }

  if (candidates.length === 0) {
    return '';
  }

  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  if (!Number.isFinite(min) || min <= 0) {
    return '';
  }

  const minText = formatUsd(min, { digitsBelowOne: 2, digitsAboveOne: 0 });
  if (!Number.isFinite(max) || max <= 0 || Math.abs(max - min) < 0.01) {
    return minText;
  }

  const maxText = formatUsd(max, { digitsBelowOne: 2, digitsAboveOne: 0 });
  return `${minText} / ${maxText}`;
}

function generatePortalToken({ size = 24 } = {}) {
  const length = Number.isFinite(size) && size > 0 ? Math.min(size, 64) : 24;
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const buffer = new Uint8Array(length);
    globalThis.crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase();
  }
  return token;
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

function deepEqualObjects(first, second) {
  if (first === second) {
    return true;
  }
  if (!first || !second || typeof first !== 'object' || typeof second !== 'object') {
    return false;
  }
  try {
    return JSON.stringify(first) === JSON.stringify(second);
  } catch (error) {
    console.warn('Failed to compare objects', error);
    return false;
  }
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

function normalizeMoneyValue(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

function normalizeAdAccountInput(value) {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!raw) {
    return { ok: false, error: 'account_required' };
  }

  const compact = raw.replace(/\s+/g, '').toLowerCase();
  const match = compact.match(/^(?:act_)?(\d{5,})$/);
  if (!match) {
    return { ok: false, error: 'account_invalid' };
  }

  const numericId = match[1];
  return { ok: true, accountId: `act_${numericId}`, numericId };
}

function normalizeAccountKey(accountId) {
  const raw = String(accountId ?? '').trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(/(\d{5,})$/);
  if (match) {
    return match[1];
  }

  return raw.replace(/^act_/, '');
}

function parseProjectChatInput(value) {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!raw) {
    return { ok: false, error: 'chat_required' };
  }

  if (/^https?:/i.test(raw)) {
    return { ok: true, chatId: raw, threadId: '' };
  }

  const parts = raw.split(/[:/\s]+/).filter(Boolean);
  const chatPart = parts[0] || '';
  const threadPart = parts[1] || '';

  if (!/^[-]?\d{3,}$/.test(chatPart)) {
    return { ok: false, error: 'chat_invalid' };
  }

  if (threadPart && !/^\d+$/.test(threadPart)) {
    return { ok: false, error: 'thread_invalid' };
  }

  return { ok: true, chatId: chatPart, threadId: threadPart };
}

function normalizePresetKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
}

function buildChatKey(chatId, threadId) {
  const id = String(chatId ?? '').trim();
  if (!id) {
    return '';
  }

  const thread = threadId === undefined || threadId === null ? '' : String(threadId).trim();
  return `${id}:${thread}`;
}

function normalizeThreadIdValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function buildChatRegistryStorageKey(chatId, threadId) {
  const chatKey = buildChatKey(chatId, threadId);
  if (!chatKey) {
    return '';
  }

  return `${CHAT_KEY_PREFIX}${chatKey}`;
}

function truncateLabel(value, maxLength = 32) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function chunkArray(list, size) {
  const items = Array.isArray(list) ? list : [];
  const limit = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : items.length || 1;
  const result = [];
  for (let index = 0; index < items.length; index += limit) {
    result.push(items.slice(index, index + limit));
  }
  return result;
}

function parseProjectChatPresets(raw) {
  if (!raw) {
    return [];
  }

  let source = raw;
  if (typeof raw === 'string') {
    source = raw.trim();
    if (!source) {
      return [];
    }
    if (source.startsWith('{') || source.startsWith('[')) {
      try {
        source = JSON.parse(source);
      } catch (error) {
        console.warn('Failed to parse PROJECT_CHAT_PRESETS JSON', error);
        source = raw;
      }
    }
  }

  const presets = [];

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const key = normalizePresetKey(entry.key || entry.id || entry.code || entry.name);
      const chatId = entry.chatId || entry.chat_id || entry.chat || '';
      const threadId = entry.threadId || entry.thread_id || entry.topic || '';
      if (!key || !chatId) {
        continue;
      }

      presets.push({
        key,
        label: entry.label || entry.name || entry.title || key,
        chatId: String(chatId),
        threadId: threadId ? String(threadId) : '',
        title: entry.title || entry.chatTitle || '',
        portalToken: entry.portalToken || entry.portal_token || entry.token || '',
        note: entry.note || entry.description || '',
      });
    }
    return presets;
  }

  if (source && typeof source === 'object') {
    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = normalizePresetKey(rawKey);
      if (!key) {
        continue;
      }

      if (rawValue && typeof rawValue === 'object') {
        const chatId = rawValue.chatId || rawValue.chat_id || rawValue.chat || '';
        const threadId = rawValue.threadId || rawValue.thread_id || rawValue.topic || '';
        if (!chatId) {
          continue;
        }

        presets.push({
          key,
          label: rawValue.label || rawValue.name || rawValue.title || key,
          chatId: String(chatId),
          threadId: threadId ? String(threadId) : '',
          title: rawValue.title || rawValue.chatTitle || '',
          portalToken: rawValue.portalToken || rawValue.portal_token || rawValue.token || '',
          note: rawValue.note || rawValue.description || '',
        });
        continue;
      }

      const value = String(rawValue ?? '').trim();
      if (!value) {
        continue;
      }

      const [chatPart, metaPart] = value.split(/\s+\|\s+|\|/);
      const [chatIdPart, threadPart] = chatPart.split(/[:/]/).map((token) => token.trim()).filter(Boolean);
      if (!chatIdPart) {
        continue;
      }

      let title = '';
      let portalToken = '';
      if (metaPart) {
        const pieces = metaPart.split(/\s*,\s*/).filter(Boolean);
        if (pieces.length > 0) {
          [title] = pieces;
          if (pieces.length > 1) {
            portalToken = pieces[1];
          }
        }
      }

      presets.push({
        key,
        label: key,
        chatId: chatIdPart,
        threadId: threadPart ? threadPart : '',
        title,
        portalToken,
        note: '',
      });
    }
    return presets;
  }

  if (typeof source === 'string') {
    const lines = source
      .split(/\r?\n|;/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const [keyPart, rest] = line.split('=').map((token) => token.trim());
      const key = normalizePresetKey(keyPart);
      if (!key || !rest) {
        continue;
      }

      const [chatPart, notePart] = rest.split(/\s+\|\s+|\|/);
      if (!chatPart) {
        continue;
      }

      const [chatIdPart, threadPart] = chatPart.split(/[:/]/).map((token) => token.trim()).filter(Boolean);
      if (!chatIdPart) {
        continue;
      }

      let title = '';
      let portalToken = '';
      if (notePart) {
        const pieces = notePart.split(/\s*,\s*/).filter(Boolean);
        if (pieces.length > 0) {
          [title] = pieces;
          if (pieces.length > 1) {
            portalToken = pieces[1];
          }
        }
      }

      presets.push({
        key,
        label: key,
        chatId: chatIdPart,
        threadId: threadPart ? threadPart : '',
        title,
        portalToken,
        note: '',
      });
    }
  }

  return presets;
}

function parseProjectAccountAccess(raw) {
  if (!raw) {
    return {};
  }

  let source = raw;
  if (typeof raw === 'string') {
    source = raw.trim();
    if (!source) {
      return {};
    }
    if (source.startsWith('{')) {
      try {
        source = JSON.parse(source);
      } catch (error) {
        console.warn('Failed to parse PROJECT_ACCOUNT_ACCESS JSON', error);
        source = raw;
      }
    }
  }

  const access = {};

  const append = (accountKey, entries) => {
    if (!accountKey) {
      return;
    }
    if (!Array.isArray(entries)) {
      return;
    }
    access[accountKey] = Array.from(
      new Set(
        entries
          .map((entry) => String(entry ?? '').trim())
          .filter(Boolean),
      ),
    );
  };

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const accountKey = normalizeAccountKey(item.account || item.accountId || item.adAccountId || item.id);
      const admins = Array.isArray(item.admins)
        ? item.admins
        : Array.isArray(item.users)
        ? item.users
        : typeof item.admins === 'string'
        ? item.admins.split(/[,\s]+/)
        : typeof item.users === 'string'
        ? item.users.split(/[,\s]+/)
        : [];
      append(accountKey, admins);
    }
    return access;
  }

  if (source && typeof source === 'object') {
    for (const [account, admins] of Object.entries(source)) {
      const accountKey = normalizeAccountKey(account);
      if (!accountKey) {
        continue;
      }

      if (Array.isArray(admins)) {
        append(accountKey, admins);
        continue;
      }

      if (typeof admins === 'string') {
        append(
          accountKey,
          admins
            .split(/[,\s]+/)
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
      }
    }
    return access;
  }

  if (typeof source === 'string') {
    const lines = source
      .split(/\r?\n|;/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const [accountPart, usersPart] = line.split('=').map((token) => token.trim());
      const accountKey = normalizeAccountKey(accountPart);
      if (!accountKey || !usersPart) {
        continue;
      }

      const users = usersPart.split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);
      append(accountKey, users);
    }
  }

  return access;
}

function deriveDefaultProjectKpi(account, { currency } = {}) {
  if (!account || typeof account !== 'object') {
    return null;
  }

  const campaigns = Array.isArray(account.campaignSummaries) ? account.campaignSummaries : [];
  let spendTotal = 0;
  let leadsTotal = 0;
  let conversionsTotal = 0;
  const cpaSamples = [];

  for (const summary of campaigns) {
    if (!summary || typeof summary !== 'object') {
      continue;
    }

    const spend = Number(summary.spendUsd ?? summary.spend_usd ?? summary.spend);
    if (Number.isFinite(spend)) {
      spendTotal += spend;
    }

    const leads = Number(summary.leads ?? summary.leads_count);
    if (Number.isFinite(leads) && leads > 0) {
      leadsTotal += leads;
    }

    const conversions = Number(summary.conversions ?? summary.results ?? summary.actions);
    if (Number.isFinite(conversions) && conversions > 0) {
      conversionsTotal += conversions;
    }

    const cpa = Number(summary.cpaUsd ?? summary.cpa_usd ?? summary.cplUsd ?? summary.cpl_usd);
    if (Number.isFinite(cpa) && cpa > 0) {
      cpaSamples.push(cpa);
    }
  }

  let objective = null;
  if (leadsTotal > 0) {
    objective = 'LEAD_GENERATION';
  } else if (conversionsTotal > 0) {
    objective = 'CONVERSIONS';
  } else if (Number.isFinite(account.runningCampaigns) && account.runningCampaigns > 0) {
    objective = 'LEAD_GENERATION';
  }

  const averageCpa = cpaSamples.length > 0 ? cpaSamples.reduce((sum, value) => sum + value, 0) / cpaSamples.length : null;
  let targetCpa = normalizeMoneyValue(averageCpa);

  if (targetCpa === null) {
    const fallbackCpa = normalizeMoneyValue(account.cpaMinUsd ?? account.cpaMaxUsd);
    if (fallbackCpa !== null) {
      targetCpa = fallbackCpa;
    }
  }

  if (targetCpa === null && spendTotal > 0) {
    if (leadsTotal > 0) {
      targetCpa = normalizeMoneyValue(spendTotal / leadsTotal);
    } else if (conversionsTotal > 0) {
      targetCpa = normalizeMoneyValue(spendTotal / conversionsTotal);
    }
  }

  const averageLeadsPerDay = leadsTotal > 0 ? leadsTotal / 7 : null;
  const leadsPerDay = Number.isFinite(averageLeadsPerDay) && averageLeadsPerDay > 0 ? Math.max(1, Math.round(averageLeadsPerDay)) : null;

  const averageSpendPerDay = spendTotal > 0 ? spendTotal / 7 : null;
  const spendToday = Number(account.spendTodayUsd);
  const dailyBudgetSource = Number.isFinite(averageSpendPerDay) && averageSpendPerDay > 0 ? averageSpendPerDay : Number.isFinite(spendToday) ? spendToday : null;
  const dailyBudget = Number.isFinite(dailyBudgetSource) && dailyBudgetSource > 0 ? Math.round(dailyBudgetSource) : null;

  const resolvedCurrency = currency || account.currency || 'USD';
  const result = { currency: resolvedCurrency };

  if (objective) {
    result.objective = objective;
  } else {
    result.objective = 'LEAD_GENERATION';
  }

  if (targetCpa !== null) {
    if (result.objective === 'LEAD_GENERATION') {
      result.cpl = targetCpa;
    } else {
      result.cpa = targetCpa;
    }
  }

  if (leadsPerDay !== null) {
    result.leadsPerDay = leadsPerDay;
  }

  if (dailyBudget !== null) {
    result.dailyBudget = dailyBudget;
  }

  return result;
}

function buildDefaultProjectSchedule({ timezone, cadence = 'daily', times, periods, quietWeekends = true } = {}) {
  const normalizedTimes = [];
  const sourceTimes = Array.isArray(times) && times.length > 0 ? times : ['09:30', '19:00'];
  for (const token of sourceTimes) {
    const normalized = normalizeTimeToken(token);
    if (normalized && !normalizedTimes.includes(normalized)) {
      normalizedTimes.push(normalized);
    }
  }
  if (normalizedTimes.length === 0) {
    const fallback = normalizeTimeToken(REPORT_DEFAULT_TIME) || REPORT_DEFAULT_TIME;
    normalizedTimes.push(fallback);
  }

  const normalizedPeriods = [];
  const sourcePeriods = Array.isArray(periods) && periods.length > 0 ? periods : ['today', 'yesterday', 'week'];
  for (const token of sourcePeriods) {
    const normalized = normalizePeriodToken(token);
    if (normalized && !normalizedPeriods.includes(normalized)) {
      normalizedPeriods.push(normalized);
    }
  }
  if (normalizedPeriods.length === 0) {
    normalizedPeriods.push('today');
  }

  const cadenceValue = normalizeCadenceValue(cadence) || 'daily';
  const tz = timezone || DEFAULT_TIMEZONE_FALLBACK;

  return {
    cadence: cadenceValue,
    times: normalizedTimes,
    periods: normalizedPeriods,
    timezone: tz,
    quietWeekends: Boolean(quietWeekends),
  };
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
  const options = {
    timeZone: timezone || DEFAULT_TIMEZONE_FALLBACK,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
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
    timeZone: timezone || DEFAULT_TIMEZONE_FALLBACK,
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
      timezone: DEFAULT_TIMEZONE_FALLBACK,
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
    year: 'year',
    год: 'year',
    'весь период': 'year',
    'this_year': 'year',
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
    if (Number.isFinite(cpa) && cpa > 0) {
      samples.push(cpa);
    }
    if (Array.isArray(entry.cost_per_action_type)) {
      for (const action of entry.cost_per_action_type) {
        const value = Number(action?.value ?? action?.cost ?? action?.amount);
        if (Number.isFinite(value) && value > 0) {
          samples.push(value);
        }
      }
    }
  }

  return samples;
}

const LEAD_ACTION_HINTS = [
  'lead',
  'generate_lead',
  'complete_registration',
  'omni_lead',
  'leadgen',
  'lead_form',
  'lead_event',
  'leadgen.other',
  'leadgen_qualified_lead',
  'onsite_conversion.lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.submit_application',
];
const MESSAGE_ACTION_HINTS = [
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
  'omni_message_first_reply',
  'messaging_conversation_started_7d',
  'onsite_conversion.messaging_conversation_started_7d',
];
const CONVERSION_ACTION_HINTS = [
  'purchase',
  'omni_purchase',
  'onsite_conversion.purchase',
  'onsite_conversion.purchase_roas',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_purchase_value',
  'subscribe',
  'omni_subscribe',
  'initiate_checkout',
  'omni_initiated_checkout',
  'add_to_cart',
  'omni_add_to_cart',
  'add_payment_info',
  'omni_add_payment_info',
  'start_trial',
  'order',
  'complete_registration',
  'schedule',
  'submit_application',
  'contact',
  'view_content',
  'search',
  ...MESSAGE_ACTION_HINTS,
];

function actionMatches(type, hints = LEAD_ACTION_HINTS) {
  const normalized = String(type ?? '').toLowerCase();
  if (!normalized) {
    return false;
  }

  return hints.some((hint) => normalized === hint || normalized.includes(hint));
}

function sumActionMetric(actions, hints = LEAD_ACTION_HINTS) {
  return sumActionMetricDetailed(actions, hints).total;
}

function sumActionMetricDetailed(actions, hints = LEAD_ACTION_HINTS) {
  if (!Array.isArray(actions)) {
    return { total: 0, matched: 0 };
  }

  let total = 0;
  let matched = 0;
  for (const action of actions) {
    const type = action?.action_type ?? action?.actionType ?? action?.event_type;
    if (!actionMatches(type, hints)) {
      continue;
    }

    matched += 1;

    const value = Number(action?.value ?? action?.count ?? action?.amount);
    if (Number.isFinite(value)) {
      total += value;
    }
  }

  return { total, matched };
}

function extractActionTotal(entry, { hints, fallbackFields = [] } = {}) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  let total = 0;
  let evidence = false;

  const { total: actionsTotal, matched: actionMatchesCount } = sumActionMetricDetailed(
    entry.actions,
    hints,
  );
  if (actionMatchesCount > 0) {
    evidence = true;
    total = Math.max(total, actionsTotal);
  }

  if (Array.isArray(entry?.action_values) && hints === CONVERSION_ACTION_HINTS) {
    const { total: valueTotal, matched: valueMatches } = sumActionMetricDetailed(
      entry.action_values,
      hints,
    );
    if (valueMatches > 0) {
      evidence = true;
      total = Math.max(total, valueTotal);
    }
  }

  for (const field of fallbackFields) {
    const value = Number(entry?.[field]);
    if (Number.isFinite(value)) {
      evidence = true;
      total = Math.max(total, value);
    }
  }

  const fallbackType =
    entry?.result_type ||
    entry?.resultType ||
    entry?.action_type ||
    entry?.actionType ||
    entry?.optimization_goal ||
    entry?.optimizationGoal ||
    entry?.objective ||
    entry?.objective_type ||
    entry?.objectiveType ||
    '';

  const resultCandidates = [
    { value: entry?.results, type: entry?.result_type },
    { value: entry?.result, type: entry?.result_type },
    { value: entry?.total_actions, type: entry?.action_type },
    { value: entry?.total_results, type: entry?.action_type },
  ];

  for (const candidate of resultCandidates) {
    const numeric = Number(candidate.value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const type = candidate.type || fallbackType;
    if (!type || actionMatches(type, hints)) {
      evidence = true;
      total = Math.max(total, numeric);
    }
  }

  if (!evidence) {
    return null;
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
  let leadsFound = false;
  let conversionsTotal = 0;
  let conversionsFound = false;
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

    const entryLeads = extractActionTotal(entry, {
      hints: LEAD_ACTION_HINTS,
      fallbackFields: [
        'leads',
        'lead',
        'total_leads',
        'total_lead',
        'unique_leads',
        'unique_lead',
        'estimated_leads',
        'estimated_lead',
      ],
    });
    if (entryLeads !== null) {
      leadsTotal += entryLeads;
      leadsFound = true;
    }

    const entryConversions = extractActionTotal(entry, {
      hints: CONVERSION_ACTION_HINTS,
      fallbackFields: [
        'conversions',
        'conversion',
        'total_conversions',
        'total_conversion',
        'purchases',
        'purchase',
        'total_purchases',
        'total_purchase',
        'orders',
        'total_orders',
        'subscribe',
        'subscriptions',
        'start_trial',
        'completed_registration',
      ],
    });
    if (entryConversions !== null) {
      conversionsTotal += entryConversions;
      conversionsFound = true;
    }
    lastEntry = entry;
  }

  if (!lastEntry && insightEntries.length > 0) {
    lastEntry = insightEntries[insightEntries.length - 1];
  }

  const spendUsd = spendFound ? spendTotal : null;
  const leads = leadsFound ? leadsTotal : null;
  const conversions = conversionsFound ? conversionsTotal : null;

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

function formatDateShort(value, { timezone } = {}) {
  const date = parseDateInput(value);
  if (!date) {
    return '';
  }

  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (timezone) {
    options.timeZone = timezone;
  }

  try {
    return new Intl.DateTimeFormat('ru-RU', options).format(date);
  } catch (error) {
    console.warn('Failed to format short date', value, error);
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

function collectPortalTokens({ rawProject, project, config } = {}) {
  const tokens = new Set();

  const register = (value) => {
    if (!value) {
      return;
    }
    const normalized = String(value).trim();
    if (normalized) {
      tokens.add(normalized);
    }
  };

  if (rawProject) {
    for (const token of extractPortalTokens(rawProject)) {
      register(token);
    }
  }

  if (project && typeof project === 'object') {
    if (Array.isArray(project.portalTokens)) {
      for (const token of project.portalTokens) {
        register(token);
      }
    }
    register(project.portalToken);
    if (project.portal && typeof project.portal === 'object') {
      register(project.portal.token);
      register(project.portal.secret);
      if (Array.isArray(project.portal.tokens)) {
        for (const token of project.portal.tokens) {
          register(token);
        }
      }
    }
    if (project.tokens && typeof project.tokens === 'object') {
      register(project.tokens.portal);
      register(project.tokens.portal_signature);
      register(project.tokens.portal_secret);
    }
  }

  if (config && typeof config === 'object') {
    register(config.portalAccessToken);
    register(config.metaManageToken);
  }

  return tokens;
}

function isPortalActive(rawProject) {
  if (!rawProject || typeof rawProject !== 'object') {
    return false;
  }

  if (rawProject.portal && typeof rawProject.portal === 'object') {
    if (rawProject.portal.enabled === false || rawProject.portal.disabled === true) {
      return false;
    }
    if (rawProject.portal.disabled_at || rawProject.portal.disabledAt) {
      return false;
    }
  }

  const billing = rawProject.client?.billing || rawProject.client_billing || {};
  if (billing && typeof billing === 'object') {
    const status = billing.status || billing.state || billing.mode || '';
    if (typeof status === 'string' && status.toLowerCase() === 'declined') {
      return false;
    }
    if (billing.portal_disabled === true || billing.portalDisabled === true) {
      return false;
    }
  }

  return extractPortalTokens(rawProject).size > 0;
}

function extractClientBilling(rawProject) {
  const source =
    (rawProject && typeof rawProject === 'object' &&
      (rawProject.client?.billing || rawProject.client_billing || rawProject.billing?.client)) ||
    {};

  const lastPaymentAt =
    source.last_payment_at ||
    source.lastPaymentAt ||
    source.paid_at ||
    source.paidAt ||
    rawProject?.client_last_payment_at ||
    rawProject?.clientLastPaymentAt ||
    null;

  const nextPaymentAt =
    source.next_payment_at ||
    source.nextPaymentAt ||
    source.next_due_at ||
    source.nextDueAt ||
    source.due_at ||
    source.dueAt ||
    null;

  const status = source.status || source.state || source.mode || null;
  const paused = Boolean(source.paused || source.suspended || source.on_hold);
  const declinedAt = source.declined_at || source.declinedAt || null;
  const note = source.note || source.message || null;

  return {
    lastPaymentAt,
    nextPaymentAt,
    status,
    paused,
    declinedAt,
    note,
  };
}

function formatClientBillingLines(billing, { timezone } = {}) {
  if (!billing) {
    return ['Оплата клиента ещё не отслеживается.'];
  }

  const lines = [];
  const status = typeof billing.status === 'string' ? billing.status.toLowerCase() : '';
  const emoji = status === 'declined' ? '🔴' : status === 'active' || status === 'paid' ? '🟢' : '🟡';
  const statusLabel =
    status === 'declined'
      ? 'Отключено'
      : status === 'active' || status === 'paid'
      ? 'Активно'
      : status
      ? status.toUpperCase()
      : 'Требует отметки';

  lines.push(`Статус: ${emoji} ${escapeHtml(statusLabel)}`);

  if (billing.lastPaymentAt) {
    const label = formatDateLabel(billing.lastPaymentAt, { timezone }) || billing.lastPaymentAt;
    lines.push(`Последняя оплата: ${escapeHtml(label)}`);
  } else {
    lines.push('Последняя оплата: —');
  }

  if (billing.nextPaymentAt) {
    const label = formatDateLabel(billing.nextPaymentAt, { timezone }) || billing.nextPaymentAt;
    lines.push(`Следующий контроль: ${escapeHtml(label)}`);
  }

  if (billing.declinedAt) {
    const label = formatDateLabel(billing.declinedAt, { timezone }) || billing.declinedAt;
    lines.push(`Отключено: ${escapeHtml(label)}`);
  }

  if (billing.note) {
    lines.push(`Комментарий: ${escapeHtml(billing.note)}`);
  }

  return lines;
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

function normalizeKpiDraft(source, { suggestion } = {}) {
  const draft = {
    objective: null,
    currency: null,
    cpa: null,
    cpl: null,
    leadsPerDay: null,
    dailyBudget: null,
  };

  if (source && typeof source === 'object') {
    if (source.objective) {
      draft.objective = String(source.objective).toUpperCase();
    }
    if (source.currency) {
      draft.currency = String(source.currency).toUpperCase();
    }
    if (Number.isFinite(source.cpa)) {
      draft.cpa = Number(source.cpa);
    }
    if (Number.isFinite(source.cpl)) {
      draft.cpl = Number(source.cpl);
    }
    if (Number.isFinite(source.leadsPerDay)) {
      draft.leadsPerDay = Number(source.leadsPerDay);
    }
    if (Number.isFinite(source.dailyBudget)) {
      draft.dailyBudget = Number(source.dailyBudget);
    }
  }

  if (!draft.currency && suggestion?.currency) {
    draft.currency = String(suggestion.currency).toUpperCase();
  }

  if (!draft.objective && suggestion?.objective) {
    draft.objective = String(suggestion.objective).toUpperCase();
  }

  if (!Number.isFinite(draft.cpa) && Number.isFinite(suggestion?.cpa)) {
    draft.cpa = Number(suggestion.cpa);
  }
  if (!Number.isFinite(draft.cpl) && Number.isFinite(suggestion?.cpl)) {
    draft.cpl = Number(suggestion.cpl);
  }
  if (!Number.isFinite(draft.leadsPerDay) && Number.isFinite(suggestion?.leadsPerDay)) {
    draft.leadsPerDay = Number(suggestion.leadsPerDay);
  }
  if (!Number.isFinite(draft.dailyBudget) && Number.isFinite(suggestion?.dailyBudget)) {
    draft.dailyBudget = Number(suggestion.dailyBudget);
  }

  return draft;
}

function formatKpiDraftValue(field, value, { currency } = {}) {
  if (!['cpa', 'cpl', 'leadsPerDay', 'dailyBudget'].includes(field)) {
    return value ? `<b>${escapeHtml(String(value))}</b>` : '—';
  }

  if (!Number.isFinite(value)) {
    return '—';
  }

  const config = KPI_FIELD_CONFIG[field];
  if (!config) {
    return `<b>${escapeHtml(String(value))}</b>`;
  }

  if (config.type === 'money') {
    return `<b>${formatUsd(value, { digitsBelowOne: 2, digitsAboveOne: 0 })}</b>`;
  }

  const suffix = field === 'dailyBudget' && currency ? ` ${escapeHtml(currency)}` : '';
  return `<b>${formatInteger(value)}</b>${suffix}`;
}

function describeKpiDraft(draft) {
  const currency = draft.currency || null;
  const lines = [];
  lines.push(`Цель: ${draft.objective ? `<b>${escapeHtml(String(draft.objective))}</b>` : '—'}`);
  lines.push(`CPA: ${formatKpiDraftValue('cpa', draft.cpa)}`);
  lines.push(`CPL: ${formatKpiDraftValue('cpl', draft.cpl)}`);
  lines.push(`Лидов/день: ${formatKpiDraftValue('leadsPerDay', draft.leadsPerDay)}`);
  lines.push(`Бюджет/день: ${formatKpiDraftValue('dailyBudget', draft.dailyBudget, { currency })}`);
  lines.push(`Валюта: ${currency ? `<b>${escapeHtml(currency)}</b>` : '—'}`);
  return lines;
}

function sanitizeKpiValue(value, field) {
  const config = KPI_FIELD_CONFIG[field];
  if (!config) {
    return value;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  let result = num;
  if (config.type === 'int') {
    result = Math.round(result);
  }
  if (config.type === 'money') {
    result = Math.round(result * 100) / 100;
  }

  if (Number.isFinite(config.min)) {
    result = Math.max(config.min, result);
  } else {
    result = Math.max(0, result);
  }

  return result;
}

function adjustKpiDraftValue(draft, field, delta) {
  if (!draft || !Object.prototype.hasOwnProperty.call(draft, field)) {
    return draft;
  }

  const config = KPI_FIELD_CONFIG[field];
  if (!config) {
    return draft;
  }

  const current = Number.isFinite(draft[field]) ? draft[field] : 0;
  const next = sanitizeKpiValue(current + delta, field);
  draft[field] = Number.isFinite(next) ? next : null;
  return draft;
}

function normalizeScheduleDraft(source, { defaultTimezone } = {}) {
  const draft = {
    cadence: null,
    periods: [],
    times: [],
    timezone: defaultTimezone || DEFAULT_TIMEZONE_FALLBACK,
    quietWeekends: false,
  };

  if (source && typeof source === 'object') {
    if (source.cadence) {
      draft.cadence = String(source.cadence).toLowerCase();
    }
    if (Array.isArray(source.periods)) {
      draft.periods = source.periods.map((item) => String(item));
    }
    if (Array.isArray(source.times)) {
      draft.times = source.times.map((item) => String(item));
    }
    if (source.timezone) {
      draft.timezone = String(source.timezone);
    }
    if (typeof source.quietWeekends === 'boolean') {
      draft.quietWeekends = source.quietWeekends;
    }
  }

  if (!draft.timezone && defaultTimezone) {
    draft.timezone = defaultTimezone;
  }

  draft.periods = Array.from(new Set(draft.periods.filter(Boolean)));
  draft.times = Array.from(new Set(draft.times.filter(Boolean))).sort();

  return draft;
}

function describeScheduleDraft(draft, { timezone } = {}) {
  const effective = {
    cadence: draft?.cadence || 'custom',
    periods: draft?.periods || [],
    times: draft?.times || [],
    timezone: draft?.timezone || timezone || DEFAULT_TIMEZONE_FALLBACK,
    quietWeekends: Boolean(draft?.quietWeekends),
  };

  return formatScheduleLines(effective, { timezone });
}

function toggleListValue(list, value) {
  const set = new Set((list || []).map((item) => String(item)));
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
  return Array.from(set);
}

function formatStepLabel(step) {
  const sign = step > 0 ? '+' : '−';
  const abs = Math.abs(step);
  const digits = abs % 1 === 0 ? 0 : abs % 0.1 === 0 ? 1 : 2;
  const formatted = abs.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${sign}${formatted}`;
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

function extractAutopauseSettings(rawProject) {
  const candidates = [
    rawProject?.autopause,
    rawProject?.settings?.autopause,
    rawProject?.config?.autopause,
    rawProject?.reporting?.autopause,
    rawProject?.state?.autopause,
    rawProject?.client?.autopause,
  ];

  let config = null;
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      config = candidate;
      break;
    }
  }

  const enabled = Boolean(config?.enabled ?? config?.active ?? config?.on ?? config?.value);
  const manualOnly = Boolean(config?.manual ?? config?.manualOnly ?? config?.manual_only);
  const allowAuto = config?.auto === false || config?.automatic === false ? false : true;
  const thresholdRaw =
    config?.threshold_days ??
    config?.thresholdDays ??
    config?.days ??
    config?.consecutiveDays ??
    config?.streak ??
    config?.threshold ??
    3;
  const thresholdDays = Number.isFinite(Number(thresholdRaw)) ? Math.max(1, Math.round(Number(thresholdRaw))) : 3;

  const lastTriggeredAt =
    config?.lastTriggeredAt || config?.last_triggered_at || config?.last_run_at || config?.lastActionAt || null;
  const lastReason = config?.lastReason || config?.last_reason || config?.reason || null;

  const pausedCampaignIds = Array.isArray(config?.pausedCampaignIds)
    ? config.pausedCampaignIds.map((id) => String(id))
    : Array.isArray(config?.last_campaign_ids)
    ? config.last_campaign_ids.map((id) => String(id))
    : [];

  const lastCampaigns = Array.isArray(config?.lastCampaigns)
    ? config.lastCampaigns
    : Array.isArray(config?.last_campaigns)
    ? config.last_campaigns
    : [];

  return {
    enabled,
    manualOnly,
    allowAuto,
    thresholdDays,
    lastTriggeredAt,
    lastReason,
    lastCampaigns,
    pausedCampaignIds,
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
    lines.push('🔕 Все алерты выключены. Нажмите кнопки ниже, чтобы активировать уведомления.');
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

function buildAlertSettingsKeyboard(base, alerts = {}) {
  const zeroSpendActive = Boolean(alerts?.zeroSpend?.enabled ?? alerts?.zeroSpend);
  const billingActive = Boolean(alerts?.billing?.enabled ?? alerts?.billing);
  const anomaliesActive = Boolean(alerts?.anomalies?.enabled ?? alerts?.anomalies);
  const creativesActive = Boolean(alerts?.creatives?.enabled ?? alerts?.creatives);

  const zeroTime = normalizeTimeToken(alerts?.zeroSpend?.time || alerts?.zeroSpend?.hour || ALERT_ZERO_DEFAULT_TIME);
  const billingTimesRaw = Array.isArray(alerts?.billing?.times)
    ? alerts.billing.times
    : Array.isArray(alerts?.billing?.hours)
    ? alerts.billing.hours
    : ALERT_BILLING_DEFAULT_TIMES;
  const billingTimes = Array.from(
    new Set(
      (billingTimesRaw || [])
        .map((time) => normalizeTimeToken(time))
        .filter(Boolean)
        .concat(billingActive ? ALERT_BILLING_DEFAULT_TIMES : []),
    ),
  ).sort();

  const keyboard = [
    [
      { text: `${zeroSpendActive ? '✅' : '⚪️'} Нулевой расход`, callback_data: `${base}:alerts:toggle:zero` },
      { text: `${billingActive ? '✅' : '⚪️'} Биллинг`, callback_data: `${base}:alerts:toggle:billing` },
    ],
    [
      { text: `${anomaliesActive ? '✅' : '⚪️'} Аномалии`, callback_data: `${base}:alerts:toggle:anomalies` },
      { text: `${creativesActive ? '✅' : '⚪️'} Креативы`, callback_data: `${base}:alerts:toggle:creatives` },
    ],
  ];

  if (zeroSpendActive) {
    const options = ALERT_ZERO_TIME_OPTIONS.map((time) => normalizeTimeToken(time)).filter(Boolean);
    let zeroRow = [];
    for (const time of options) {
      zeroRow.push({
        text: `${time === zeroTime ? '• ' : ''}${time}`,
        callback_data: `${base}:alerts:zero:time:${time.replace(':', '.')}`,
      });
      if (zeroRow.length === 3) {
        keyboard.push(zeroRow);
        zeroRow = [];
      }
    }
    if (zeroRow.length > 0) {
      keyboard.push(zeroRow);
    }
  }

  if (billingActive) {
    let row = [];
    const selectedSet = new Set((billingTimesRaw || []).map((time) => normalizeTimeToken(time)).filter(Boolean));
    for (const time of billingTimes) {
      row.push({
        text: `${selectedSet.has(time) ? '✅' : '⚪️'} ${time}`,
        callback_data: `${base}:alerts:billing:time:${time.replace(':', '.')}`,
      });
      if (row.length === 3) {
        keyboard.push(row);
        row = [];
      }
    }
    if (row.length > 0) {
      keyboard.push(row);
    }
    keyboard.push([{ text: '♻️ Сбросить часы', callback_data: `${base}:alerts:billing:reset` }]);
  }

  keyboard.push([{ text: '⬅️ К проекту', callback_data: `${base}:open` }]);

  return { inline_keyboard: keyboard };
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
    return { issues: [], statusLabel: '', debtUsd: null, cardLast4: '', fingerprint: '', isCritical: false };
  }

  const issues = [];
  if (Array.isArray(account.paymentIssues)) {
    for (const hint of account.paymentIssues) {
      if (hint) {
        issues.push(String(hint));
      }
    }
  }
  if (account.paymentIssue) {
    issues.push(String(account.paymentIssue));
  }

  const normalizedIssues = issues
    .map((issue) => issue.trim())
    .filter(Boolean);

  const statusLabel = account.paymentStatusLabel || account.statusLabel || account.status || '';
  const statusNormalized = statusLabel.toLowerCase();
  const debtRaw = account.debtUsd ?? account.debt_usd ?? account.debtUSD ?? account.balance_due_usd ?? null;
  const debtUsd = Number.isFinite(Number(debtRaw)) ? Number(debtRaw) : null;
  const cardLast4 =
    account.defaultPaymentMethodLast4 ||
    account.default_card_last4 ||
    account.card_last4 ||
    account.paymentMethodLast4 ||
    '';

  const criticalKeywords = ['оплат', 'задолж', 'списан', 'лимит', 'блок', 'declin', 'restrict'];
  const hasCriticalIssue = normalizedIssues.some((issue) => {
    const lowered = issue.toLowerCase();
    return criticalKeywords.some((keyword) => lowered.includes(keyword));
  });
  const criticalStatus = criticalKeywords.some((keyword) => statusNormalized.includes(keyword));
  const isCritical = criticalStatus || hasCriticalIssue;

  const fingerprintParts = [];
  if (isCritical) {
    if (statusLabel) fingerprintParts.push(statusLabel);
    if (debtUsd !== null) fingerprintParts.push(debtUsd.toFixed(2));
    for (const hint of normalizedIssues) {
      fingerprintParts.push(hint);
    }
  }

  return {
    issues: normalizedIssues,
    statusLabel,
    debtUsd,
    cardLast4,
    fingerprint: fingerprintParts.join('|'),
    isCritical,
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
    const spendValue = Number.isFinite(Number(campaign?.spendUsd))
      ? Number(campaign.spendUsd)
      : Number.isFinite(Number(campaign?.spend_usd))
      ? Number(campaign.spend_usd)
      : Number.isFinite(Number(campaign?.spend))
      ? Number(campaign.spend)
      : null;
    const spendText = spendValue !== null
      ? formatUsd(spendValue, { digitsBelowOne: 2, digitsAboveOne: 2 })
      : '—';
    const statusVisual = mapCampaignStatusVisual(
      campaign.status || campaign.effective_status || campaign.statusLabel || campaign.status_label || '',
    );
    const metrics = describeCampaignPrimaryMetrics(
      {
        ...campaign,
        spendUsd: Number.isFinite(spendValue) ? spendValue : campaign.spendUsd,
      },
      { objective: campaign.objective || campaign.optimization_goal || campaign.optimizationGoal },
    );
    const metricParts = [];
    if (metrics.label) {
      metricParts.push(`${metrics.label}: ${metrics.valueText}`);
    }
    if (metrics.costLabel) {
      metricParts.push(`${metrics.costLabel}: ${metrics.costText}`);
    }
    if (metrics.extraParts?.length) {
      metricParts.push(...metrics.extraParts);
    }
    const metricLine = metricParts.length > 0 ? metricParts.join(' | ') : '—';
    const title = campaign.name || campaign.campaign_name || campaign.campaignName || 'Кампания';
    lines.push(`${statusVisual.icon} <b>${escapeHtml(title)}</b> — ${spendText}`, metricLine);
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  if (campaigns.length > limit) {
    lines.push(`… и ещё ${formatInteger(campaigns.length - limit)} кампаний`);
  }

  return lines;
}

function buildProjectDetailMessage({ project, account, rawProject, timezone }) {
  const lines = [];
  const title = project?.name || account?.name || project?.id || 'Проект';
  const projectCode = project?.code ? String(project.code) : '';
  const projectId = !projectCode && project?.id ? String(project.id) : '';

  lines.push(`<b>${escapeHtml(title)}</b>`);
  if (projectCode) {
    lines.push(`Код: <code>${escapeHtml(projectCode)}</code>`);
  } else if (projectId) {
    lines.push(`ID: <code>${escapeHtml(projectId)}</code>`);
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

  lines.push('', '<b>Оплата клиента</b>');
  const billingLines = formatClientBillingLines(project?.clientBilling, { timezone });
  lines.push(...billingLines);

  const portalEmoji = project?.portalEnabled ? '🟢' : '🔴';
  const portalLine = project?.portalEnabled
    ? `${portalEmoji} Портал активен — ссылка доступна в меню.`
    : `${portalEmoji} Портал отключён. Откройте «🌐 Портал», чтобы включить доступ.`;
  lines.push('', portalLine);

  lines.push('', '<b>Актуальные кампании</b>');
  const campaignMap = new Map();
  const registerCampaigns = (source) => {
    if (!Array.isArray(source)) {
      return;
    }
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const rawId =
        entry.id || entry.campaign_id || entry.campaignId || entry.account_campaign_id || entry.accountCampaignId || '';
      const normalizedId = rawId ? String(rawId).replace(/^cmp_/, '') : '';
      const fallbackKey = entry.name ? `name:${entry.name}` : null;
      const key = normalizedId || fallbackKey;
      if (!key) {
        continue;
      }
      const normalizedEntry = {};
      for (const [field, value] of Object.entries(entry)) {
        if (value !== undefined && value !== null) {
          normalizedEntry[field] = value;
        }
      }
      const existing = campaignMap.get(key) || {};
      campaignMap.set(key, { ...existing, ...normalizedEntry });
    }
  };

  registerCampaigns(account?.campaignSummaries);
  registerCampaigns(project?.metrics?.campaigns);
  registerCampaigns(project?.campaigns);
  registerCampaigns(rawProject?.metrics?.campaigns);
  registerCampaigns(rawProject?.report?.campaigns);
  registerCampaigns(rawProject?.campaignSummaries);

  const campaigns = Array.from(campaignMap.values()).sort((a, b) => {
    const spendA = Number.isFinite(Number(a?.spendUsd))
      ? Number(a.spendUsd)
      : Number.isFinite(Number(a?.spend_usd))
      ? Number(a.spend_usd)
      : Number.isFinite(Number(a?.spend))
      ? Number(a.spend)
      : 0;
    const spendB = Number.isFinite(Number(b?.spendUsd))
      ? Number(b.spendUsd)
      : Number.isFinite(Number(b?.spend_usd))
      ? Number(b.spend_usd)
      : Number.isFinite(Number(b?.spend))
      ? Number(b.spend)
      : 0;
    return spendB - spendA;
  });

  lines.push(...buildCampaignLines(campaigns));

  const cpaRange = formatCpaRange(account?.cpaMinUsd, account?.cpaMaxUsd, campaigns);
  lines.push(`CPA (7д): ${cpaRange || 'данных нет'}`);

  const kpi = extractProjectKpi(rawProject);
  lines.push('', '<b>KPI</b>', ...formatKpiLines(kpi));

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
    case 'year':
      return 'Этот год';
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

function describeCampaignPrimaryMetrics(campaign, { objective } = {}) {
  const spend = Number.isFinite(campaign?.spendUsd) ? campaign.spendUsd : null;
  const leads = Number.isFinite(campaign?.leads) ? campaign.leads : null;
  const conversions = Number.isFinite(campaign?.conversions) ? campaign.conversions : null;
  const clicks = Number.isFinite(campaign?.clicks) ? campaign.clicks : null;
  const impressions = Number.isFinite(campaign?.impressions) ? campaign.impressions : null;
  const reach = Number.isFinite(campaign?.reach) ? campaign.reach : null;
  const cpaFromCampaign = Number.isFinite(campaign?.cpaUsd) ? campaign.cpaUsd : null;
  const objectiveTokens = [
    campaign?.objective,
    campaign?.objectiveType,
    campaign?.objective_type,
    campaign?.optimization_goal,
    campaign?.optimizationGoal,
    objective,
  ];
  const normalizedObjective = objectiveTokens
    .map((value) => (typeof value === 'string' ? value.trim().toUpperCase() : ''))
    .find((value) => value);

  const computeCost = (count, { multiplier = 1 } = {}) => {
    if (!Number.isFinite(spend) || !Number.isFinite(count) || count <= 0) {
      return null;
    }
    return (spend / count) * multiplier;
  };

  const costForLeads = Number.isFinite(leads) && leads > 0 ? cpaFromCampaign ?? computeCost(leads) : null;
  const costForConversions = Number.isFinite(conversions) && conversions > 0 ? cpaFromCampaign ?? computeCost(conversions) : null;
  const costPerClick = computeCost(clicks);
  const costPerThousandImpressions = computeCost(impressions, { multiplier: 1000 });
  const costPerThousandReach = computeCost(reach, { multiplier: 1000 });

  const scenarios = [
    { matches: ['LEAD'], label: 'Лиды', costLabel: 'CPL', value: leads, cost: costForLeads },
    {
      matches: ['CONVERSION', 'OUTCOME', 'SALE', 'SALES', 'PURCHASE'],
      label: 'Конверсии',
      costLabel: 'CPA',
      value: conversions,
      cost: costForConversions,
    },
    { matches: ['MESSAGE'], label: 'Диалоги', costLabel: 'CPD', value: conversions, cost: costForConversions },
    { matches: ['TRAFFIC', 'CLICK'], label: 'Клики', costLabel: 'CPC', value: clicks, cost: costPerClick },
    { matches: ['AWARENESS', 'REACH', 'BRAND'], label: 'Охват', costLabel: 'CPM', value: reach, cost: costPerThousandReach },
  ];

  let chosen = null;
  let matchedByObjective = false;
  if (normalizedObjective) {
    const match = scenarios.find((scenario) =>
      scenario.matches.some((needle) => normalizedObjective.includes(needle))
    );
    if (match) {
      matchedByObjective = true;
      chosen = match;
    }
  }

  if (!chosen || (!matchedByObjective && chosen.value === null && chosen.cost === null)) {
    const candidateWithValue = scenarios.find((scenario) => Number.isFinite(scenario.value));
    if (candidateWithValue) {
      chosen = candidateWithValue;
    }
  }

  if (!chosen) {
    const fallbacks = [
      { label: 'Лиды', costLabel: 'CPL', value: leads, cost: costForLeads },
      { label: 'Конверсии', costLabel: 'CPA', value: conversions, cost: costForConversions },
      { label: 'Клики', costLabel: 'CPC', value: clicks, cost: costPerClick },
      { label: 'Показы', costLabel: 'CPM', value: impressions, cost: costPerThousandImpressions },
      { label: 'Охват', costLabel: 'CPM', value: reach, cost: costPerThousandReach },
    ];
    chosen = fallbacks.find((scenario) => Number.isFinite(scenario.value)) || fallbacks[0];
  }

  const label = chosen?.label || 'Показатели';
  const costLabel = chosen?.costLabel || '';
  const valueRaw = Number.isFinite(chosen?.value) ? Number(chosen.value) : null;
  const costRaw = Number.isFinite(chosen?.cost) ? Number(chosen.cost) : null;
  const valueText = Number.isFinite(valueRaw) ? formatInteger(valueRaw) : '—';
  const costText = Number.isFinite(costRaw)
    ? formatUsd(costRaw, { digitsBelowOne: 2, digitsAboveOne: 0 })
    : '—';

  const extraParts = [];
  if (Number.isFinite(campaign?.ctr)) {
    extraParts.push(`CTR: ${formatPercentage(campaign.ctr, { digits: 1 })}`);
  }
  if (Number.isFinite(campaign?.frequency)) {
    extraParts.push(`Частота: ${formatFloat(campaign.frequency, { digits: 1 })}`);
  }

  return { label, valueText, costLabel, costText, extraParts, value: valueRaw, cost: costRaw };
}

function buildProjectReportPreview({ project, account, rawProject, preset, report }) {
  const lines = [];
  const range = report?.range || resolveReportRange(preset, { timezone: report?.range?.timezone });
  const baseLabel = report?.range?.label || formatReportPresetLabel(preset);
  const sinceLabel = range?.since ? formatDateShort(range.since, { timezone: range?.timezone }) : null;
  const untilLabel = range?.until ? formatDateShort(range.until, { timezone: range?.timezone }) : sinceLabel;

  const titleLabel = baseLabel || 'Период';
  let periodLabel = '';
  if (sinceLabel && untilLabel) {
    periodLabel = sinceLabel === untilLabel ? sinceLabel : `${sinceLabel} — ${untilLabel}`;
  } else if (range?.label) {
    periodLabel = range.label;
  } else if (sinceLabel) {
    periodLabel = sinceLabel;
  }

  const headerLine = periodLabel
    ? `📆 <b>Отчёт ${escapeHtml(titleLabel)}</b> (${escapeHtml(periodLabel)})`
    : `📆 <b>Отчёт ${escapeHtml(titleLabel)}</b>`;

  lines.push(headerLine);
  lines.push('');

  const campaigns = Array.isArray(report?.campaigns)
    ? report.campaigns
    : Array.isArray(account?.campaignSummaries)
    ? account.campaignSummaries
    : [];
  const kpi = extractProjectKpi(rawProject);
  const objectiveCandidates = [
    kpi?.objective,
    rawProject?.kpi?.objective,
    rawProject?.settings?.kpi?.objective,
    rawProject?.reporting?.kpi?.objective,
    rawProject?.metrics?.objective,
    project?.metrics?.objective,
    project?.objective,
    account?.primaryObjective,
    account?.objective,
  ];
  let projectObjective = '';
  for (const candidate of objectiveCandidates) {
    if (typeof candidate === 'string' && candidate) {
      projectObjective = candidate;
      break;
    }
  }
  let totalSpendComputed = 0;
  let totalLeadsComputed = 0;
  let totalConversionsComputed = 0;

  if (campaigns.length === 0) {
    lines.push('• Данных по кампаниям пока нет.');
  } else {
    for (const campaign of campaigns) {
      const spend = Number.isFinite(campaign.spendUsd) ? campaign.spendUsd : null;
      const leads = Number.isFinite(campaign.leads) ? campaign.leads : null;
      const conversions = Number.isFinite(campaign.conversions) ? campaign.conversions : null;
      if (Number.isFinite(spend)) {
        totalSpendComputed += spend;
      }
      if (Number.isFinite(leads)) {
        totalLeadsComputed += leads;
      }
      if (Number.isFinite(conversions)) {
        totalConversionsComputed += conversions;
      }

      const spendText = Number.isFinite(spend)
        ? formatUsd(spend, { digitsBelowOne: 2, digitsAboveOne: 2 })
        : '—';
      const metrics = describeCampaignPrimaryMetrics(campaign, { objective: projectObjective });
      const metricParts = [];
      if (metrics.label) {
        metricParts.push(`${metrics.label}: ${metrics.valueText}`);
      }
      if (metrics.costLabel) {
        metricParts.push(`${metrics.costLabel}: ${metrics.costText}`);
      }
      if (metrics.extraParts && metrics.extraParts.length > 0) {
        metricParts.push(...metrics.extraParts);
      }
      if (metricParts.length === 0) {
        metricParts.push('—');
      }
      lines.push(`• <b>${escapeHtml(campaign.name)}</b> - ${spendText}`);
      lines.push(metricParts.join(' | '));
      lines.push('');
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
  }

  const totalSpend = Number.isFinite(report?.totals?.spendUsd) ? report.totals.spendUsd : totalSpendComputed;
  const totalLeads = Number.isFinite(report?.totals?.leads) ? report.totals.leads : totalLeadsComputed;
  const totalConversions = Number.isFinite(report?.totals?.conversions)
    ? report.totals.conversions
    : totalConversionsComputed;
  const totalCpl = Number.isFinite(report?.totals?.cpaUsd)
    ? report.totals.cpaUsd
    : Number.isFinite(totalSpend) && Number.isFinite(totalLeads) && totalLeads > 0
    ? totalSpend / totalLeads
    : null;

  const totalSpendText = Number.isFinite(totalSpend)
    ? formatUsd(totalSpend, { digitsBelowOne: 2, digitsAboveOne: 2 })
    : '—';
  const totalLeadsText = Number.isFinite(totalLeads) ? formatInteger(totalLeads) : '—';
  const totalConversionsText = Number.isFinite(totalConversions) ? formatInteger(totalConversions) : '—';
  const totalMetrics = describeCampaignPrimaryMetrics(
    {
      spendUsd: totalSpend,
      leads: totalLeads,
      conversions: totalConversions,
      clicks: Number.isFinite(report?.totals?.clicks) ? report.totals.clicks : null,
      impressions: Number.isFinite(report?.totals?.impressions) ? report.totals.impressions : null,
      reach: Number.isFinite(report?.totals?.reach) ? report.totals.reach : null,
    },
    { objective: projectObjective },
  );
  const totalCostText = totalMetrics.costText || (Number.isFinite(totalCpl)
    ? formatUsd(totalCpl, { digitsBelowOne: 2, digitsAboveOne: 0 })
    : '—');

  const kpiLine = buildReportKpiLine(kpi, {
    totalSpend,
    totalLeads,
    totalDailyBudget: Number.isFinite(account?.spendTodayUsd) ? account.spendTodayUsd : totalSpend,
  });

  const summaryLines = [];
  if (kpiLine) {
    summaryLines.push(kpiLine);
  }
  const summaryParts = [];
  if (Number.isFinite(report?.totals?.reach)) {
    summaryParts.push(`Охват: ${formatInteger(report.totals.reach)}`);
  }
  if (Number.isFinite(report?.totals?.impressions)) {
    summaryParts.push(`Показы: ${formatInteger(report.totals.impressions)}`);
  }
  if (totalMetrics.label) {
    summaryParts.push(`${totalMetrics.label}: ${totalMetrics.valueText}`);
  }
  if (totalMetrics.costLabel) {
    summaryParts.push(`${totalMetrics.costLabel}: ${totalCostText}`);
  }
  if (summaryParts.length > 0) {
    summaryLines.push(summaryParts.join(' | '));
  }

  if (summaryLines.length > 0) {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(...summaryLines);
  }

  if (lines[lines.length - 1] !== '') {
    lines.push('');
  }
  const totalLabelParts = [
    `${totalMetrics.label || 'Цель'}: ${totalMetrics.valueText || (totalMetrics.label === 'Лиды' ? totalLeadsText : totalConversionsText)}`,
  ];
  const costLabel = totalMetrics.costLabel || 'CPA';
  totalLabelParts.push(`${costLabel}: ${totalCostText}`);
  lines.push(`🧾 ИТОГО: ${totalSpendText} | ${totalLabelParts.join(' | ')}`);

  return {
    text: lines.join('\n'),
    campaigns,
    range,
    label: baseLabel,
    preset,
  };
}

function selectAutopauseCandidates({ campaigns = [], kpiTarget = null, limit = 5 } = {}) {
  if (!Array.isArray(campaigns)) {
    return [];
  }

  const candidates = [];
  for (const campaign of campaigns) {
    if (!campaign || typeof campaign !== 'object') {
      continue;
    }

    const id = campaign.id || campaign.campaignId || null;
    if (!id) {
      continue;
    }

    const spend = Number.isFinite(campaign.spendUsd) ? campaign.spendUsd : null;
    const leads = Number.isFinite(campaign.leads) ? campaign.leads : null;
    const cpa = Number.isFinite(campaign.cpaUsd)
      ? campaign.cpaUsd
      : Number.isFinite(spend) && Number.isFinite(leads) && leads > 0
      ? spend / leads
      : null;

    const reasons = [];
    if (Number.isFinite(spend) && spend > 0 && (!Number.isFinite(leads) || leads === 0)) {
      reasons.push('нет лидов при расходе');
    }
    if (Number.isFinite(kpiTarget) && Number.isFinite(cpa) && cpa > kpiTarget) {
      const diff = cpa - kpiTarget;
      if (diff / kpiTarget >= 0.15) {
        reasons.push(`CPA ${formatUsd(cpa, { digitsBelowOne: 2, digitsAboveOne: 0 })}`);
      }
    }

    if (reasons.length === 0) {
      continue;
    }

    candidates.push({
      id: String(id),
      name: campaign.name || `Кампания ${id}`,
      spend,
      leads,
      cpa,
      reason: reasons.join(', '),
    });
  }

  candidates.sort((a, b) => {
    const spendA = Number.isFinite(a.spend) ? a.spend : 0;
    const spendB = Number.isFinite(b.spend) ? b.spend : 0;
    return spendB - spendA;
  });

  return candidates.slice(0, Math.max(1, limit));
}

function buildDigestPreview({ sections = [], timezone }) {
  const digestLines = ['<b>Сводный отчёт</b>'];

  for (const section of sections) {
    if (!section || !section.preview) {
      continue;
    }

    const { label, preview } = section;
    const range = preview.range || {};
    const sinceLabel = range.since ? formatDateShort(range.since, { timezone: range.timezone || timezone }) : null;
    const untilLabel = range.until ? formatDateShort(range.until, { timezone: range.timezone || timezone }) : sinceLabel;
    let header = label || 'Период';
    if (sinceLabel && untilLabel) {
      header = `${label} (${sinceLabel === untilLabel ? sinceLabel : `${sinceLabel} — ${untilLabel}`})`;
    } else if (preview.label) {
      header = `${label} (${preview.label})`;
    }

    digestLines.push('', `<b>${escapeHtml(header)}</b>`);

    const previewLines = String(preview.text || '')
      .split('\n')
      .map((line) => line.trimEnd());
    const body = previewLines.slice(1);
    digestLines.push(...(body.length > 0 ? body : ['• Данных нет.']));
  }

  return { text: digestLines.join('\n') };
}

function buildProjectDetailKeyboard(base, { chatUrl, portalUrl } = {}) {
  const keyboard = [];
  keyboard.push([
    chatUrl ? { text: '💬 Чат-группа', url: chatUrl } : { text: '💬 Чат-группа', callback_data: `${base}:chat` },
    { text: '🌐 Портал', callback_data: `${base}:portal` },
    { text: '📊 Аналитика', callback_data: `${base}:analytics` },
  ]);

  keyboard.push([
    { text: '💳 Оплата', callback_data: `${base}:payment` },
    { text: '📈 Отчёты', callback_data: `${base}:reports` },
    { text: '🎯 KPI', callback_data: `${base}:kpi` },
  ]);

  keyboard.push([
    { text: '🚨 Алерты', callback_data: `${base}:alerts` },
    { text: '🔄 Обновить', callback_data: `${base}:refresh` },
    { text: '⬅️ В админку', callback_data: 'admin:panel' },
  ]);

  return { inline_keyboard: keyboard };
}

function buildProjectReportKeyboard(
  base,
  { portalUrl, canSendToChat = false, canSendToAdmin = false, hasPreview = false } = {},
) {
  const rows = [
    [
      { text: 'Сегодня', callback_data: `${base}:report:today` },
      { text: 'Вчера', callback_data: `${base}:report:yesterday` },
      { text: '7 дней', callback_data: `${base}:report:week` },
    ],
    [
      { text: 'Месяц', callback_data: `${base}:report:month` },
      { text: 'Год', callback_data: `${base}:report:year` },
      { text: 'Диапазон', callback_data: `${base}:report:custom` },
    ],
  ];

  if (hasPreview && (canSendToChat || canSendToAdmin || portalUrl)) {
    const sendRow = [];
    if (canSendToChat) {
      sendRow.push({ text: '📤 В чат клиента', callback_data: `${base}:report:send:chat` });
    }
    if (canSendToAdmin) {
      sendRow.push({ text: '📨 В мой чат', callback_data: `${base}:report:send:admin` });
    }
    if (portalUrl) {
      sendRow.push({ text: '🌐 Портал', url: portalUrl });
    }
    rows.push(sendRow);
  } else if (portalUrl) {
    rows.push([{ text: '🌐 Портал', url: portalUrl }]);
  }

  rows.push([
    { text: '📈 Сводный отчёт', callback_data: `${base}:digest` },
    { text: '⬅️ К проекту', callback_data: `${base}:open` },
  ]);

  return { inline_keyboard: rows };
}

function buildAutopauseKeyboard(base, { autopause } = {}) {
  const enabled = Boolean(autopause?.enabled);
  const threshold = Number.isFinite(autopause?.thresholdDays) ? autopause.thresholdDays : 3;

  const toggleLabel = enabled ? '🔴 Выключить' : '🟢 Включить';
  const keyboard = [];

  keyboard.push([
    { text: toggleLabel, callback_data: `${base}:autopause:toggle` },
    { text: '🔄 Обновить', callback_data: `${base}:autopause` },
  ]);

  const thresholdRow = AUTOPAUSE_THRESHOLD_OPTIONS.map((days) => {
    const selected = days === threshold;
    const label = selected ? `• ${days}д` : `${days}д`;
    return { text: label, callback_data: `${base}:autopause:threshold:${days}` };
  });
  keyboard.push(thresholdRow);

  keyboard.push([{ text: '⏸ Поставить на паузу', callback_data: `${base}:autopause:trigger` }]);

  if (enabled) {
    keyboard.push([{ text: '📄 История', callback_data: `${base}:autopause:history` }]);
  }

  keyboard.push([{ text: '⬅️ К проекту', callback_data: `${base}:open` }]);

  return { inline_keyboard: keyboard };
}

function buildPaymentCalendarKeyboard(base, { timezone } = {}) {
  const rows = [];
  const today = new Date();

  for (let offset = 0; offset < 6; offset += 2) {
    const row = [];
    for (let inner = 0; inner < 2; inner += 1) {
      const daysOffset = offset + inner;
      const date = new Date(today.getTime());
      date.setDate(today.getDate() - daysOffset);
      const iso = formatDateIsoInTimeZone(date, timezone).slice(0, 10);
      const label = formatDateShort(date, { timezone }) || iso;
      const prefix = daysOffset === 0 ? 'Сегодня — ' : daysOffset === 1 ? 'Вчера — ' : '';
      row.push({ text: `${prefix}${label}`, callback_data: `${base}:payment:set:${iso}` });
    }
    rows.push(row);
  }

  rows.push([{ text: '⬅️ Назад', callback_data: `${base}:payment` }]);
  return { inline_keyboard: rows };
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
  const cpaRange = formatCpaRange(cpaMin, cpaMax, account?.campaignSummaries);
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
  const portalTokens = Array.from(extractPortalTokens(raw));
  const portalEnabled = isPortalActive(raw);
  const clientBilling = extractClientBilling(raw);

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
    portalTokens,
    portalEnabled,
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
    clientBilling,
  };
}

function buildProjectSummaries(projectRecords, metaStatus, { timezone } = {}) {
  const projects = Array.isArray(projectRecords) ? projectRecords : [];
  const status = pickMetaStatus(metaStatus) || {};
  const facebook = status.facebook && typeof status.facebook === 'object' ? status.facebook : {};
  const accounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
  const accountById = new Map();
  const accountOrder = [];
  for (const account of accounts) {
    if (!account || typeof account !== 'object') continue;
    const accountId = account.accountId || account.id;
    if (accountId) {
      const key = String(accountId).replace(/^act_/, '');
      if (!accountById.has(key)) {
        accountById.set(key, account);
        accountOrder.push(key);
      }
    }
  }

  const now = new Date();
  const items = [];
  const usedAccounts = new Set();

  for (const record of projects) {
    if (!record) continue;
    const normalizedAccountId = normalizeAccountKey(record.adAccountId || record.meta?.accountId || record.meta_account_id);
    const account = normalizedAccountId ? accountById.get(normalizedAccountId) : null;
    if (normalizedAccountId) {
      usedAccounts.add(normalizedAccountId);
    }

    const portalTokens = Array.isArray(record.portalTokens)
      ? record.portalTokens.map((token) => String(token || '').trim()).filter(Boolean)
      : [];
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
    const cpaRange = formatCpaRange(account?.cpaMinUsd, account?.cpaMaxUsd, account?.campaignSummaries);

    const displayName = record.name || account?.name || record.id;
    const headerParts = [
      displayName,
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

    items.push({
      id: record.id,
      code: record.code || record.id || '',
      callbackId: normalizeProjectIdForCallback(record.id),
      chatUrl: record.chatUrl || '',
      chatTitle: record.chatTitle || record.chat?.title || '',
      lines,
      daysUntil,
      spendUsd,
      currency,
      title: displayName,
      accountId: normalizedAccountId ? `act_${normalizedAccountId}` : '',
      placeholder: false,
      portalTokens,
    });
  }

  const placeholders = [];
  for (const key of accountOrder) {
    if (usedAccounts.has(key)) {
      continue;
    }
    const account = accountById.get(key);
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
    if (account.paymentIssues && account.paymentIssues.length > 0) {
      lines.push(`Проблемы: ${escapeHtml(account.paymentIssues.filter(Boolean).join(' • '))}`);
    }
    lines.push('Проект ещё не создан. Используйте «Подключить проект».');

    placeholders.push({
      id: account.accountId || account.id,
      callbackId: normalizeProjectIdForCallback(account.accountId || account.id),
      chatUrl: '',
      chatTitle: '',
      lines,
      daysUntil,
      title: account.name || account.id || 'Рекламный аккаунт',
      accountId: key ? `act_${key}` : '',
      placeholder: true,
      currency: account.currency || 'USD',
      spendUsd: Number.isFinite(Number(account.spendTodayUsd)) ? Number(account.spendTodayUsd) : null,
      portalTokens: [],
      code: '',
    });
  }

  const placeholderLimit = 4;
  const placeholdersShown = placeholders.slice(0, placeholderLimit);

  return {
    items: items.concat(placeholdersShown),
    placeholderCount: placeholders.length,
    placeholdersShown: placeholdersShown.length,
    placeholders,
  };
}

function renderAdminDashboard({
  metaStatus,
  projectSummaries,
  webhook,
  totals,
  timezone,
  placeholderCount = 0,
  placeholdersShown = 0,
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
  lines.push('', '<b>Facebook</b>');
  lines.push(`Статус: ${connectionEmoji} ${connected ? 'Подключено' : 'Нет данных'}`);
  if (connected && facebook.accountName) {
    lines.push(`Аккаунт: <b>${escapeHtml(facebook.accountName)}</b>`);
  } else if (!connected && facebook.accountName) {
    lines.push(`Последний статус: ${escapeHtml(facebook.accountName)}`);
  }
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

  if (placeholderCount > 0 && placeholdersShown > 0) {
    lines.push(
      '',
      `Без проекта: ${placeholdersShown} из ${placeholderCount} аккаунтов Meta. Откройте раздел «Новые РК».`,
    );
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

const PORTAL_PERIOD_DEFINITIONS = [
  { id: 'today', label: 'Сегодня', preset: 'today' },
  { id: 'yesterday', label: 'Вчера', preset: 'yesterday' },
  { id: 'week', label: '7 дней', preset: 'week' },
  { id: 'month', label: 'Месяц', preset: 'month' },
  { id: 'year', label: 'Год', preset: 'year' },
];

function listPortalPeriodDefinitions() {
  return PORTAL_PERIOD_DEFINITIONS.map((item) => ({ ...item }));
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

function mapCampaignStatusVisual(status) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized) {
    return { icon: '⚪', category: 'completed', label: 'Неактивна' };
  }
  if (normalized === 'ACTIVE') {
    return { icon: '🟢', category: 'active', label: 'Активна' };
  }
  const completedHints = [
    'PAUSED',
    'ARCHIVED',
    'DELETED',
    'INACTIVE',
    'STOP',
    'OFF',
    'DISAPPROVED',
    'COMPLETED',
    'ENDED',
    'DISABLED',
  ];
  if (completedHints.some((hint) => normalized.includes(hint))) {
    return { icon: '⚪', category: 'completed', label: 'Отключена' };
  }
  const activeHints = ['ACTIVE', 'RUNNING', 'DELIVERING', 'DELIVERY'];
  if (activeHints.some((hint) => normalized.includes(hint))) {
    const degraded = /ISSUE|LIMITED|RESTRICT|PROBLEM|ERROR|WARNING/.test(normalized);
    return {
      icon: degraded ? '🟠' : '🟢',
      category: 'active',
      label: degraded ? 'Активна (с ограничениями)' : 'Активна',
    };
  }
  const pendingHints = ['PENDING', 'PROCESS', 'REVIEW', 'SCHEDULE', 'IN_PROGRESS', 'LEARNING'];
  if (pendingHints.some((hint) => normalized.includes(hint))) {
    return { icon: '🟡', category: 'pending', label: 'На модерации' };
  }
  return { icon: '🟡', category: 'pending', label: normalized };
}

function resolveCampaignKeyMetric(campaign, { fallbackObjective } = {}) {
  const objectiveCandidates = [
    campaign?.objective,
    campaign?.objectiveType,
    campaign?.objective_type,
    campaign?.optimization_goal,
    campaign?.optimizationGoal,
    fallbackObjective,
  ];
  let objective = '';
  for (const candidate of objectiveCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      objective = candidate.trim().toUpperCase();
      break;
    }
  }
  const leads = Number(campaign?.leads);
  const conversions = Number(campaign?.conversions);
  const clicks = Number(campaign?.clicks);
  const reach = Number(campaign?.reach);

  if (objective.includes('LEAD')) {
    return { label: 'Лиды', value: Number.isFinite(leads) ? leads : null };
  }
  if (objective.includes('CONVERSION') || objective.includes('SALE') || objective.includes('OUTCOME')) {
    if (Number.isFinite(conversions)) {
      return { label: 'Покупки', value: conversions };
    }
    if (Number.isFinite(leads)) {
      return { label: 'Покупки', value: leads };
    }
    return { label: 'Покупки', value: null };
  }
  if (objective.includes('MESSAGE')) {
    if (Number.isFinite(conversions)) {
      return { label: 'Сообщения', value: conversions };
    }
    if (Number.isFinite(leads)) {
      return { label: 'Сообщения', value: leads };
    }
    return { label: 'Сообщения', value: null };
  }
  if (objective.includes('TRAFFIC')) {
    return { label: 'Клики', value: Number.isFinite(clicks) ? clicks : null };
  }
  if (objective.includes('AWARE') || objective.includes('REACH')) {
    return { label: 'Охват', value: Number.isFinite(reach) ? reach : null };
  }
  return { label: 'Лиды', value: Number.isFinite(leads) ? leads : null };
}

function inferObjectiveFromCampaigns(campaigns, { campaignIndex, defaultObjective } = {}) {
  const counts = new Map();
  const register = (value, weight = 1) => {
    if (!value || !Number.isFinite(weight) || weight <= 0) {
      return;
    }
    const normalized = String(value).trim().toUpperCase();
    if (!normalized) {
      return;
    }
    counts.set(normalized, (counts.get(normalized) || 0) + weight);
  };

  const normalizedDefault = typeof defaultObjective === 'string' ? defaultObjective.trim().toUpperCase() : '';
  if (normalizedDefault) {
    register(normalizedDefault, 0.5);
  }

  if (Array.isArray(campaigns)) {
    for (const campaign of campaigns) {
      if (!campaign || typeof campaign !== 'object') {
        continue;
      }

      const spend = Number(campaign?.spendUsd ?? campaign?.spend_usd ?? campaign?.spend);
      const weight = Number.isFinite(spend) && spend > 0 ? spend : 1;
      const registerCandidate = (raw, factor = 1) => {
        if (!raw) {
          return;
        }
        register(raw, weight * factor);
      };

      registerCandidate(campaign.objective, 1);
      registerCandidate(campaign.objective_type, 1);
      registerCandidate(campaign.objectiveType, 1);
      registerCandidate(campaign.optimization_goal, 0.8);
      registerCandidate(campaign.optimizationGoal, 0.8);
      registerCandidate(campaign.result_type, 0.5);
      registerCandidate(campaign.resultType, 0.5);

      const rawId = String(campaign.id || '').trim();
      if (rawId && campaignIndex instanceof Map) {
        const lookupId = rawId.replace(/^cmp_/, '');
        const indexEntry = campaignIndex.get(rawId) || campaignIndex.get(lookupId) || null;
        if (indexEntry) {
          registerCandidate(indexEntry.objective, 1);
          registerCandidate(indexEntry.objective_type, 1);
          registerCandidate(indexEntry.objectiveType, 1);
          registerCandidate(indexEntry.optimization_goal, 0.8);
          registerCandidate(indexEntry.optimizationGoal, 0.8);
        }
      }

      if (Number.isFinite(campaign?.leads)) {
        register('LEAD', Math.max(weight * 0.6, 1));
      }
      if (Number.isFinite(campaign?.conversions)) {
        register('CONVERSIONS', Math.max(weight * 0.6, 1));
      }
      if (
        Number.isFinite(campaign?.clicks) &&
        !Number.isFinite(campaign?.leads) &&
        !Number.isFinite(campaign?.conversions)
      ) {
        register('TRAFFIC', weight * 0.4);
      }
      if (
        Number.isFinite(campaign?.reach) &&
        !Number.isFinite(campaign?.clicks) &&
        !Number.isFinite(campaign?.leads)
      ) {
        register('AWARENESS', weight * 0.3);
      }
    }
  }

  if (counts.size === 0) {
    return normalizedDefault;
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  if (!best) {
    return normalizedDefault;
  }

  return best[0];
}

function buildPortalPeriodPayload(period, { timezone, currency, kpiMeta, objectiveHint, campaignIndex }) {
  const payload = {
    id: period.id,
    label: period.label,
    rangeLabel: period?.report?.range?.label || '',
    error: period.error || null,
    metrics: [],
    campaigns: [],
    fresh: false,
  };

  if (!payload.rangeLabel && period?.report?.range) {
    const { since, until } = period.report.range;
    const sinceLabel = since ? formatDateLabel(since, { timezone }) : '';
    const untilLabel = until ? formatDateLabel(until, { timezone }) : '';
    payload.rangeLabel = sinceLabel && untilLabel ? `${sinceLabel} — ${untilLabel}` : sinceLabel || untilLabel || '';
  }

  const report = period?.report;
  if (!report || period.error) {
    return payload;
  }

  const campaigns = Array.isArray(report.campaigns) ? report.campaigns : [];
  const inferredObjective = inferObjectiveFromCampaigns(campaigns, {
    campaignIndex,
    defaultObjective: objectiveHint,
  });
  const objectiveForTotals = inferredObjective || objectiveHint;

  const totals = report.totals || {};
  const spendValue = Number.isFinite(totals.spendUsd) ? totals.spendUsd : null;
  const leadsValue = Number.isFinite(totals.leads) ? totals.leads : null;
  const conversionsValue = Number.isFinite(totals.conversions) ? totals.conversions : null;
  const cpaValue = Number.isFinite(totals.cpaUsd)
    ? totals.cpaUsd
    : safeDivision(totals.spendUsd, leadsValue || conversionsValue);
  const cpcValue = safeDivision(totals.spendUsd, totals.clicks);
  const ctrValue = safeDivision(totals.clicks, totals.impressions) * 100;

  const aggregateMetrics = describeCampaignPrimaryMetrics(
    {
      spendUsd: spendValue,
      leads: leadsValue,
      conversions: conversionsValue,
      clicks: Number.isFinite(totals.clicks) ? totals.clicks : null,
      impressions: Number.isFinite(totals.impressions) ? totals.impressions : null,
      reach: Number.isFinite(totals.reach) ? totals.reach : null,
    },
    { objective: objectiveForTotals },
  );

  payload.metrics = [
    {
      id: 'spend',
      label: `Расход (${currency || 'USD'})`,
      value: spendValue,
      text: spendValue !== null ? formatUsd(spendValue, { digitsBelowOne: 2, digitsAboveOne: 2 }) : '—',
    },
    {
      id: 'key_metric',
      label: aggregateMetrics.label || 'Цель',
      value: Number.isFinite(aggregateMetrics.value) ? aggregateMetrics.value : null,
      text: aggregateMetrics.valueText || '—',
    },
    {
      id: 'kpi',
      label: aggregateMetrics.costLabel || kpiMeta.label,
      value: Number.isFinite(aggregateMetrics.cost)
        ? aggregateMetrics.cost
        : Number.isFinite(cpaValue)
        ? cpaValue
        : null,
      text:
        Number.isFinite(aggregateMetrics.cost)
          ? aggregateMetrics.costText
          : Number.isFinite(cpaValue)
          ? formatUsd(cpaValue, { digitsBelowOne: 2, digitsAboveOne: 2 })
          : '—',
    },
    {
      id: 'cpc',
      label: 'CPC',
      value: Number.isFinite(cpcValue) ? cpcValue : null,
      text: Number.isFinite(cpcValue) ? formatUsd(cpcValue, { digitsBelowOne: 2, digitsAboveOne: 2 }) : '—',
    },
    {
      id: 'ctr',
      label: 'CTR',
      value: Number.isFinite(ctrValue) ? ctrValue : null,
      text: Number.isFinite(ctrValue) ? `${formatFloat(ctrValue, { digits: 1 })}%` : '—',
    },
    {
      id: 'reach',
      label: 'Охват',
      value: Number.isFinite(totals.reach) ? totals.reach : null,
      text: formatInteger(totals.reach),
    },
    {
      id: 'impressions',
      label: 'Показы',
      value: Number.isFinite(totals.impressions) ? totals.impressions : null,
      text: formatInteger(totals.impressions),
    },
    {
      id: 'clicks',
      label: 'Клики',
      value: Number.isFinite(totals.clicks) ? totals.clicks : null,
      text: formatInteger(totals.clicks),
    },
  ];

  if (aggregateMetrics.label !== 'Лиды' && Number.isFinite(leadsValue)) {
    payload.metrics.splice(3, 0, {
      id: 'leads',
      label: 'Лиды',
      value: leadsValue,
      text: formatInteger(leadsValue),
    });
  }

  if (aggregateMetrics.label !== 'Конверсии' && Number.isFinite(conversionsValue)) {
    const insertIndex = aggregateMetrics.label !== 'Лиды' && Number.isFinite(leadsValue) ? 4 : 3;
    payload.metrics.splice(insertIndex, 0, {
      id: 'conversions',
      label: 'Конверсии',
      value: conversionsValue,
      text: formatInteger(conversionsValue),
    });
  }

  payload.objective = objectiveForTotals || null;
  payload.campaigns = campaigns.map((campaign) => {
    const rawId = String(campaign?.id || '');
    const lookupId = rawId.replace(/^cmp_/, '');
    const indexEntry = campaignIndex.get(rawId) || campaignIndex.get(lookupId) || null;
    const statusSource = campaign?.status || indexEntry?.status || indexEntry?.statusLabel || '';
    const statusVisual = mapCampaignStatusVisual(statusSource);
    const fallbackObjective =
      campaign?.objective ||
      campaign?.objectiveType ||
      campaign?.objective_type ||
      campaign?.optimization_goal ||
      campaign?.optimizationGoal ||
      indexEntry?.objective ||
      indexEntry?.objectiveType ||
      indexEntry?.objective_type ||
      indexEntry?.optimization_goal ||
      indexEntry?.optimizationGoal ||
      objectiveForTotals ||
      objectiveHint;
    const spend = Number.isFinite(campaign?.spendUsd) ? Number(campaign.spendUsd) : null;
    const spendText = spend !== null ? formatUsd(spend, { digitsBelowOne: 2, digitsAboveOne: 2 }) : '—';
    const metrics = describeCampaignPrimaryMetrics(campaign, { objective: fallbackObjective });
    const keyMetricValue = Number.isFinite(metrics.value) ? metrics.value : null;
    const keyMetricText = metrics.valueText || '—';
    const costLabel = metrics.costLabel || (metrics.label === 'Клики' ? 'CPC' : 'CPA');
    const derivedCost = Number.isFinite(metrics.cost) ? metrics.cost : Number(campaign?.cpaUsd);
    const costValue = Number.isFinite(derivedCost)
      ? derivedCost
      : safeDivision(campaign?.spendUsd, keyMetricValue || campaign?.leads);
    const costText = Number.isFinite(costValue)
      ? formatUsd(costValue, { digitsBelowOne: 2, digitsAboveOne: 2 })
      : '—';
    const cpc = safeDivision(campaign?.spendUsd, campaign?.clicks);
    const cpcText = Number.isFinite(cpc)
      ? formatUsd(cpc, { digitsBelowOne: 2, digitsAboveOne: 2 })
      : '—';
    const ctr = Number.isFinite(campaign?.ctr)
      ? Number(campaign.ctr)
      : safeDivision(campaign?.clicks, campaign?.impressions) * 100;
    const ctrText = Number.isFinite(ctr) ? `${formatFloat(ctr, { digits: 1 })}%` : '—';
    const lastActivitySource =
      campaign?.dateStop ||
      campaign?.dateStart ||
      indexEntry?.dateStop ||
      indexEntry?.date_start ||
      indexEntry?.dateStart ||
      null;
    const lastActivity = lastActivitySource ? formatDateLabel(lastActivitySource, { timezone }) : '';

    return {
      id: rawId || lookupId || '',
      name: campaign?.name || indexEntry?.name || (rawId ? `Campaign ${rawId}` : 'Campaign'),
      statusIcon: statusVisual.icon,
      statusCategory: statusVisual.category,
      statusLabel: statusVisual.label,
      keyMetricLabel: metrics.label || 'Показатели',
      keyMetricText,
      keyMetricValue,
      spendText,
      spendValue: spend !== null ? spend : 0,
      costLabel,
      costText,
      costValue: Number.isFinite(costValue) ? Number(costValue) : null,
      cpaText: costText,
      cpaValue: Number.isFinite(costValue) ? Number(costValue) : null,
      cpcText,
      cpcValue: Number.isFinite(cpc) ? Number(cpc) : null,
      ctrText,
      ctrValue: Number.isFinite(ctr) ? Number(ctr) : null,
      objective: fallbackObjective || '',
      lastActivity,
      extraParts: Array.isArray(metrics.extraParts) ? metrics.extraParts : [],
    };
  });

  return payload;
}

function buildPortalDataset({ projectCode, signature, timezone, currency, periods, account, kpi }) {
  const campaignIndex = new Map();
  if (Array.isArray(account?.campaignSummaries)) {
    for (const entry of account.campaignSummaries) {
      if (!entry) {
        continue;
      }
      const rawId = String(entry.id || entry.campaign_id || entry.campaignId || '').replace(/^cmp_/, '');
      if (!rawId) {
        continue;
      }
      campaignIndex.set(rawId, entry);
      campaignIndex.set(String(entry.id || entry.campaign_id || entry.campaignId || ''), entry);
    }
  }

  const kpiMeta = resolvePortalKpiMeta(kpi);
  const objectiveHint = kpi?.objective || account?.objective || '';

  const dataset = {};
  let defaultPeriod = null;

  for (const period of periods) {
    const payload = buildPortalPeriodPayload(period, {
      timezone,
      currency,
      kpiMeta,
      objectiveHint,
      campaignIndex,
    });
    dataset[period.id] = payload;
    if (
      !defaultPeriod ||
      (!payload.error && payload.campaigns.length > 0 && period.id !== 'yesterday')
    ) {
      defaultPeriod = period.id;
    }
  }

  if (!defaultPeriod) {
    defaultPeriod = periods.find((item) => item && !item.error)?.id || periods[0]?.id || 'today';
  }

  return {
    projectCode,
    signature,
    timezone,
    currency,
    defaultPeriod,
    periods: dataset,
  };
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
  feedbackStatus = '',
  projectCode = '',
}) {
  const projectName = escapeHtml(project?.name || 'Проект');
  const projectCodeTag = project?.code ? `<span class="project-code">${escapeHtml(project.code)}</span>` : '';
  const currencyCode = currency || account?.currency || project?.metrics?.currency || 'USD';
  const snapshot = resolveTimezoneSnapshot(generatedAt, timezone);
  const updatedLabel = snapshot
    ? `${snapshot.day}.${snapshot.month}.${snapshot.year} ${String(snapshot.hour).padStart(2, '0')}:${String(snapshot.minute).padStart(2, '0')} (${snapshot.timezone})`
    : new Date(generatedAt).toISOString();

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
  const accountStatusLabel = account?.paymentStatusLabel || account?.statusLabel || account?.status || '—';
  const statusEmoji = determineAccountSignal(account, { daysUntilDue: billingCountdown });
  const debtRaw = Number(account?.debtUsd);
  const debtText = Number.isFinite(debtRaw) && Math.abs(debtRaw) > 0.01
    ? formatUsd(debtRaw, { digitsBelowOne: 2, digitsAboveOne: 2 })
    : '';
  const cardLast4 =
    account?.defaultPaymentMethodLast4 ||
    account?.paymentMethodLast4 ||
    account?.card_last4 ||
    account?.default_card_last4 ||
    '';
  const paymentIssuesText = Array.isArray(account?.paymentIssues)
    ? account.paymentIssues.filter(Boolean).join(' • ')
    : '';
  const paymentTags = [];
  if (debtText) {
    paymentTags.push(`<span class="status-tag status-tag--warning">Долг ${escapeHtml(debtText)}</span>`);
  }
  if (cardLast4) {
    paymentTags.push(`<span class="status-tag">Карта ****${escapeHtml(String(cardLast4))}</span>`);
  }
  const paymentTagMarkup = paymentTags.length > 0 ? `<div class="status-tags">${paymentTags.join('')}</div>` : '';
  const statusToneClass =
    statusEmoji === '🔴' ? 'status-value--alert' : statusEmoji === '🟡' ? 'status-value--warn' : 'status-value--ok';
  const timezoneLabel = snapshot?.timezone || timezone || '';

  const kpiMeta = resolvePortalKpiMeta(kpi);
  const insightsList = Array.isArray(insights) ? insights.filter(Boolean) : [];
  const insightsBlock =
    insightsList.length > 0
      ? `<ul class="insights-list">${insightsList.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
      : '<p class="muted">Новых замечаний нет — показатели держатся стабильно.</p>';

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

  const managerButton = managerLink
    ? `<a class="primary-button" href="${escapeHtml(managerLink)}" target="_blank" rel="noopener noreferrer">Написать в чат</a>`
    : '<span class="primary-button disabled" aria-disabled="true">Ссылка на чат не настроена</span>';

  const normalizedAccountKey = normalizeAccountKey(
    account?.accountId || account?.id || account?.account_id || project?.adAccountId,
  );
  const accountIdDisplay = normalizedAccountKey ? `act_${normalizedAccountKey}` : '';
  let accountTitle = account?.name || account?.accountName || '';
  if (!accountTitle && accountIdDisplay) {
    accountTitle = accountIdDisplay;
  }
  if (!accountTitle) {
    accountTitle = project?.name || 'Рекламный аккаунт';
  }
  const accountBusiness = account?.businessName || account?.business_name || account?.business?.name || '';
  const accountTimezoneRaw = account?.timezoneName || account?.timezone_name || account?.timezone || '';
  const accountCurrency = account?.currency || currencyCode || '';
  const accountBadge = accountCurrency ? `<span class="badge">${escapeHtml(accountCurrency)}</span>` : '';
  const accountMetaItems = [];
  if (accountIdDisplay) {
    accountMetaItems.push(
      `<div class="account-meta-item"><span class="account-meta-label">ID</span><code>${escapeHtml(accountIdDisplay)}</code></div>`,
    );
  }
  if (accountBusiness) {
    accountMetaItems.push(
      `<div class="account-meta-item"><span class="account-meta-label">Бизнес</span><span>${escapeHtml(accountBusiness)}</span></div>`,
    );
  }
  if (accountTimezoneRaw) {
    accountMetaItems.push(
      `<div class="account-meta-item"><span class="account-meta-label">Часовой пояс</span><span>${escapeHtml(accountTimezoneRaw)}</span></div>`,
    );
  }
  const accountMetaMarkup = accountMetaItems.length > 0 ? `<div class="account-meta">${accountMetaItems.join('')}</div>` : '';
  const accountManagerLink = normalizedAccountKey
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(normalizedAccountKey)}`
    : '';
  const accountActionsMarkup = accountManagerLink
    ? `<div class="account-actions"><a class="secondary-button" href="${escapeHtml(accountManagerLink)}" target="_blank" rel="noopener noreferrer">Открыть Ads Manager</a></div>`
    : '';
  const hasAccountDetails = Boolean(accountIdDisplay || account?.name || accountBusiness || accountActionsMarkup);
  const accountCardMarkup = hasAccountDetails
    ? `<div class="card account-card">
        <div class="card-head">
          <span class="card-title">Рекламный аккаунт</span>
          ${accountBadge}
        </div>
        <div class="account-name">${escapeHtml(accountTitle)}</div>
        ${accountMetaMarkup}
        ${accountActionsMarkup}
      </div>`
    : '';

  const dataset = buildPortalDataset({
    projectCode: projectCode || project?.code || project?.id || '',
    signature,
    timezone,
    currency: currencyCode,
    periods,
    account,
    kpi,
  });
  const defaultPeriodPayload = dataset?.periods?.[dataset.defaultPeriod] || {};
  const resolveMetric = (id) => {
    if (!defaultPeriodPayload || !Array.isArray(defaultPeriodPayload.metrics)) {
      return null;
    }
    return defaultPeriodPayload.metrics.find((metric) => metric && metric.id === id) || null;
  };
  const defaultSpendMetric = resolveMetric('spend') || {};
  const defaultKeyMetric = resolveMetric('key_metric') || {};
  const defaultCostMetric = resolveMetric('kpi') || { label: kpiMeta.label };
  const defaultSpendText = defaultSpendMetric.text || '—';
  const defaultKeyLabel = defaultKeyMetric.label || 'Цель';
  const defaultKeyValue = defaultKeyMetric.text || '—';
  const defaultCostLabel = defaultCostMetric.label || kpiMeta.label || 'Стоимость цели';
  const defaultCostValue = defaultCostMetric.text || '—';
  const datasetJson = escapeHtml(JSON.stringify(dataset));
  const periodOrder = ['today', 'yesterday', 'week', 'month', 'year'];
  const periodTabs = periodOrder
    .filter((id) => dataset.periods[id])
    .map((id) => {
      const label = dataset.periods[id]?.label || formatReportPresetLabel(id);
      const activeClass = id === dataset.defaultPeriod ? ' active' : '';
      return `<button class="period-tab${activeClass}" data-period="${id}">${escapeHtml(label)}</button>`;
    })
    .join('');

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
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 18px;
        margin-bottom: 32px;
      }
      .card {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 16px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.9rem;
        color: #8f9299;
        letter-spacing: 0.03em;
      }
      .card-title {
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 12px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 0.75rem;
        color: #c7cad1;
        letter-spacing: 0.02em;
      }
      .kpi-card {
        gap: 18px;
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }
      .kpi-metric {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .kpi-metric-label {
        font-size: 0.75rem;
        color: #9ba0a9;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .kpi-metric-value {
        font-size: 1.3rem;
        font-weight: 600;
      }
      .kpi-target {
        margin: 0;
        font-size: 0.85rem;
        color: #9ba0a9;
      }
      .status-card {
        gap: 16px;
      }
      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      .status-item {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 14px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 100%;
      }
      .status-title {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ba0a9;
      }
      .status-value {
        font-size: 1.15rem;
        font-weight: 600;
      }
      .status-value--ok {
        color: #8be4a2;
      }
      .status-value--warn {
        color: #ffd27f;
      }
      .status-value--alert {
        color: #ff9aa2;
      }
      .status-meta {
        font-size: 0.85rem;
        color: #c7cad1;
      }
      .status-meta--alert {
        color: #ffb3be;
      }
      .status-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .status-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border-radius: 999px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 0.78rem;
        letter-spacing: 0.03em;
      }
      .status-tag--warning {
        background: rgba(255, 99, 132, 0.18);
        color: #ffb3be;
      }
      .account-card {
        gap: 14px;
      }
      .account-name {
        font-size: 1.2rem;
        font-weight: 600;
      }
      .account-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: #c7cad1;
        font-size: 0.9rem;
      }
      .account-meta-item {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .account-meta-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #9ba0a9;
      }
      .account-meta-item code {
        background: rgba(255, 255, 255, 0.08);
        padding: 2px 8px;
        border-radius: 8px;
        font-size: 0.85rem;
      }
      .account-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .secondary-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.05);
        color: inherit;
        text-decoration: none;
        font-weight: 500;
        letter-spacing: 0.02em;
        transition: background 0.2s ease, border-color 0.2s ease;
      }
      .secondary-button:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.24);
      }
      .summary {
        margin-bottom: 36px;
      }
      .section-title {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0 0 12px;
      }
      .period-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .period-tab {
        border: none;
        border-radius: 999px;
        padding: 8px 18px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .period-tab.active {
        background: linear-gradient(135deg, #3772ff, #4a9bff);
      }
      .period-tab:hover {
        background: rgba(74, 155, 255, 0.25);
      }
      .period-range {
        font-size: 0.9rem;
        color: #c7cad1;
        margin-bottom: 16px;
      }
      .period-error {
        padding: 12px 16px;
        border-radius: 12px;
        background: rgba(255, 99, 132, 0.15);
        color: #ffb3be;
        margin-bottom: 16px;
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .metrics-empty {
        color: #8f9299;
        font-size: 0.95rem;
      }
      .metric-card {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .metric-label {
        font-size: 0.8rem;
        color: #8f9299;
        letter-spacing: 0.03em;
      }
      .metric-card strong {
        font-size: 1.15rem;
        font-weight: 600;
      }
      .campaigns {
        margin-bottom: 36px;
      }
      .campaign-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .campaign-filters,
      .campaign-sorts {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .filter-button,
      .sort-button {
        border: none;
        border-radius: 999px;
        padding: 8px 16px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s ease;
      }
      .filter-button.active,
      .sort-button.active {
        background: rgba(74, 155, 255, 0.3);
      }
      .filter-button:hover,
      .sort-button:hover {
        background: rgba(74, 155, 255, 0.2);
      }
      .campaign-row {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 16px;
        padding: 14px 16px;
        margin-bottom: 10px;
        transition: background 0.2s ease;
      }
      .campaign-row:hover {
        background: rgba(255, 255, 255, 0.07);
      }
      .campaign-line {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      .campaign-status {
        font-size: 1.1rem;
      }
      .campaign-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: #c7cad1;
        font-size: 0.9rem;
      }
      .campaign-metrics span {
        display: inline-block;
      }
      .campaign-empty {
        color: #8f9299;
        font-size: 0.95rem;
        margin-top: 8px;
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
      .feedback {
        margin-top: 36px;
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
      footer {
        margin-top: 40px;
        font-size: 0.8rem;
        color: #6f7279;
      }
      @media (max-width: 640px) {
        header {
          flex-direction: column;
          align-items: flex-start;
        }
        .campaign-toolbar {
          flex-direction: column;
          align-items: flex-start;
        }
        .campaign-metrics {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${projectName}</h1>
        ${projectCodeTag}
      </header>
      <section class="cards">
        <div class="card kpi-card">
          <div class="card-head">
            <span class="card-title">Главные показатели</span>
            <span class="badge" id="updated-at">Обновлено ${escapeHtml(updatedLabel)}</span>
          </div>
          <div class="kpi-grid">
            <div class="kpi-metric">
              <span class="kpi-metric-label">Расход</span>
              <span class="kpi-metric-value" id="overview-spend">${escapeHtml(defaultSpendText)}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-label" id="overview-key-label" data-default-label="${escapeHtml(defaultKeyLabel)}">${escapeHtml(defaultKeyLabel)}</span>
              <span class="kpi-metric-value" id="overview-key-value">${escapeHtml(defaultKeyValue)}</span>
            </div>
            <div class="kpi-metric">
              <span class="kpi-metric-label" id="overview-cost-label" data-default-label="${escapeHtml(defaultCostLabel)}">${escapeHtml(defaultCostLabel)}</span>
              <span class="kpi-metric-value" id="overview-cost-value">${escapeHtml(defaultCostValue)}</span>
            </div>
          </div>
          ${
            Number.isFinite(kpiMeta.target)
              ? `<p class="kpi-target">Цель KPI: ${escapeHtml(
                  formatUsd(kpiMeta.target, { digitsBelowOne: 2, digitsAboveOne: 2 }),
                )}</p>`
              : ''
          }
        </div>
        <div class="card status-card">
          <div class="card-head">
            <span class="card-title">Оплата и статус</span>
          </div>
          <div class="status-grid">
            <div class="status-item">
              <span class="status-title">Статус Meta</span>
              <span class="status-value ${statusToneClass}">${statusEmoji} ${escapeHtml(accountStatusLabel || '—')}</span>
              ${
                billingCountdown.label && billingCountdown.label !== '—'
                  ? `<span class="status-meta">До оплаты: ${escapeHtml(billingCountdown.label)}</span>`
                  : ''
              }
              ${
                paymentIssuesText
                  ? `<span class="status-meta status-meta--alert">${escapeHtml(paymentIssuesText)}</span>`
                  : ''
              }
            </div>
            <div class="status-item">
              <span class="status-title">Следующая оплата</span>
              <span class="status-value">${billingText}</span>
              ${paymentTagMarkup}
            </div>
            <div class="status-item">
              <span class="status-title">Обновлено</span>
              <span class="status-value" id="updated-at">${escapeHtml(updatedLabel)}</span>
              ${timezoneLabel ? `<span class="status-meta">Часовой пояс: ${escapeHtml(timezoneLabel)}</span>` : ''}
            </div>
          </div>
        </div>
        ${accountCardMarkup}
      </section>
      <section class="summary">
        <h2 class="section-title">Показатели</h2>
        <div class="period-tabs" role="tablist">${periodTabs}</div>
        <div class="period-range" id="period-range"></div>
        <div class="period-error" id="period-error" hidden></div>
        <div class="metrics-grid" id="metrics-grid"></div>
      </section>
      <section class="campaigns">
        <div class="campaign-toolbar">
          <div class="campaign-filters">
            <button class="filter-button active" data-filter="active">🟢 Активные</button>
            <button class="filter-button" data-filter="completed">⚪ Завершённые</button>
            <button class="filter-button" data-filter="all">⚫ Все</button>
          </div>
          <div class="campaign-sorts">
            <button class="sort-button active" data-sort="spend" data-label="Потрачено">🔽 Потрачено</button>
            <button class="sort-button" data-sort="leads" data-label="Лиды">🔽 Лиды</button>
            <button class="sort-button" data-sort="cpa" data-label="Стоимость цели">🔽 Стоимость цели</button>
          </div>
        </div>
        <div class="campaign-list" id="campaign-list"></div>
        <div class="campaign-empty" id="campaign-empty" hidden>Нет активных кампаний за выбранный период.</div>
      </section>
      <section>
        <h2 class="section-title">Краткие выводы</h2>
        ${insightsBlock}
      </section>
      ${feedbackSection}
      ${managerButton}
      <footer>Portal powered by Targetbot · Таймзона: ${escapeHtml(timezone || snapshot?.timezone || DEFAULT_TIMEZONE_FALLBACK)}</footer>
    </main>
    <script type="application/json" id="portal-preload">${datasetJson}</script>
    <script>
      (() => {
        const preload = document.getElementById('portal-preload');
        if (!preload) {
          return;
        }
        let data = {};
        try {
          data = JSON.parse(preload.textContent || '{}');
        } catch (error) {
          console.error('Portal preload parse error', error);
        }
        const state = {
          projectCode: data.projectCode || '',
          signature: data.signature || '',
          timezone: data.timezone || '',
          periods: data.periods || {},
          defaultPeriod: data.defaultPeriod || 'today',
          selectedPeriod: null,
          filter: 'active',
          sortKey: 'spend',
          sortDir: 'desc',
          fetching: new Set(),
        };

        const periodButtons = Array.from(document.querySelectorAll('[data-period]'));
        const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
        const sortButtons = Array.from(document.querySelectorAll('[data-sort]'));
        const metricsGrid = document.getElementById('metrics-grid');
        const periodRange = document.getElementById('period-range');
        const periodError = document.getElementById('period-error');
        const campaignList = document.getElementById('campaign-list');
        const campaignEmpty = document.getElementById('campaign-empty');
        const overviewSpend = document.getElementById('overview-spend');
        const overviewKeyLabel = document.getElementById('overview-key-label');
        const overviewKeyValue = document.getElementById('overview-key-value');
        const overviewCostLabel = document.getElementById('overview-cost-label');
        const overviewCostValue = document.getElementById('overview-cost-value');
        const overviewDefaults = {
          keyLabel: overviewKeyLabel ? overviewKeyLabel.dataset.defaultLabel || 'Цель' : 'Цель',
          costLabel: overviewCostLabel ? overviewCostLabel.dataset.defaultLabel || 'Стоимость цели' : 'Стоимость цели',
        };
        const overviewMetricIds = new Set(['spend', 'key_metric', 'kpi']);
        const sortLabels = new Map(sortButtons.map((btn) => [btn.dataset.sort, btn.dataset.label || btn.textContent.trim()]));

        const escapeText = (value) =>
          String(value ?? '').replace(
            /[&<>"']/g,
            (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]),
          );

        const setActive = (buttons, target, attr) => {
          buttons.forEach((btn) => {
            if (btn.dataset[attr] === target) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        };

        const updateSortButtons = () => {
          sortButtons.forEach((btn) => {
            const key = btn.dataset.sort;
            const label = sortLabels.get(key) || btn.textContent.trim();
            if (key === state.sortKey) {
              btn.classList.add('active');
              btn.dataset.dir = state.sortDir;
              btn.textContent = (state.sortDir === 'asc' ? '🔼' : '🔽') + ' ' + label;
            } else {
              btn.classList.remove('active');
              btn.dataset.dir = 'desc';
              btn.textContent = '🔽 ' + label;
            }
          });
        };

        const updateOverview = (period) => {
          const metrics = Array.isArray(period?.metrics) ? period.metrics : [];
          const findMetric = (id) => metrics.find((item) => item && item.id === id) || null;
          const spend = findMetric('spend');
          const key = findMetric('key_metric');
          const cost = findMetric('kpi');
          if (overviewSpend) {
            overviewSpend.textContent = spend?.text || '—';
          }
          if (overviewKeyLabel) {
            overviewKeyLabel.textContent = key?.label || overviewDefaults.keyLabel;
          }
          if (overviewKeyValue) {
            overviewKeyValue.textContent = key?.text || '—';
          }
          if (overviewCostLabel) {
            overviewCostLabel.textContent = cost?.label || overviewDefaults.costLabel;
          }
          if (overviewCostValue) {
            overviewCostValue.textContent = cost?.text || '—';
          }
        };

        const renderMetrics = (period) => {
          if (!metricsGrid) {
            return;
          }
          const metrics = Array.isArray(period.metrics)
            ? period.metrics.filter((metric) => metric && !overviewMetricIds.has(metric.id))
            : [];
          if (metrics.length === 0) {
            metricsGrid.innerHTML = '<div class="metrics-empty">Нет дополнительных показателей для выбранного периода.</div>';
            return;
          }
          metricsGrid.innerHTML = metrics
            .map((metric) => {
              return (
                '<div class="metric-card">' +
                '<span class="metric-label">' +
                escapeText(metric.label || '') +
                '</span>' +
                '<strong>' +
                escapeText(metric.text || '—') +
                '</strong>' +
                '</div>'
              );
            })
            .join('');
        };

        const renderCampaigns = (period) => {
          const campaigns = Array.isArray(period.campaigns) ? period.campaigns.slice() : [];
          let filtered = campaigns;
          if (state.filter === 'active') {
            filtered = campaigns.filter((item) => item.statusCategory === 'active');
          } else if (state.filter === 'completed') {
            filtered = campaigns.filter((item) => item.statusCategory === 'completed');
          }
          const valueKey =
            state.sortKey === 'leads'
              ? 'keyMetricValue'
              : state.sortKey === 'cpa'
              ? 'costValue'
              : state.sortKey + 'Value';
          const dir = state.sortDir === 'asc' ? 1 : -1;
          filtered.sort((a, b) => {
            const aValue = Number.isFinite(a[valueKey]) ? Number(a[valueKey]) : -Infinity;
            const bValue = Number.isFinite(b[valueKey]) ? Number(b[valueKey]) : -Infinity;
            if (aValue === bValue) {
              return a.name.localeCompare(b.name);
            }
            return aValue > bValue ? dir : -dir;
          });

          if (filtered.length === 0) {
            campaignList.innerHTML = '';
            campaignEmpty.removeAttribute('hidden');
            return;
          }

          campaignEmpty.setAttribute('hidden', 'hidden');
          campaignList.innerHTML = filtered
            .map((item) => {
              return (
                '<div class="campaign-row" data-status="' +
                escapeText(item.statusCategory || '') +
                '">' +
                '<div class="campaign-line">' +
                '<span class="campaign-status">' +
                escapeText(item.statusIcon || '⚪') +
                '</span>' +
                '<span class="campaign-name">' +
                escapeText(item.name || '') +
                '</span>' +
                '</div>' +
                '<div class="campaign-metrics">' +
                '<span>' +
                escapeText(item.keyMetricLabel || '') +
                ': ' +
                escapeText(item.keyMetricText || '—') +
                '</span>' +
                '<span>Потрачено: ' +
                escapeText(item.spendText || '—') +
                '</span>' +
                '<span>' +
                escapeText(item.costLabel || 'CPA') +
                ': ' +
                escapeText(item.costText || item.cpaText || '—') +
                '</span>' +
                '<span>CPC: ' +
                escapeText(item.cpcText || '—') +
                '</span>' +
                '<span>CTR: ' +
                escapeText(item.ctrText || '—') +
                '</span>' +
                '</div>' +
                '</div>'
              );
            })
            .join('');
        };

        const render = () => {
          const periodId = state.selectedPeriod || state.defaultPeriod;
          const period = state.periods[periodId];
          if (!period) {
            return;
          }
          setActive(periodButtons, periodId, 'period');
          setActive(filterButtons, state.filter, 'filter');
          updateSortButtons();
          updateOverview(period);
          periodRange.textContent = period.rangeLabel || '';
          if (period.error) {
            periodError.textContent = '⚠ ' + period.error;
            periodError.removeAttribute('hidden');
          } else {
            periodError.setAttribute('hidden', 'hidden');
            periodError.textContent = '';
          }
          renderMetrics(period);
          renderCampaigns(period);
        };

        const fetchPeriod = (periodId, { force = false } = {}) => {
          if (!state.projectCode || !state.signature) {
            return;
          }
          const existing = state.periods[periodId];
          if (!force && existing && !existing.error && existing.fresh) {
            return;
          }
          if (state.fetching.has(periodId)) {
            return;
          }
          state.fetching.add(periodId);
          const params = new URLSearchParams({
            code: state.projectCode,
            period: periodId,
            sig: state.signature,
          });
          fetch('/api/meta/status?' + params.toString())
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error('http_error'))))
            .then((body) => {
              if (body && body.ok && body.period) {
                state.periods[periodId] = { ...body.period, fresh: true };
                if (state.selectedPeriod === periodId) {
                  render();
                }
              }
            })
            .catch((error) => {
              console.warn('Failed to refresh period', periodId, error);
            })
            .finally(() => {
              state.fetching.delete(periodId);
            });
        };

        periodButtons.forEach((btn) => {
          btn.addEventListener('click', () => {
            const periodId = btn.dataset.period;
            if (!periodId || periodId === state.selectedPeriod) {
              return;
            }
            state.selectedPeriod = periodId;
            render();
            fetchPeriod(periodId);
          });
        });

        filterButtons.forEach((btn) => {
          btn.addEventListener('click', () => {
            const value = btn.dataset.filter;
            if (!value) {
              return;
            }
            state.filter = value;
            render();
          });
        });

        sortButtons.forEach((btn) => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.sort;
            if (!key) {
              return;
            }
            if (state.sortKey === key) {
              state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
            } else {
              state.sortKey = key;
              state.sortDir = 'desc';
            }
            render();
          });
        });

        state.selectedPeriod = state.defaultPeriod;
        render();
        fetchPeriod(state.selectedPeriod);
      })();
    </script>
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

async function buildPortalSignature({ code, token } = {}) {
  if (!token) {
    return '';
  }

  const trimmedToken = String(token).trim();
  if (!trimmedToken) {
    return '';
  }

  const base = typeof code === 'string' ? code.trim() : '';
  if (base) {
    const digest = await sha256Hex(`${base}:${trimmedToken}`);
    if (digest) {
      return digest;
    }
  }

  return trimmedToken;
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

const R2_BUCKET_CACHE = new WeakMap();
const R2_FALLBACK_EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const R2_SIGNATURE_ALGORITHM = 'AWS4-HMAC-SHA256';
const R2_SIGNATURE_SERVICE = 's3';
const R2_SIGNATURE_REGION = 'auto';
const R2_TEXT_ENCODER = new TextEncoder();

function getR2Bucket(env) {
  if (!env) return null;
  if (R2_BUCKET_CACHE.has(env)) {
    return R2_BUCKET_CACHE.get(env);
  }

  const bucket = env.R2;
  if (bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function') {
    R2_BUCKET_CACHE.set(env, bucket);
    return bucket;
  }

  const fallback = createHttpR2BucketFromEnv(env);
  R2_BUCKET_CACHE.set(env, fallback);
  return fallback;
}

function createHttpR2BucketFromEnv(env) {
  if (!env || typeof globalThis.fetch !== 'function' || !globalThis.crypto || !globalThis.crypto.subtle) {
    return null;
  }

  const accessKeyId = (env.R2_ACCESS_KEY_ID || env.CF_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || env.CF_R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (env.R2_BUCKET_NAME || env.R2_BUCKET || '').trim();
  const accountId = (env.R2_ACCOUNT_ID || '').trim();
  let endpoint = (env.R2_ENDPOINT || '').trim();

  if (!accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }

  if (!endpoint) {
    if (!accountId) {
      return null;
    }
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  } else if (!/^https?:\/\//i.test(endpoint)) {
    endpoint = `https://${endpoint}`;
  }

  let baseUrl;
  try {
    baseUrl = new URL(endpoint);
  } catch (error) {
    console.warn('Failed to parse R2 endpoint', endpoint, error);
    return null;
  }

  const fetcher = typeof env.fetch === 'function' ? env.fetch.bind(env) : globalThis.fetch;

  return new HttpR2Bucket({
    baseUrl,
    bucketName,
    accessKeyId,
    secretAccessKey,
    fetcher,
  });
}

function encodeR2PathSegment(segment = '') {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildR2CanonicalQuery(url) {
  const entries = [];
  url.searchParams.forEach((value, key) => {
    entries.push([encodeR2PathSegment(key), encodeR2PathSegment(value)]);
  });
  entries.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
    }
    return a[0] < b[0] ? -1 : 1;
  });
  return entries.map((entry) => `${entry[0]}=${entry[1]}`).join('&');
}

function canonicalizeHeaders(headers, extras = []) {
  const pairs = [];
  const append = (key, value) => {
    if (value === undefined || value === null) {
      return;
    }
    const trimmed = String(value).trim().replace(/\s+/g, ' ');
    if (!key) {
      return;
    }
    pairs.push([String(key).toLowerCase(), trimmed]);
  };

  headers.forEach((value, key) => {
    append(key, value);
  });

  if (Array.isArray(extras)) {
    for (const entry of extras) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const [key, value] = entry;
      append(key, value);
    }
  }

  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonical = pairs.map(([key, value]) => `${key}:${value}\n`).join('');
  const signed = pairs.map(([key]) => key).join(';');
  return { canonical, signed };
}

function formatAmzDate(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return {
    amzDate: `${year}${month}${day}T${hour}${minute}${second}Z`,
    dateStamp: `${year}${month}${day}`,
  };
}

async function hmacSha256(key, data) {
  const rawKey = typeof key === 'string' ? R2_TEXT_ENCODER.encode(key) : key;
  const message = typeof data === 'string' ? R2_TEXT_ENCODER.encode(data) : data;
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

function toHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveSigningKey(secret, dateStamp) {
  const kDate = await hmacSha256(`AWS4${secret}`, dateStamp);
  const kRegion = await hmacSha256(kDate, R2_SIGNATURE_REGION);
  const kService = await hmacSha256(kRegion, R2_SIGNATURE_SERVICE);
  return hmacSha256(kService, 'aws4_request');
}

function decodeR2Xml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

class HttpR2Object {
  constructor(response) {
    this._response = response;
  }

  async text() {
    return this._response.text();
  }
}

class HttpR2Bucket {
  constructor({ baseUrl, bucketName, accessKeyId, secretAccessKey, fetcher }) {
    this.baseUrl = baseUrl;
    this.bucketName = bucketName;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.fetcher = typeof fetcher === 'function' ? fetcher : globalThis.fetch;
    this.basePath = `${baseUrl.pathname.replace(/\/+$, '')}/${bucketName}`;
    this.signingKeyCache = null;
  }

  async ensureSigningKey(dateStamp) {
    if (this.signingKeyCache && this.signingKeyCache.date === dateStamp) {
      return this.signingKeyCache.key;
    }
    const key = await deriveSigningKey(this.secretAccessKey, dateStamp);
    this.signingKeyCache = { date: dateStamp, key };
    return key;
  }

  buildUrl(key, params) {
    const url = new URL(this.baseUrl.toString());
    const encodedKey = key
      ? key
          .split('/')
          .map((segment) => encodeR2PathSegment(segment))
          .join('/')
      : '';
    const pathSuffix = encodedKey ? `/${encodedKey}` : '';
    url.pathname = `${this.basePath}${pathSuffix}`;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
          continue;
        }
        url.searchParams.set(name, String(value));
      }
    }
    return { url, canonicalUri: url.pathname };
  }

  async signedRequest(method, key, { body = '', headers = {}, params } = {}) {
    const payload = typeof body === 'string' ? body : '';
    const { url, canonicalUri } = this.buildUrl(key, params);
    const headerBag = new Headers(headers);
    const payloadHash = payload ? await sha256Hex(payload) : R2_FALLBACK_EMPTY_HASH;
    headerBag.set('x-amz-content-sha256', payloadHash);
    const { amzDate, dateStamp } = formatAmzDate();
    headerBag.set('x-amz-date', amzDate);
    const { canonical, signed } = canonicalizeHeaders(headerBag, [['host', url.host]]);
    const canonicalQuery = buildR2CanonicalQuery(url);
    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      canonicalQuery,
      canonical,
      signed,
      payloadHash,
    ].join('\n');
    const hashedRequest = await sha256Hex(canonicalRequest);
    const credentialScope = `${dateStamp}/${R2_SIGNATURE_REGION}/${R2_SIGNATURE_SERVICE}/aws4_request`;
    const stringToSign = [R2_SIGNATURE_ALGORITHM, amzDate, credentialScope, hashedRequest].join('\n');
    const signingKey = await this.ensureSigningKey(dateStamp);
    const signature = await hmacSha256(signingKey, stringToSign);
    headerBag.set(
      'Authorization',
      `${R2_SIGNATURE_ALGORITHM} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signed}, Signature=${toHex(
        signature,
      )}`,
    );

    const init = {
      method,
      headers: headerBag,
    };
    if (payload && method !== 'GET' && method !== 'HEAD') {
      init.body = payload;
    }
    return this.fetcher(url.toString(), init);
  }

  async get(key) {
    const response = await this.signedRequest('GET', key);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`R2 HTTP GET failed: ${response.status}`);
    }
    return new HttpR2Object(response);
  }

  async put(key, value, { httpMetadata = {} } = {}) {
    const headers = {};
    if (httpMetadata.contentType) {
      headers['content-type'] = httpMetadata.contentType;
    }
    const response = await this.signedRequest('PUT', key, { body: String(value ?? ''), headers });
    if (!response.ok) {
      throw new Error(`R2 HTTP PUT failed: ${response.status}`);
    }
    return true;
  }

  async delete(key) {
    const response = await this.signedRequest('DELETE', key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 HTTP DELETE failed: ${response.status}`);
    }
    return true;
  }

  async list({ prefix = '', limit = 1000 } = {}) {
    const params = {
      'list-type': '2',
      prefix,
      'max-keys': Math.max(1, Math.min(Number(limit) || 1000, 1000)),
    };
    const response = await this.signedRequest('GET', '', { params });
    if (!response.ok) {
      throw new Error(`R2 HTTP LIST failed: ${response.status}`);
    }
    const text = await response.text();
    const objects = [];
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match;
    while ((match = keyRegex.exec(text))) {
      objects.push({ key: decodeR2Xml(match[1]) });
    }
    return { objects };
  }
}

function encodeR2Segment(segment) {
  return encodeURIComponent(String(segment ?? ''));
}

function decodeR2Segment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    console.warn('Failed to decode R2 segment', segment, error);
    return segment;
  }
}

function buildR2PrimaryKey(bindingName, key) {
  const safeBinding = encodeR2Segment(bindingName || 'db');
  const safeKey = encodeR2Segment(key || '');
  return `data/${safeBinding}/${safeKey}.json`;
}

function buildR2Prefix(bindingName, prefix = '') {
  const safeBinding = encodeR2Segment(bindingName || 'db');
  const safePrefix = encodeR2Segment(prefix || '');
  return `data/${safeBinding}/${safePrefix}`;
}

function extractR2Key(bindingName, objectKey) {
  const base = `data/${encodeR2Segment(bindingName || 'db')}/`;
  if (!objectKey || !objectKey.startsWith(base)) {
    return null;
  }
  const tail = objectKey.slice(base.length);
  if (!tail.endsWith('.json')) {
    return null;
  }
  const encoded = tail.slice(0, -5);
  return decodeR2Segment(encoded);
}

function resolveR2AliasForKey(bindingName, key) {
  if (bindingName === 'DB' && typeof key === 'string' && key.startsWith(PROJECT_KEY_PREFIX)) {
    const projectId = key.slice(PROJECT_KEY_PREFIX.length);
    if (projectId) {
      const safeProject = encodeR2Segment(projectId);
      return `reports/${safeProject}.json`;
    }
  }
  return null;
}

function shouldUseKvOnly(bindingName, key) {
  if (bindingName !== 'DB') {
    return false;
  }
  if (!key) {
    return false;
  }

  return (
    String(key).startsWith('session:') ||
    String(key).startsWith(ADMIN_SESSION_KEY_PREFIX) ||
    String(key).startsWith(META_OAUTH_STATE_PREFIX) ||
    String(key).startsWith(META_OAUTH_SESSION_PREFIX) ||
    String(key) === META_TOKEN_KEY ||
    String(key) === META_TOKEN_FALLBACK_KEY
  );
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
    this.cache = new Map();
    this.bucket = getR2Bucket(env);
  }

  namespace(name) {
    return resolveKv(this.env, name);
  }

  async readR2Envelope(bindingName, key) {
    const bucket = this.bucket;
    if (!bucket) return null;
    const objectKey = buildR2PrimaryKey(bindingName, key);
    try {
      const object = await bucket.get(objectKey);
      if (!object) return null;
      const text = await object.text();
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === 'object' && parsed.data !== undefined) {
        return parsed;
      }
      if (parsed && typeof parsed === 'object') {
        return { updated_at: parsed.updated_at || parsed.updatedAt || null, data: parsed, meta: { binding: bindingName, key } };
      }
      return { updated_at: null, data: parsed, meta: { binding: bindingName, key } };
    } catch (error) {
      console.warn('R2 get failed', objectKey, error);
      throw error;
    }
  }

  async writeR2Envelope(bindingName, key, value, { meta = {} } = {}) {
    const bucket = this.bucket;
    if (!bucket) {
      throw new Error('R2 bucket unavailable');
    }
    const now = new Date().toISOString();
    const updatedAt =
      (value && typeof value === 'object' && (value.updatedAt || value.updated_at)) || meta.updated_at || now;
    const envelope = {
      updated_at: updatedAt,
      data: value,
      meta: { ...meta, binding: bindingName, key, fallback: false, stored_at: now },
    };
    const objectKey = buildR2PrimaryKey(bindingName, key);
    const payload = JSON.stringify(envelope);
    await bucket.put(objectKey, payload, {
      httpMetadata: { contentType: 'application/json' },
    });
    const alias = resolveR2AliasForKey(bindingName, key);
    if (alias) {
      await bucket.put(alias, payload, { httpMetadata: { contentType: 'application/json' } }).catch((error) => {
        console.warn('Failed to write alias to R2', alias, error);
      });
    }
    return envelope;
  }

  async deleteR2(bindingName, key) {
    const bucket = this.bucket;
    if (!bucket) return false;
    const objectKey = buildR2PrimaryKey(bindingName, key);
    await bucket.delete(objectKey).catch((error) => {
      console.warn('Failed to delete R2 object', objectKey, error);
    });
    const alias = resolveR2AliasForKey(bindingName, key);
    if (alias) {
      await bucket.delete(alias).catch((error) => {
        console.warn('Failed to delete R2 alias', alias, error);
      });
    }
    return true;
  }

  async getJson(bindingName, key) {
    const cacheKey = `${bindingName}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const kvOnly = shouldUseKvOnly(bindingName, key);
    if (!kvOnly && this.bucket) {
      try {
        const envelope = await this.readR2Envelope(bindingName, key);
        if (envelope) {
          const value = envelope.data;
          this.cache.set(cacheKey, value);
          return value;
        }
      } catch (error) {
        console.warn('Falling back to KV after R2 read failure', error);
      }
    }

    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.get !== 'function') return null;
    const raw = await namespace.get(key);
    const parsed = safeJsonParse(raw);
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  async putJson(bindingName, key, value, options = {}) {
    const cacheKey = `${bindingName}:${key}`;
    const kvOnly = shouldUseKvOnly(bindingName, key);

    if (!kvOnly && this.bucket) {
      try {
        await this.writeR2Envelope(bindingName, key, value, { meta: options.meta || {} });
        this.cache.set(cacheKey, value);
        if (!options.skipKvCleanup) {
          const namespace = this.namespace(bindingName);
          if (namespace && typeof namespace.delete === 'function') {
            await namespace.delete(key).catch(() => {});
          }
        }
        return true;
      } catch (error) {
        console.warn('R2 put failed, using KV fallback', error);
      }
    }

    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.put !== 'function') return false;
    const now = new Date().toISOString();
    let payload = value;
    if (!kvOnly && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      payload = { ...payload, _fallback: true, _fallback_at: now };
    }
    await namespace.put(key, JSON.stringify(payload), options);
    this.cache.set(cacheKey, value);
    return true;
  }

  async deleteKey(bindingName, key) {
    const cacheKey = `${bindingName}:${key}`;
    const kvOnly = shouldUseKvOnly(bindingName, key);
    let deleted = false;

    if (!kvOnly && this.bucket) {
      try {
        await this.deleteR2(bindingName, key);
        deleted = true;
      } catch (error) {
        console.warn('Failed to delete key from R2', error);
      }
    }

    const namespace = this.namespace(bindingName);
    if (namespace && typeof namespace.delete === 'function') {
      try {
        await namespace.delete(key);
        deleted = true;
      } catch (error) {
        console.warn('Failed to delete key from KV', error);
      }
    }

    this.cache.delete(cacheKey);
    return deleted;
  }

  async listKeys(bindingName, prefix, limit = 100) {
    const kvOnly = shouldUseKvOnly(bindingName, prefix || '');
    if (!kvOnly && this.bucket) {
      try {
        const r2Prefix = buildR2Prefix(bindingName, prefix || '');
        const result = await this.bucket.list({ prefix: r2Prefix, limit });
        if (result && Array.isArray(result.objects)) {
          const keys = [];
          for (const obj of result.objects) {
            const key = extractR2Key(bindingName, obj.key);
            if (key) {
              keys.push(key);
            }
          }
          if (keys.length > 0) {
            return keys;
          }
        }
      } catch (error) {
        console.warn('R2 list failed, falling back to KV', error);
      }
    }

    const namespace = this.namespace(bindingName);
    if (!namespace || typeof namespace.list !== 'function') return [];
    const result = await namespace.list({ prefix, limit });
    if (!result || !Array.isArray(result.keys)) return [];
    return result.keys.map((item) => item.name).filter(Boolean);
  }

  async readR2Object(objectKey) {
    const bucket = this.bucket;
    if (!bucket) return null;
    try {
      const object = await bucket.get(objectKey);
      if (!object) return null;
      const text = await object.text();
      return safeJsonParse(text);
    } catch (error) {
      console.warn('Failed to read raw R2 object', objectKey, error);
      throw error;
    }
  }

  async writeR2Object(objectKey, value, { meta = {} } = {}) {
    const bucket = this.bucket;
    if (!bucket) {
      throw new Error('R2 bucket unavailable');
    }
    const now = new Date().toISOString();
    const payload = {
      updated_at: now,
      data: value,
      meta: { ...meta, stored_at: now },
    };
    await bucket.put(objectKey, JSON.stringify(payload), {
      httpMetadata: { contentType: 'application/json' },
    });
    return payload;
  }

  async appendTelegramLog(entry, { limit = TELEGRAM_LOG_LIMIT } = {}) {
    const now = new Date().toISOString();
    const record = { ts: now, ...entry };
    const key = 'logs/telegram.json';

    if (this.bucket) {
      try {
        const existing = await this.readR2Object(key);
        let list = [];
        if (existing && typeof existing === 'object') {
          if (Array.isArray(existing.data)) {
            list = existing.data;
          } else if (Array.isArray(existing)) {
            list = existing;
          }
        }
        list.push(record);
        if (list.length > limit) {
          list = list.slice(list.length - limit);
        }
        await this.writeR2Object(key, list, { meta: { kind: 'telegram-log', limit } });
        return;
      } catch (error) {
        console.warn('Failed to append telegram log in R2', error);
      }
    }

    const namespace = this.namespace('DB');
    if (!namespace || typeof namespace.get !== 'function' || typeof namespace.put !== 'function') {
      return;
    }
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
    await namespace.put(
      TELEGRAM_LOG_KEY,
      JSON.stringify({ _fallback: true, updated_at: now, items: list }),
    );
  }

  async readTelegramLog(limit = 10) {
    const key = 'logs/telegram.json';
    if (this.bucket) {
      try {
        const existing = await this.readR2Object(key);
        let list = [];
        if (existing && typeof existing === 'object') {
          if (Array.isArray(existing.data)) {
            list = existing.data;
          } else if (Array.isArray(existing)) {
            list = existing;
          } else if (Array.isArray(existing.items)) {
            list = existing.items;
          }
        }
        if (list.length > 0) {
          return list.slice(Math.max(list.length - limit, 0));
        }
      } catch (error) {
        console.warn('Failed to read telegram log from R2', error);
      }
    }

    const namespace = this.namespace('DB');
    if (!namespace || typeof namespace.get !== 'function') return [];
    const raw = await namespace.get(TELEGRAM_LOG_KEY);
    const parsed = safeJsonParse(raw);
    if (Array.isArray(parsed?.items)) {
      return parsed.items.slice(Math.max(parsed.items.length - limit, 0));
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(Math.max(parsed.length - limit, 0));
  }

  async readMetaStatus() {
    const data = await this.getJson('DB', META_STATUS_KEY);
    return pickMetaStatus(data);
  }

  async readMetaAccountSnapshot() {
    const snapshot = await this.getJson('DB', META_ACCOUNT_SNAPSHOT_KEY);
    if (!snapshot || typeof snapshot !== 'object') {
      return { updatedAt: null, accounts: [], stale: false, error: null };
    }
    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    return {
      updatedAt: snapshot.updatedAt || snapshot.updated_at || null,
      accounts,
      stale: Boolean(snapshot.stale),
      error: snapshot.error || null,
    };
  }

  async logError(entry = {}) {
    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10) || 'unknown';
    const record = { ts: iso, ...entry };
    const key = `logs/${day}.json`;

    if (this.bucket) {
      try {
        const existing = await this.readR2Object(key);
        let list = [];
        if (existing && typeof existing === 'object') {
          if (Array.isArray(existing.data)) {
            list = existing.data;
          } else if (Array.isArray(existing)) {
            list = existing;
          }
        }
        list.push(record);
        if (list.length > 500) {
          list = list.slice(list.length - 500);
        }
        await this.writeR2Object(key, list, { meta: { kind: 'error-log', entries: list.length } });
        return true;
      } catch (error) {
        console.error('Failed to write error log to R2', error);
      }
    }

    const namespace = this.namespace('DB');
    if (!namespace || typeof namespace.put !== 'function') {
      return false;
    }
    const fallback = JSON.stringify({
      _fallback: true,
      stored_at: iso,
      entry: record,
    });
    await namespace.put(`log:fallback:${day}:${crypto.randomUUID?.() ?? Date.now()}`, fallback, {
      expirationTtl: 7 * 24 * 60 * 60,
    });
    return true;
  }
}

class MetaClient {
  constructor({ accessToken, version = META_DEFAULT_GRAPH_VERSION, timeoutMs = 10000, fetcher = fetch } = {}) {
    this.accessToken = typeof accessToken === 'string' ? accessToken.trim() : '';
    this.version = version || META_DEFAULT_GRAPH_VERSION;
    this.timeoutMs = timeoutMs;
    const globalFetcher = typeof fetch === 'function' ? fetch.bind(globalThis) : null;
    if (typeof fetcher === 'function') {
      if (globalFetcher && (fetcher === fetch || fetcher === globalThis.fetch)) {
        this.fetcher = globalFetcher;
      } else {
        this.fetcher = fetcher;
      }
    } else if (fetcher && typeof fetcher.fetch === 'function') {
      this.fetcher = fetcher.fetch.bind(fetcher);
    } else {
      this.fetcher = globalFetcher;
    }
    this.fallbackFetch = globalFetcher;
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

    const fetcher = this.fetcher || this.fallbackFetch;
    if (typeof fetcher !== 'function') {
      throw new Error('Fetch API недоступен');
    }

    let response;
    try {
      response = await fetcher(url.toString(), init);
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
    } catch (error) {
      const message = error?.message || '';
      const illegalInvocation = /Illegal invocation/i.test(message);
      if (illegalInvocation && this.fallbackFetch && fetcher !== this.fallbackFetch) {
        const retry = await this.fallbackFetch(url.toString(), init);
        const retryText = await retry.text();
        const retryData = retryText ? safeJsonParse(retryText) ?? retryText : null;

        if (!retry.ok) {
          const description =
            retryData?.error?.message || retryData?.message || retryText || `HTTP ${retry.status}`;
          const retryError = new Error(description);
          retryError.code = retryData?.error?.code;
          throw retryError;
        }

        if (retryData && typeof retryData === 'object' && retryData.error) {
          const retryError = new Error(retryData.error?.message || 'Meta API error');
          retryError.code = retryData.error?.code;
          throw retryError;
        }

        return retryData;
      }

      throw error;
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
      for (const key of [META_TOKEN_KEY, META_TOKEN_FALLBACK_KEY]) {
        try {
          const raw = await namespace.get(key);
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
          console.warn(`Failed to read meta token from KV (${key})`, error);
        }
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
      await this.persistAccountDiagnostics(status, { updatedAt: now, stale: true, error: status.facebook.error });
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
      await this.persistAccountDiagnostics(status, { updatedAt: now, stale: false });
      return { status, source: 'live', refreshed: true, stale: false, error: null };
    } catch (error) {
      console.error('Meta overview refresh failed', error);
      const previous = await this.storage.readMetaStatus();
      const fallback = this.markStatusStale(previous, {
        updatedAt: now,
        error: error?.message || 'Meta API error',
      });
      await this.storage.putJson('DB', META_STATUS_KEY, fallback);
      await this.persistAccountDiagnostics(fallback, {
        updatedAt: now,
        stale: true,
        error: error?.message || 'Meta API error',
      });
      return { status: fallback, source: 'error', refreshed: false, stale: true, error: fallback.facebook.error };
    }
  }

  async persistAccountDiagnostics(status, { updatedAt, stale = false, error = null } = {}) {
    if (!this.storage || typeof this.storage.putJson !== 'function') {
      return false;
    }

    const snapshot = pickMetaStatus(status) || {};
    const facebook = snapshot.facebook && typeof snapshot.facebook === 'object' ? snapshot.facebook : {};
    const accounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
    const nowDate = parseDateInput(updatedAt) || new Date();

    const diagnostics = accounts.map((account) => {
      if (!account || typeof account !== 'object') {
        return null;
      }

      const accountId = String(account.accountId ?? account.id ?? '').replace(/^act_/, '');
      if (!accountId) {
        return null;
      }

      const billingSource = account.billingNextAt || account.billing_next_at || null;
      const countdown = formatDaysUntil(billingSource, { now: nowDate });
      const issues = [];
      if (Array.isArray(account.paymentIssues)) {
        for (const issue of account.paymentIssues) {
          if (issue) issues.push(String(issue));
        }
      }
      if (account.paymentIssue) {
        issues.push(String(account.paymentIssue));
      }
      if (account.blockReason) {
        issues.push(String(account.blockReason));
      }

      const debt = Number(account.debtUsd ?? account.debt_usd ?? account.balance);
      const spendToday = Number(account.spendTodayUsd ?? account.spend_today_usd);
      const cpaMin = Number(account.cpaMinUsd ?? account.cpa_min_usd ?? account.cpaMin);
      const cpaMax = Number(account.cpaMaxUsd ?? account.cpa_max_usd ?? account.cpaMax);
      const normalizedMin = Number.isFinite(cpaMin) && cpaMin > 0 ? cpaMin : null;
      const normalizedMax = Number.isFinite(cpaMax) && cpaMax > 0 ? cpaMax : null;
      const runningCampaigns = Number(account.runningCampaigns ?? account.activeCampaigns ?? account.campaignsRunning);

      return {
        id: account.id || `act_${accountId}`,
        accountId: `act_${accountId}`,
        name: account.name || account.id || `act_${accountId}`,
        currency: account.currency || null,
        spendTodayUsd: Number.isFinite(spendToday) ? spendToday : null,
        billingNextAt: billingSource,
        billingDueInDays: Number.isFinite(countdown.value) ? countdown.value : null,
        billingDueLabel: account.billingDueLabel || countdown.label || null,
        status: account.paymentStatusLabel || account.statusLabel || account.status || '',
        requiresAttention: Boolean(
          account.requiresAttention || issues.length > 0 || (Number.isFinite(countdown.value) && countdown.value <= 3),
        ),
        issues,
        debtUsd: Number.isFinite(debt) ? debt : null,
        cardLast4:
          account.defaultPaymentMethodLast4 ||
          account.paymentMethodLast4 ||
          account.card_last4 ||
          account.default_card_last4 ||
          null,
        runningCampaigns: Number.isFinite(runningCampaigns) ? runningCampaigns : null,
        cpaMinUsd: normalizedMin,
        cpaMaxUsd: normalizedMax,
        signal: determineAccountSignal(account, { daysUntilDue: countdown }),
        updatedAt: updatedAt || facebook.updatedAt || facebook.updated_at || new Date().toISOString(),
      };
    }).filter(Boolean);

    try {
      await this.storage.putJson('DB', META_ACCOUNT_SNAPSHOT_KEY, {
        updatedAt: updatedAt || facebook.updatedAt || facebook.updated_at || new Date().toISOString(),
        stale: Boolean(stale || facebook.stale),
        error: error || facebook.error || null,
        accountCount: diagnostics.length,
        accounts: diagnostics,
      });
      return true;
    } catch (persistError) {
      console.warn('Failed to persist Meta account diagnostics', persistError);
      return false;
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

    if (!updated.paymentCycle) {
      try {
        const paymentCycle = await this.fetchAdPaymentCycle(client, account.id);
        if (paymentCycle) {
          updated.paymentCycle = paymentCycle;
        }
      } catch (error) {
        console.warn('Failed to load payment cycle', account.id, error);
      }
    }

    if (updated.paymentCycle) {
      const cycle = updated.paymentCycle;
      const last4Candidate =
        cycle.payment_method_last4 ||
        cycle.paymentMethodLast4 ||
        extractLast4Digits(cycle.display_string) ||
        extractLast4Digits(cycle.payment_method);
      if (last4Candidate) {
        updated.defaultPaymentMethodLast4 = String(last4Candidate).slice(-4);
      }

      const billingCandidate =
        cycle.next_payment_date ||
        cycle.next_payment_due_date ||
        cycle.due_date ||
        updated.billingNextAt;
      if (billingCandidate) {
        const billingIso = parseDateInput(billingCandidate)?.toISOString?.() || String(billingCandidate);
        const countdown = formatDaysUntil(billingIso, { now });
        updated.billingNextAt = billingIso;
        updated.billingDueInDays = countdown.value;
        updated.billingDueLabel = countdown.label;
      }

      const threshold = parseMetaCurrency(
        cycle.threshold_amount || cycle.thresholdAmount || cycle.threshold || cycle.billing_threshold,
      );
      if (Number.isFinite(threshold)) {
        updated.paymentThresholdUsd = threshold;
      }
    }

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

      const cpaMinSample = cpaSamples.length ? Math.min(...cpaSamples) : null;
      const cpaMaxSample = cpaSamples.length ? Math.max(...cpaSamples) : null;
      const cpaMin = Number.isFinite(cpaMinSample) && cpaMinSample > 0 ? cpaMinSample : null;
      const cpaMax = Number.isFinite(cpaMaxSample) && cpaMaxSample > 0 ? cpaMaxSample : null;

      account.runningCampaigns = activeCount;
      account.cpaMinUsd = cpaMin;
      account.cpaMaxUsd = cpaMax;
      account.campaignSummaries = summaries.sort((a, b) => (b.spendUsd ?? 0) - (a.spendUsd ?? 0));
    } catch (error) {
      console.warn('Failed to load campaign stats', accountId, error);
    }

    return account;
  }

  async fetchAdPaymentCycle(client, accountId) {
    if (!client || !accountId) {
      return null;
    }

    const rawId = String(accountId);
    const normalized = rawId.startsWith('act_') ? rawId : `act_${rawId.replace(/^act_/, '')}`;

    try {
      const response = await client.request(`/${normalized}/adspaymentcycle`, {
        searchParams: {
          fields:
            'threshold_amount,payment_method_last4,next_payment_due_date,next_payment_date,due_date,last_payment_amount',
        },
      });

      const candidate = Array.isArray(response?.data) ? response.data[0] : response;
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }

      return candidate;
    } catch (error) {
      const code = Number(error?.code);
      if (code === 100 || code === 200 || code === 10 || code === 803) {
        console.warn('Ad payment cycle unavailable', accountId, error?.message || error);
        return null;
      }

      console.warn('Failed to fetch ad payment cycle', accountId, error);
      return null;
    }
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
    let totalConversions = 0;
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
      if (Number.isFinite(summary.conversions)) {
        totalConversions += summary.conversions;
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
      conversions: campaigns.length > 0 ? totalConversions : null,
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

  async pauseCampaigns({ campaignIds } = {}) {
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      return { paused: [], failed: [] };
    }

    const uniqueIds = Array.from(new Set(campaignIds.map((id) => String(id).trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { paused: [], failed: [] };
    }

    const token = await this.resolveAccessToken();
    if (!token) {
      throw new Error('Meta токен не задан.');
    }

    const client = new MetaClient({
      accessToken: token,
      version: this.config?.metaGraphVersion || META_DEFAULT_GRAPH_VERSION,
      fetcher: this.fetcher,
    });

    const paused = [];
    const failed = [];

    for (const id of uniqueIds) {
      try {
        await client.request(`/${id}`, { method: 'POST', body: { status: 'PAUSED' } });
        paused.push(id);
      } catch (error) {
        failed.push({ id, error: error?.message || String(error) });
      }
    }

    return { paused, failed };
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

    const localSnapshot = resolveTimezoneSnapshot(now, timezone || this.config?.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK);
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
    const paymentCycle = raw.paymentCycle || raw.adspaymentcycle || raw.adsPaymentCycle || {};
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
      paymentThresholdUsd: parseMetaCurrency(
        paymentCycle.threshold_amount || paymentCycle.thresholdAmount || paymentCycle.threshold,
      ),
      paymentCycle: paymentCycle && Object.keys(paymentCycle).length > 0 ? paymentCycle : null,
      requiresAttention:
        paymentIssues.length > 0 ||
          (Number.isFinite(normalizedStatus) && normalizedStatus !== 1 && normalizedStatus !== 0),
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
    this.registeredChatCache = new Map();

    this.registerDefaultCommands();
  }

  registerCommand(name, handler) {
    this.commands.set(name, handler);
  }

  setChatRegistrationCache(chatId, threadId, value) {
    const normalizedChatId = normalizeTelegramId(chatId);
    if (!normalizedChatId) {
      return;
    }

    const normalizedThreadId = normalizeThreadIdValue(threadId);
    const cacheKey = buildChatKey(normalizedChatId, normalizedThreadId);
    const anyKey = `${normalizedChatId}:*`;
    const flag = Boolean(value);

    if (cacheKey) {
      this.registeredChatCache.set(cacheKey, flag);
    }

    this.registeredChatCache.set(anyKey, flag);
  }

  async isChatRegistered(chatId, threadId) {
    const normalizedChatId = normalizeTelegramId(chatId);
    if (!normalizedChatId) {
      return false;
    }

    const normalizedThreadId = normalizeThreadIdValue(threadId);
    const anyKey = `${normalizedChatId}:*`;
    if (this.registeredChatCache.has(anyKey)) {
      const cached = this.registeredChatCache.get(anyKey);
      if (cached) {
        return true;
      }
    }

    const cacheKey = buildChatKey(normalizedChatId, normalizedThreadId);
    if (cacheKey && this.registeredChatCache.has(cacheKey)) {
      return this.registeredChatCache.get(cacheKey);
    }

    const storageKey = buildChatRegistryStorageKey(normalizedChatId, normalizedThreadId);
    if (storageKey) {
      try {
        const record = await this.storage.getJson('DB', storageKey);
        if (record) {
          this.setChatRegistrationCache(normalizedChatId, normalizedThreadId, true);
          return true;
        }
      } catch (error) {
        console.warn('Failed to read chat registration state', storageKey, error);
      }
    }

    if (typeof this.storage?.listKeys === 'function') {
      try {
        const prefix = `${CHAT_KEY_PREFIX}${normalizedChatId}:`;
        const keys = await this.storage.listKeys('DB', prefix, 1);
        if (Array.isArray(keys) && keys.length > 0) {
          this.setChatRegistrationCache(normalizedChatId, normalizedThreadId, true);
          return true;
        }
      } catch (error) {
        console.warn('Failed to list chat registrations for chat', normalizedChatId, error);
      }
    }

    this.setChatRegistrationCache(normalizedChatId, normalizedThreadId, false);
    return false;
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
      const normalizedChatId = normalizeTelegramId(chatId);
      const normalizedThreadId = normalizeThreadIdValue(threadId);

      if (!normalizedChatId) {
        await context.reply('❌ Не удалось определить чат.');
        return;
      }

      if (!normalizedThreadId) {
        await context.reply('ℹ️ Команду <code>/register</code> нужно запускать внутри нужного топика (форум сообщения).');
        return;
      }

      const payload = {
        chat_id: normalizedChatId,
        thread_id: normalizedThreadId,
        title: context.chat?.title ?? '',
        added_by: context.userId,
        added_by_name: context.userDisplayName,
        created_at: new Date().toISOString(),
      };

      const key = buildChatRegistryStorageKey(normalizedChatId, normalizedThreadId);
      if (!key) {
        await context.reply('⚠️ Не удалось сохранить чат. Повторите попытку позже.');
        return;
      }

      await this.storage.putJson('DB', key, payload);
      this.setChatRegistrationCache(normalizedChatId, normalizedThreadId, true);

      await context.reply(
        [
          '✅ Топик зарегистрирован.',
          `Chat ID: <code>${normalizedChatId}</code>`,
          `Thread ID: <code>${normalizedThreadId}</code>`,
        ].join('\n'),
      );
    });

    this.registerCommand('admin', async (context) => {
      if (!context.isAdmin()) {
        await context.reply('⛔ Команда доступна только администраторам.');
        return;
      }

      const panel = await this.buildAdminPanelPayload({
        adminId: context.userId,
        chatId: context.chatId,
        threadId: context.threadId,
      });
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

  async startProjectConnectSession({
    userId,
    chatId,
    threadId,
    accounts = [],
    preferredAccountId = '',
    preferredChatKey = '',
  } = {}) {
    if (!userId) {
      return null;
    }

    const registry = await this.loadProjectRegistry({ limit: 200 });
    const chatRegistry = await this.loadChatRegistry({ limit: 200 });
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
      mode: 'create',
      allowUpdate: false,
      pendingExisting: null,
      pendingExistingKey: null,
      portalTouched: false,
      chatPresets: this.config.listChatPresets(),
      existingProjects: registry.entries,
      existingIndex: registry.index,
      chatRegistry: chatRegistry.entries,
      accounts: [],
      availableAccounts: [],
      chatEntries: [],
      availableChats: [],
      accountPage: 0,
      chatPage: 0,
      accountPageSize: 6,
      chatPageSize: 6,
    };

    await this.populateProjectConnectSession(session, { accounts, registry, chatRegistry });

    if (preferredAccountId) {
      const applied = this.applyProjectConnectAccount(session, preferredAccountId, { userId });
      if (!applied.ok) {
        console.warn('Failed to preselect account for project connect session', applied.error);
      }
    }

    if (preferredChatKey) {
      const entry = session.availableChats.find((chat) => chat.key === preferredChatKey);
      if (entry) {
        this.applyProjectConnectChatEntry(session, entry);
      }
    }

    this.refreshProjectConnectSuggestions(session);
    await this.saveAdminSession(session);
    this.queueLog({
      kind: 'admin_session',
      status: 'started',
      session_kind: 'project_connect',
      user_id: userId,
    });
    return session;
  }

  getProjectConnectAccountChoices(session, { includeSelected = true } = {}) {
    if (!session) {
      return [];
    }

    const accounts = Array.isArray(session.accounts) ? session.accounts : [];
    const selectedAccountKey = includeSelected ? normalizeAccountKey(session?.draft?.adAccountId) : '';

    return accounts
      .map((account) => {
        const key = normalizeAccountKey(account?.id ?? account?.accountId);
        if (!key) {
          return null;
        }

        const available = !account.connectedProject || key === selectedAccountKey;
        if (!available && !includeSelected) {
          return null;
        }

        return {
          key,
          account,
          available,
          selected: Boolean(selectedAccountKey && key === selectedAccountKey),
        };
      })
      .filter(Boolean);
  }

  getProjectConnectChatChoices(session, { includeSelected = true } = {}) {
    if (!session) {
      return [];
    }

    const chats = Array.isArray(session.chatEntries) ? session.chatEntries : [];
    const selectedChatKey = includeSelected ? buildChatKey(session?.draft?.chatId, session?.draft?.threadId) : '';

    return chats
      .map((entry) => {
        if (!entry || !entry.key) {
          return null;
        }

        const available = Boolean(entry.available);
        if (!available && !(includeSelected && selectedChatKey && entry.key === selectedChatKey)) {
          return null;
        }

        return {
          key: entry.key,
          chat: entry,
          available: available || (selectedChatKey && entry.key === selectedChatKey),
          selected: Boolean(selectedChatKey && entry.key === selectedChatKey),
        };
      })
      .filter(Boolean);
  }

  applyProjectConnectChatEntry(session, entry) {
    if (!session || !session.draft || !entry) {
      return { ok: false, error: 'chat_required' };
    }

    const chatId = entry.chatId || '';
    if (!chatId) {
      return { ok: false, error: 'chat_required' };
    }

    session.draft.chatId = String(chatId);
    session.draft.threadId = entry.threadId ? String(entry.threadId) : '';

    if (entry.label) {
      session.draft.chatTitle = entry.label;
    } else if (entry.chatTitle) {
      session.draft.chatTitle = entry.chatTitle;
    }

    session.selectedChatKey = entry.key;
    return { ok: true };
  }

  applyProjectConnectAccount(session, value, { userId } = {}) {
    if (!session || !session.draft) {
      return { ok: false, error: 'session_missing' };
    }

    const parsedAccount = normalizeAdAccountInput(value);
    if (!parsedAccount.ok) {
      return { ok: false, error: parsedAccount.error };
    }

    if (userId && !this.config.canManageAccount(userId, parsedAccount.accountId)) {
      return { ok: false, error: 'account_forbidden' };
    }

    const draft = session.draft;
    draft.adAccountId = parsedAccount.accountId;

    const account = this.findProjectConnectAccount(session, parsedAccount.accountId);
    if (account) {
      session.selectedAccountId = account.id;
      if (!draft.name && account.name) {
        draft.name = account.name;
      }
      if (!draft.currency && account.currency) {
        draft.currency = account.currency.toUpperCase();
      }
      if (!draft.code) {
        draft.code = normalizeProjectIdForCallback(account.name || account.id || 'project');
      }
      if (!draft.timezone) {
        draft.timezone = this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
      }
    } else {
      session.selectedAccountId = parsedAccount.numericId;
    }

    const existingEntry = this.findExistingProjectByAccount(session, parsedAccount.accountId);
    if (existingEntry && (!session.allowUpdate || session.projectKey !== existingEntry.key)) {
      const pendingCode =
        existingEntry.record?.code ||
        existingEntry.record?.id ||
        existingEntry.record?.name ||
        existingEntry.key.replace(PROJECT_KEY_PREFIX, '');
      session.pendingExisting = {
        key: existingEntry.key,
        code: pendingCode || '',
        name: existingEntry.record?.name || '',
      };
      session.pendingExistingKey = normalizeProjectIdForCallback(pendingCode || existingEntry.key);
      session.allowUpdate = false;
    } else if (!existingEntry) {
      session.pendingExisting = null;
      session.pendingExistingKey = null;
      session.allowUpdate = false;
      session.projectKey = null;
      session.existingRaw = null;
      session.mode = 'create';
    }

    this.refreshProjectConnectSuggestions(session);
    return { ok: true, account, parsed: parsedAccount };
  }

  async populateProjectConnectSession(
    session,
    { accounts, registry, chatRegistry, forceRefreshMeta = false } = {},
  ) {
    if (!session || typeof session !== 'object') {
      return session;
    }

    let projectRegistry = registry;
    if (!projectRegistry) {
      projectRegistry = await this.loadProjectRegistry({ limit: 200 });
    }

    session.existingProjects = projectRegistry.entries;
    session.existingIndex = projectRegistry.index;

    let chatIndex = chatRegistry;
    if (!chatIndex) {
      chatIndex = await this.loadChatRegistry({ limit: 200 });
    }

    session.chatRegistry = chatIndex.entries;

    let sourceAccounts = Array.isArray(accounts) ? accounts : null;
    let metaStatus = null;

    if (!sourceAccounts) {
      if (this.metaService) {
        try {
          const metaResult = forceRefreshMeta
            ? await this.metaService.refreshOverview()
            : await this.metaService.ensureOverview({ backgroundRefresh: false });
          metaStatus = metaResult?.status ?? null;
        } catch (error) {
          console.warn('Failed to resolve Meta overview for project connect session', error);
        }
      }

      if (!metaStatus) {
        try {
          metaStatus = await this.storage.readMetaStatus();
        } catch (error) {
          console.warn('Failed to read cached Meta status for project connect session', error);
        }
      }

      if (metaStatus?.facebook?.adAccounts) {
        sourceAccounts = metaStatus.facebook.adAccounts;
      }
    }

    const mappedAccounts = Array.isArray(sourceAccounts)
      ? sourceAccounts
          .map((account) => {
            const id = String(account?.accountId ?? account?.id ?? '').replace(/^act_/, '');
            if (!id) {
              return null;
            }

            const currency = account?.currency || '';
            const spendToday = Number(account?.spendTodayUsd ?? account?.spend_today_usd);
            const runningCampaigns = Number(account?.runningCampaigns ?? account?.activeCampaigns);
            const cpaMinRaw = Number(account?.cpaMinUsd ?? account?.cpa_min_usd ?? account?.cpaMin);
            const cpaMaxRaw = Number(account?.cpaMaxUsd ?? account?.cpa_max_usd ?? account?.cpaMax);
            const cpaMin = Number.isFinite(cpaMinRaw) && cpaMinRaw > 0 ? cpaMinRaw : null;
            const cpaMax = Number.isFinite(cpaMaxRaw) && cpaMaxRaw > 0 ? cpaMaxRaw : null;

            return {
              id,
              name: account?.name || '',
              currency: currency ? String(currency).toUpperCase() : '',
              statusLabel: account?.statusLabel || account?.status_label || '',
              paymentStatusLabel: account?.paymentStatusLabel || account?.payment_status_label || '',
              billingDueLabel: account?.billingDueLabel || account?.billing_due_label || '',
              billingDueInDays: Number.isFinite(Number(account?.billingDueInDays))
                ? Number(account.billingDueInDays)
                : null,
              spendTodayUsd: Number.isFinite(spendToday) ? spendToday : null,
              runningCampaigns: Number.isFinite(runningCampaigns) ? runningCampaigns : null,
              cpaMinUsd: cpaMin,
              cpaMaxUsd: cpaMax,
              campaignSummaries: Array.isArray(account?.campaignSummaries) ? account.campaignSummaries : [],
            };
          })
          .filter(Boolean)
      : [];

    const dedupedAccounts = [];
    const seenAccounts = new Set();
    for (const account of mappedAccounts) {
      const key = normalizeAccountKey(account.id);
      if (!key || seenAccounts.has(key)) {
        continue;
      }
      seenAccounts.add(key);
      dedupedAccounts.push(account);
    }

    const byAccount = projectRegistry.index?.byAccount || {};
    const accountsWithFlags = dedupedAccounts.map((account) => {
      const key = normalizeAccountKey(account.id);
      const existingIndex = key && byAccount[key] !== undefined ? byAccount[key] : null;
      const existingEntry =
        existingIndex !== null && Number.isInteger(existingIndex)
          ? projectRegistry.entries[existingIndex]
          : null;
      const projectRecord = existingEntry?.record || null;

      return {
        ...account,
        connectedProject: projectRecord
          ? {
              key: existingEntry.key,
              code: projectRecord.code || projectRecord.id || '',
              name: projectRecord.name || '',
            }
          : null,
      };
    });

    session.accounts = accountsWithFlags;

    const selectedAccountKey = normalizeAccountKey(session?.draft?.adAccountId);
    session.availableAccounts = accountsWithFlags.filter((account) => {
      const key = normalizeAccountKey(account.id);
      if (!key) {
        return false;
      }
      if (account.connectedProject && key !== selectedAccountKey) {
        return false;
      }
      return true;
    });

    const usedChatMap = new Map();
    for (const entry of projectRegistry.entries) {
      const record = entry?.record || {};
      const recordChatId = record.chatId || record.chat?.id || '';
      const recordThreadId =
        record.threadId || record.chat?.threadId || record.chat?.thread_id || '';
      const chatKey = buildChatKey(recordChatId, recordThreadId);
      if (!chatKey) {
        continue;
      }
      usedChatMap.set(chatKey, {
        key: entry.key,
        code: record.code || record.id || '',
        name: record.name || '',
      });
    }

    const chatEntries = [];
    const seenChats = new Set();
    for (const entry of chatIndex.entries) {
      const chatKey = buildChatKey(entry.chatId, entry.threadId);
      if (!chatKey || seenChats.has(chatKey)) {
        continue;
      }

      seenChats.add(chatKey);
      const usedBy = usedChatMap.get(chatKey) || null;
      chatEntries.push({
        key: chatKey,
        chatId: entry.chatId,
        threadId: entry.threadId || '',
        label: entry.label || entry.threadTitle || entry.chatTitle || '',
        chatTitle: entry.chatTitle || '',
        threadTitle: entry.threadTitle || '',
        available: !usedBy,
        usedBy,
      });
    }

    session.chatEntries = chatEntries;

    const selectedChatKey = buildChatKey(session?.draft?.chatId, session?.draft?.threadId);
    session.availableChats = chatEntries.filter((entry) => {
      if (entry.available) {
        return true;
      }
      return selectedChatKey && entry.key === selectedChatKey;
    });

    if (!Number.isFinite(Number(session.accountPageSize)) || Number(session.accountPageSize) <= 0) {
      session.accountPageSize = 6;
    }

    if (!Number.isFinite(Number(session.chatPageSize)) || Number(session.chatPageSize) <= 0) {
      session.chatPageSize = 6;
    }

    if (!Number.isFinite(Number(session.accountPage))) {
      session.accountPage = 0;
    }

    if (!Number.isFinite(Number(session.chatPage))) {
      session.chatPage = 0;
    }

    return session;
  }

  async loadProjectRegistry({ limit = 200 } = {}) {
    const entries = [];
    const index = { byAccount: {}, byCode: {} };
    let keys = [];
    try {
      keys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, limit);
    } catch (error) {
      console.warn('Failed to list project keys for registry', error);
      return { entries, index };
    }

    for (const key of keys) {
      let raw = null;
      try {
        raw = await this.storage.getJson('DB', key);
      } catch (error) {
        console.warn('Failed to read project for registry', key, error);
      }

      const record = normalizeProjectRecord(key, raw || {});
      const entry = { key, record, raw: raw || {} };
      const entryIndex = entries.push(entry) - 1;

      const accountKey = normalizeAccountKey(record.adAccountId);
      if (accountKey && !(accountKey in index.byAccount)) {
        index.byAccount[accountKey] = entryIndex;
      }

      const codeCandidates = new Set([
        normalizeProjectIdForCallback(record.code || ''),
        normalizeProjectIdForCallback(record.id || ''),
        normalizeProjectIdForCallback(record.key.replace(PROJECT_KEY_PREFIX, '')),
      ]);

      for (const candidate of codeCandidates) {
        if (candidate && !(candidate in index.byCode)) {
          index.byCode[candidate] = entryIndex;
        }
      }
    }

    return { entries, index };
  }

  async loadChatRegistry({ limit = 200 } = {}) {
    const entries = [];
    let keys = [];

    try {
      keys = await this.storage.listKeys('DB', CHAT_KEY_PREFIX, limit);
    } catch (error) {
      console.warn('Failed to list chat keys for registry', error);
      return { entries, keys: [] };
    }

    for (const key of keys) {
      const suffix = key.slice(CHAT_KEY_PREFIX.length);
      const [rawChatId = '', rawThreadId = ''] = suffix.split(':');
      let data = null;

      try {
        data = await this.storage.getJson('DB', key);
      } catch (error) {
        console.warn('Failed to load chat registry entry', key, error);
      }

      const chatId = String(rawChatId || data?.chat_id || data?.chatId || data?.chat?.id || '').trim();
      const threadId = String(
        rawThreadId || data?.thread_id || data?.threadId || data?.topic_id || data?.topicId || '',
      ).trim();
      const chatTitle = String(data?.title || data?.chat_title || data?.chatTitle || '').trim();
      const threadTitle = String(
        data?.thread_title || data?.topic_title || data?.threadTitle || data?.topicTitle || '',
      ).trim();
      const label = threadTitle || chatTitle;

      entries.push({
        key,
        chatId,
        threadId,
        chatTitle,
        threadTitle,
        label,
      });
    }

    return { entries, keys };
  }

  findProjectConnectAccount(session, accountId) {
    if (!session || !Array.isArray(session.accounts)) {
      return null;
    }

    const normalized = String(accountId ?? '')
      .trim()
      .replace(/^act_/, '');
    if (!normalized) {
      return null;
    }

    return session.accounts.find((account) => account.id === normalized) || null;
  }

  findExistingProjectByAccount(session, accountId) {
    if (!session || !session.existingProjects || !session.existingIndex) {
      return null;
    }

    const normalized = normalizeAccountKey(accountId);
    if (!normalized) {
      return null;
    }

    const position = session.existingIndex.byAccount?.[normalized];
    if (typeof position !== 'number') {
      return null;
    }

    return session.existingProjects[position] || null;
  }

  findExistingProjectByCode(session, code) {
    if (!session || !session.existingProjects || !session.existingIndex) {
      return null;
    }

    const normalized = normalizeProjectIdForCallback(code);
    if (!normalized) {
      return null;
    }

    const position = session.existingIndex.byCode?.[normalized];
    if (typeof position !== 'number') {
      return null;
    }

    return session.existingProjects[position] || null;
  }

  applyExistingProjectToDraft(session, entry, { keepPortalToken = false } = {}) {
    if (!session || !entry || !session.draft) {
      return;
    }

    const draft = session.draft;
    const record = entry.record || {};
    const raw = entry.raw || {};

    const accountId = record.adAccountId || raw.ad_account_id || raw.meta_account_id || '';
    if (accountId) {
      draft.adAccountId = accountId.startsWith('act_') ? accountId : `act_${normalizeAccountKey(accountId)}`;
    }

    draft.code = record.code || record.id || raw.code || raw.id || draft.code;
    draft.name = record.name || raw.name || draft.name;
    draft.chatId = record.chatId || raw.chat?.id || raw.chat_id || draft.chatId;
    draft.threadId = record.threadId || raw.chat?.thread_id || raw.thread_id || draft.threadId;
    draft.chatTitle = record.chatTitle || raw.chat?.title || raw.chat_title || draft.chatTitle;
    draft.timezone = raw.settings?.timezone || draft.timezone || this.config.defaultTimezone || '';
    draft.currency = raw.metrics?.currency || draft.currency || '';

    if (!keepPortalToken) {
      const portalToken = raw.portal?.token || raw.portal?.secret || raw.portal_token;
      if (portalToken) {
        draft.portalToken = portalToken;
      }
    }

    session.projectKey = entry.key;
    session.mode = 'update';
    session.existingRaw = raw;
    session.allowUpdate = true;
    session.pendingExisting = null;
    session.pendingExistingKey = normalizeProjectIdForCallback(
      entry.record?.code || entry.record?.id || entry.key.replace(PROJECT_KEY_PREFIX, ''),
    );
    session.portalTouched = false;
  }

  applyChatPreset(session, preset) {
    if (!session || !preset) {
      return;
    }

    if (!session.draft) {
      session.draft = {
        chatId: '',
        threadId: '',
        code: '',
        name: '',
        adAccountId: '',
        timezone: this.config.defaultTimezone || '',
        currency: '',
        chatTitle: '',
      };
    }

    const draft = session.draft;
    draft.chatId = preset.chatId || draft.chatId;
    draft.threadId = preset.threadId || draft.threadId || '';
    if (preset.title) {
      draft.chatTitle = preset.title;
    }
    if (preset.portalToken) {
      draft.portalToken = preset.portalToken;
      session.portalTouched = true;
    }
    if (preset.timezone && !draft.timezone) {
      draft.timezone = preset.timezone;
    }

    session.selectedChatPreset = preset.key;
  }

  refreshProjectConnectSuggestions(session) {
    if (!session || !session.draft) {
      return;
    }

    const draft = session.draft;
    const account = this.findProjectConnectAccount(session, draft.adAccountId);
    if (account) {
      session.selectedAccountId = account.id;
      if (!draft.name && account.name) {
        draft.name = account.name;
      }
      if (!draft.currency && account.currency) {
        draft.currency = account.currency.toUpperCase();
      }
      if (!draft.code) {
        draft.code = normalizeProjectIdForCallback(account.name || account.id || 'project');
      }
    }

    const timezone = draft.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
    session.scheduleSuggestion = buildDefaultProjectSchedule({ timezone });
    if (account) {
      session.kpiSuggestion = deriveDefaultProjectKpi(account, { currency: draft.currency || account.currency });
    } else {
      session.kpiSuggestion = null;
    }
  }

  async buildProjectPortalLink(project, { rawProject } = {}) {
    const workerUrl = typeof this.config.workerUrl === 'string' ? this.config.workerUrl.trim() : '';
    if (!workerUrl) {
      return '';
    }

    if (!project || typeof project !== 'object') {
      return '';
    }

    const codeCandidate = project.code || project.id || '';
    const code = typeof codeCandidate === 'string' ? codeCandidate.trim() : String(codeCandidate || '');
    if (!code) {
      return '';
    }

    const addToken = (value, set) => {
      if (!value || !set) {
        return;
      }
      const token = String(value).trim();
      if (token) {
        set.add(token);
      }
    };

    const tokens = new Set();
    if (Array.isArray(project.portalTokens)) {
      for (const token of project.portalTokens) {
        addToken(token, tokens);
      }
    }
    addToken(project.portalToken, tokens);
    if (project.portal && typeof project.portal === 'object') {
      addToken(project.portal.token, tokens);
      addToken(project.portal.secret, tokens);
      addToken(project.portal.signature, tokens);
    }

    let rawPortalActive = null;
    if (rawProject && typeof rawProject === 'object') {
      rawPortalActive = isPortalActive(rawProject);
      const rawTokens = extractPortalTokens(rawProject);
      for (const token of rawTokens) {
        addToken(token, tokens);
      }
    }

    if (project.portalEnabled === false && rawPortalActive === false && tokens.size === 0) {
      return '';
    }

    addToken(this.config.portalAccessToken, tokens);
    addToken(this.config.metaManageToken, tokens);

    if (tokens.size === 0) {
      return '';
    }

    const preferredSignature = pickFirstFilled(
      project?.portal?.signature,
      rawProject?.portal?.signature,
      rawProject?.portal_signature,
      rawProject?.portal_sig,
      rawProject?.portal_signatures && rawProject.portal_signatures[0],
    );

    let signature = preferredSignature ? String(preferredSignature).trim() : '';
    if (!signature) {
      const { value: firstToken } = tokens.values().next();
      signature = await buildPortalSignature({ code, token: firstToken });
    }

    if (!signature) {
      const { value } = tokens.values().next();
      signature = value || '';
    }

    if (!signature) {
      return '';
    }

    const base = workerUrl.replace(/\/+$/, '');
    return `${base}/p/${encodeURIComponent(code)}?sig=${encodeURIComponent(signature)}`;
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
    await this.sendReply(
      message,
      'Используйте кнопки редактора KPI под сообщением. Для отмены нажмите «↩️ Назад» или /cancel.',
    );
    return { handled: true };
  }

  buildKpiEditorKeyboard(base, session) {
    const draft = session?.kpiDraft || {};
    const mode = session?.kpiMode || 'main';

    if (mode.startsWith('field:')) {
      const field = mode.split(':')[1] || '';
      if (field === 'objective') {
        const rows = [];
        for (let i = 0; i < KPI_OBJECTIVE_OPTIONS.length; i += 2) {
          const slice = KPI_OBJECTIVE_OPTIONS.slice(i, i + 2);
          rows.push(
            slice.map((option) => ({
              text: `${option.label}${draft.objective === option.value ? ' ✅' : ''}`,
              callback_data: `${base}:kpi:objective:${option.value}`,
            })),
          );
        }
        rows.push([
          { text: '🧹 Очистить', callback_data: `${base}:kpi:clear:objective` },
          { text: '↩️ Назад', callback_data: `${base}:kpi:back` },
        ]);
        rows.push([{ text: '✅ Сохранить', callback_data: `${base}:kpi:save` }]);
        return { inline_keyboard: rows };
      }

      if (field === 'currency') {
        const rows = [];
        const choices = Array.from(new Set([draft.currency, ...KPI_CURRENCY_OPTIONS].filter(Boolean)));
        for (let i = 0; i < choices.length; i += 3) {
          rows.push(
            choices.slice(i, i + 3).map((value) => ({
              text: `${value}${draft.currency === value ? ' ✅' : ''}`,
              callback_data: `${base}:kpi:currency:${value}`,
            })),
          );
        }
        rows.push([
          { text: '🧹 Очистить', callback_data: `${base}:kpi:clear:currency` },
          { text: '↩️ Назад', callback_data: `${base}:kpi:back` },
        ]);
        rows.push([{ text: '✅ Сохранить', callback_data: `${base}:kpi:save` }]);
        return { inline_keyboard: rows };
      }

      if (Object.prototype.hasOwnProperty.call(KPI_FIELD_CONFIG, field)) {
        const config = KPI_FIELD_CONFIG[field];
        const rows = [];
        const negativeSteps = (config.steps || []).filter((step) => step < 0);
        const positiveSteps = (config.steps || []).filter((step) => step > 0);
        if (negativeSteps.length > 0) {
          rows.push(
            negativeSteps.map((step) => ({
              text: formatStepLabel(step),
              callback_data: `${base}:kpi:adjust:${field}:${step}`,
            })),
          );
        }
        if (positiveSteps.length > 0) {
          rows.push(
            positiveSteps.map((step) => ({
              text: formatStepLabel(step),
              callback_data: `${base}:kpi:adjust:${field}:${step}`,
            })),
          );
        }
        rows.push([
          { text: '🧹 Очистить', callback_data: `${base}:kpi:clear:${field}` },
          { text: '↩️ Назад', callback_data: `${base}:kpi:back` },
        ]);
        rows.push([{ text: '✅ Сохранить', callback_data: `${base}:kpi:save` }]);
        return { inline_keyboard: rows };
      }
    }

    const keyboard = { inline_keyboard: [] };
    keyboard.inline_keyboard.push([
      { text: '🎯 Цель', callback_data: `${base}:kpi:field:objective` },
      { text: '💰 CPA', callback_data: `${base}:kpi:field:cpa` },
      { text: '📊 CPL', callback_data: `${base}:kpi:field:cpl` },
    ]);
    keyboard.inline_keyboard.push([
      { text: '👥 Лиды/день', callback_data: `${base}:kpi:field:leadsPerDay` },
      { text: '💵 Бюджет/день', callback_data: `${base}:kpi:field:dailyBudget` },
      { text: '💱 Валюта', callback_data: `${base}:kpi:field:currency` },
    ]);
    if (session?.kpiSuggestion) {
      keyboard.inline_keyboard.push([{ text: '♻️ Подставить рекомендации', callback_data: `${base}:kpi:apply` }]);
    }
    keyboard.inline_keyboard.push([
      { text: '✅ Сохранить', callback_data: `${base}:kpi:save` },
      { text: '↩️ Отмена', callback_data: `${base}:kpi:cancel` },
    ]);
    keyboard.inline_keyboard.push([
      { text: '⬅️ К проекту', callback_data: `${base}:open` },
      { text: '⚙️ Настройки', callback_data: `${base}:settings` },
    ]);
    return keyboard;
  }

  async renderKpiEditor(message, { chatId, base, session, context }) {
    if (!session) {
      return;
    }

    if (!session.kpiDraft) {
      const current = extractProjectKpi(context.rawProject) || {};
      session.kpiDraft = normalizeKpiDraft(current, { suggestion: session.kpiSuggestion || context.kpiSuggestion });
    }
    if (!session.kpiSuggestion && context.kpiSuggestion) {
      session.kpiSuggestion = normalizeKpiDraft(context.kpiSuggestion);
    }
    if (!session.kpiMode) {
      session.kpiMode = 'main';
    }

    await this.saveAdminSession(session);

    const draft = session.kpiDraft || {};
    const lines = ['<b>Редактор KPI</b>', ...describeKpiDraft(draft)];
    if (session.kpiSuggestion) {
      lines.push('', '<b>Рекомендация</b>', ...describeKpiDraft(session.kpiSuggestion));
    }

    if (session.kpiMode === 'main') {
      lines.push('', 'Выберите параметр для изменения.');
    } else if (session.kpiMode.startsWith('field:')) {
      const field = session.kpiMode.split(':')[1] || '';
      const config = KPI_FIELD_CONFIG[field];
      if (config) {
        lines.push('', `${config.label}: используйте кнопки для изменения значения.`);
      } else if (field === 'objective') {
        lines.push('', 'Выберите целевую оптимизацию кампаний.');
      } else if (field === 'currency') {
        lines.push('', 'Выберите валюту бюджета.');
      }
    }

    const replyMarkup = this.buildKpiEditorKeyboard(base, session);
    await this.renderAdminMessage(message, {
      chatId,
      text: lines.join('\n'),
      reply_markup: replyMarkup,
    });
  }

  async saveKpiDraftFromSession(session, { context, userId, base, message, chatId }) {
    const projectKey = session.projectKey;
    if (!projectKey) {
      return { ok: false, reason: 'project_missing' };
    }

    let raw = await this.storage.getJson('DB', projectKey);
    if (!raw || typeof raw !== 'object') {
      raw = {};
    }

    applyProjectIdentity(raw, session.projectSnapshot);

    const draft = session.kpiDraft || normalizeKpiDraft(extractProjectKpi(context.rawProject) || {}, {
      suggestion: session.kpiSuggestion,
    });

    const storedKpi = {};
    if (draft.objective) {
      storedKpi.objective = draft.objective;
    }
    if (Number.isFinite(draft.cpa)) {
      storedKpi.cpa = sanitizeKpiValue(draft.cpa, 'cpa');
    }
    if (Number.isFinite(draft.cpl)) {
      storedKpi.cpl = sanitizeKpiValue(draft.cpl, 'cpl');
    }
    if (Number.isFinite(draft.leadsPerDay)) {
      storedKpi.leadsPerDay = sanitizeKpiValue(draft.leadsPerDay, 'leadsPerDay');
    }
    if (Number.isFinite(draft.dailyBudget)) {
      storedKpi.dailyBudget = sanitizeKpiValue(draft.dailyBudget, 'dailyBudget');
    }
    if (draft.currency) {
      storedKpi.currency = draft.currency;
    }

    const now = new Date().toISOString();
    raw.kpi = { ...storedKpi };
    raw.settings = raw.settings || {};
    raw.settings.kpi = { ...storedKpi };
    raw.metrics = raw.metrics || {};
    raw.metrics.kpi = { ...storedKpi };
    raw.updated_at = now;
    if (userId) {
      raw.updated_by = userId;
    }

    await this.storage.putJson('DB', projectKey, raw);
    await this.clearAdminSession(userId);

    const lines = ['<b>KPI обновлены</b>', ...formatKpiLines(storedKpi), '', 'Можно открыть карточку проекта для просмотра изменений.'];
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '⬅️ К проекту', callback_data: `${base}:open` },
          { text: '⚙️ Настройки', callback_data: `${base}:settings` },
        ],
      ],
    };

    await this.renderAdminMessage(message, { chatId, text: lines.join('\n'), reply_markup: replyMarkup });
    this.queueLog({
      kind: 'admin_session',
      status: 'saved',
      session_kind: session.kind,
      user_id: userId,
      project_key: projectKey,
    });

    return { ok: true, storedKpi };
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
    const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });

    await this.sendReply(message, bodyText, {
      reply_markup: buildProjectReportKeyboard(base, { portalUrl }),
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
      this.refreshProjectConnectSuggestions(session);
      await this.saveAdminSession(session);
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
          const result = this.applyProjectConnectAccount(session, value, { userId });
          if (!result.ok) {
            await this.sendReply(message, this.describeProjectConnectError(result.error));
            return { handled: true };
          }

          touched = true;
          break;
        }
        case 'preset':
        case 'chat_preset':
        case 'template':
        case 'chat_template': {
          const preset = this.config.getChatPreset(value);
          if (!preset) {
            await this.sendReply(message, this.describeProjectConnectError('preset_unknown', value));
            return { handled: true };
          }

          this.applyChatPreset(session, preset);
          touched = true;
          break;
        }
        case 'chat': {
          const parsed = parseProjectChatInput(value);
          if (!parsed.ok) {
            await this.sendReply(message, this.describeProjectConnectError(parsed.error));
            return { handled: true };
          }

          draft.chatId = parsed.chatId;
          touched = true;
          if (parsed.threadId) {
            draft.threadId = parsed.threadId;
          }
          break;
        }
        case 'thread':
        case 'topic':
          if (!/^\d+$/.test(value)) {
            await this.sendReply(message, this.describeProjectConnectError('thread_invalid'));
            return { handled: true };
          }
          draft.threadId = value;
          touched = true;
          break;
        case 'code':
          if (isClearingValue(value)) {
            draft.code = '';
          } else {
            draft.code = normalizeProjectIdForCallback(value);
          }
          touched = true;
          break;
        case 'name':
          draft.name = value;
          touched = true;
          break;
        case 'timezone':
          if (isClearingValue(value)) {
            draft.timezone = '';
          } else {
            draft.timezone = value;
          }
          touched = true;
          break;
        case 'currency':
          draft.currency = isClearingValue(value) ? '' : value.replace(/\s+/g, '').toUpperCase();
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
          if (isClearingValue(value)) {
            delete draft.portalToken;
          } else {
            draft.portalToken = value;
          }
          session.portalTouched = true;
          touched = true;
          break;
        case 'project':
        case 'load':
        case 'existing': {
          const existing = this.findExistingProjectByCode(session, value);
          if (!existing) {
            await this.sendReply(message, this.describeProjectConnectError('project_unknown', value));
            return { handled: true };
          }

          this.applyExistingProjectToDraft(session, existing);
          touched = true;
          break;
        }
        case 'reuse':
        case 'update':
        case 'attach': {
          let target = value;
          if (!target || /^(yes|да|y|ok|1|true)$/i.test(target)) {
            target = session.pendingExisting?.code || session.pendingExistingKey || draft.code || '';
          }

          if (!target) {
            await this.sendReply(message, this.describeProjectConnectError('project_confirm_required'));
            return { handled: true };
          }

          let existing = this.findExistingProjectByCode(session, target);
          if (!existing && draft.adAccountId) {
            existing = this.findExistingProjectByAccount(session, draft.adAccountId);
          }

          if (!existing) {
            await this.sendReply(message, this.describeProjectConnectError('project_unknown', target));
            return { handled: true };
          }

          this.applyExistingProjectToDraft(session, existing);
          touched = true;
          break;
        }
        case 'kpi':
          draft.kpiNote = value;
          touched = true;
          break;
        default:
          break;
      }
    }

    this.refreshProjectConnectSuggestions(session);
    await this.saveAdminSession(session);

    if (shouldSave) {
      if (session.pendingExisting && !session.allowUpdate) {
        await this.sendReply(message, this.describeProjectConnectError('project_confirm_required'));
        return { handled: true };
      }

      if (draft.adAccountId && !this.config.canManageAccount(userId, draft.adAccountId)) {
        await this.sendReply(message, this.describeProjectConnectError('account_forbidden'));
        return { handled: true };
      }

      this.refreshProjectConnectSuggestions(session);
      const result = await this.finishProjectConnectSession(session);
      if (!result.ok) {
        const errorMessage = this.describeProjectConnectError(result.error, result.detail);
        await this.sendReply(message, errorMessage);
        return { handled: true };
      }

      await this.clearAdminSession(userId);

      const record = result.record;
      const header = result.action === 'updated' ? '<b>Проект обновлён</b>' : '<b>Проект подключён</b>';
      const lines = [
        header,
        `Код: <code>${escapeHtml(record.code)}</code>`,
        `Аккаунт: <code>act_${escapeHtml(String(record.meta_account_id || record.ad_account_id))}</code>`,
        `Чат: <code>${escapeHtml(record.chat.id)}</code>${
          record.chat.thread_id ? ` / <code>${escapeHtml(record.chat.thread_id)}</code>` : ''
        }`,
        `Таймзона: ${escapeHtml(record.settings?.timezone || DEFAULT_TIMEZONE_FALLBACK)}`,
        '',
        result.action === 'updated'
          ? 'Проверьте карточку проекта — новые параметры применены.'
          : 'Откройте /admin → Проекты, чтобы настроить KPI, отчёты и алерты.',
      ];

      await this.sendReply(message, lines.join('\n'));
      await this.notifyProjectCreated(record, {
        initiator: userId,
        sourceChatId: session.chatId,
        action: result.action,
        previous: result.previous || null,
      });
      return { handled: true };
    }

    if (!touched) {
      await this.sendReply(
        message,
        'Выберите рекламный кабинет и чат с помощью кнопок ниже. При необходимости можно отправить пары вида <code>account=act_123</code>, <code>chat=-100123:5</code>, <code>code=project</code>.',
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
      case 'account_invalid':
        return 'Рекламный аккаунт не распознан. Используйте формат <code>act_123456789</code>.';
      case 'account_forbidden':
        return 'У вас нет доступа к этому рекламному аккаунту. Обратитесь к администратору или выберите другой аккаунт.';
      case 'account_conflict':
        return 'За этим рекламным аккаунтом уже закреплён проект. Нажмите «🔁 Обновить проект», чтобы использовать его повторно, или выберите другой аккаунт.';
      case 'chat_required':
        return 'Укажите чат проекта: <code>chat=-100123456789:5</code>.';
      case 'chat_invalid':
        return 'Чат должен быть числовым ID или ссылкой. Пример: <code>chat=-100123456789:5</code>.';
      case 'thread_invalid':
        return 'Topic ID должен быть числом. Пример: <code>thread=12</code>.';
      case 'code_invalid':
        return 'Код проекта не распознан. Используйте латинские буквы, цифры и дефис: <code>code=project-name</code>.';
      case 'code_conflict':
        return 'Проект с таким кодом уже существует. Укажите другой <code>code=</code>.';
      case 'project_unknown':
        return 'Проект с указанным кодом не найден в реестре. Проверьте значение <code>project=</code>.';
      case 'project_confirm_required':
        return 'Найден существующий проект. Подтвердите обновление кнопкой «🔁 Обновить проект» или выберите другой кабинет.';
      case 'preset_unknown':
        return 'Пресет не найден. Посмотрите список пресетов в черновике или обновите переменную окружения PROJECT_CHAT_PRESETS.';
      case 'storage_failed':
        return `Не удалось сохранить проект: ${escapeHtml(detail || 'ошибка KV')}`;
      default:
        return 'Не удалось сохранить проект. Попробуйте ещё раз или обратитесь к разработчику.';
    }
  }

  renderProjectConnectDraft(session) {
    const draft = session.draft || {};
    const account = draft.adAccountId ? this.findProjectConnectAccount(session, draft.adAccountId) : null;
    const accountText = draft.adAccountId
      ? `${escapeHtml(account?.name || 'Без названия')} — <code>${escapeHtml(String(draft.adAccountId))}</code>${
          account?.currency ? ` (${escapeHtml(account.currency)})` : ''
        }`
      : 'не выбран';

    const chatTitle = draft.chatTitle ? ` — ${escapeHtml(draft.chatTitle)}` : '';
    const chatThread = draft.threadId ? ` / <code>${escapeHtml(String(draft.threadId))}</code>` : '';
    const chatText = draft.chatId
      ? `<code>${escapeHtml(String(draft.chatId))}</code>${chatThread}${chatTitle}`
      : 'не выбран';

    const codeText = draft.code ? `<code>${escapeHtml(draft.code)}</code>` : 'создадим автоматически';
    const nameText = draft.name ? escapeHtml(draft.name) : account?.name ? escapeHtml(account.name) : 'будет подставлено из аккаунта';
    const timezone = draft.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;

    const lines = [
      '<b>Выбор проекта</b>',
      `Рекламный кабинет: ${accountText}`,
      `Чат: ${chatText}`,
      `Код: ${codeText}`,
      `Название: ${nameText}`,
      `Таймзона: ${escapeHtml(timezone)}`,
    ];

    if (draft.portalToken) {
      const previewToken = draft.portalToken.length > 4
        ? `••••${escapeHtml(draft.portalToken.slice(-4))}`
        : escapeHtml(draft.portalToken);
      lines.push(`Портал: <code>${previewToken}</code>`);
    }

    if (session.pendingExisting) {
      lines.push(
        '',
        `⚠️ Кабинет уже подключён к проекту <code>${escapeHtml(session.pendingExisting.code || 'без кода')}</code>${
          session.pendingExisting.name ? ` (${escapeHtml(session.pendingExisting.name)})` : ''
        }.`,
        'Нажмите «🔁 Обновить проект», чтобы переиспользовать запись.',
      );
    } else if (session.mode === 'update' && session.projectKey) {
      lines.push('', 'Режим: обновление проекта. Изменения перезапишут текущие данные.');
    }

    if (session.kpiSuggestion) {
      lines.push('', '<b>Предложенные KPI</b>', ...formatKpiLines(session.kpiSuggestion));
    }

    if (session.scheduleSuggestion) {
      lines.push('', '<b>Предложенное расписание</b>', ...formatScheduleLines(session.scheduleSuggestion, { timezone }));
    }

    if (!draft.chatId) {
      lines.push('', 'Если нужного чата нет, запустите /register в теме нужной группы.');
    }

    return lines.join('\n');
  }

  renderProjectConnectPanel(session) {
    if (!session) {
      return [
        '<b>Подключение проекта</b>',
        'Сессия не найдена. Нажмите «Подключить проект» ещё раз.',
      ].join('\n');
    }

    const freeAccounts = Array.isArray(session.availableAccounts)
      ? session.availableAccounts.filter((account) => {
          const key = normalizeAccountKey(account?.id);
          const selected = normalizeAccountKey(session?.draft?.adAccountId);
          if (!key) {
            return false;
          }
          if (account.connectedProject && key !== selected) {
            return false;
          }
          return true;
        }).length
      : 0;

    const freeChats = Array.isArray(session.availableChats)
      ? session.availableChats.filter((entry) => entry && entry.available).length
      : 0;

    const counts = [];
    if (freeAccounts > 0) {
      counts.push(`кабинетов: ${freeAccounts}`);
    }
    if (freeChats > 0) {
      counts.push(`чатов: ${freeChats}`);
    }

    const lines = [
      '<b>Подключение проекта</b>',
      'Выберите рекламный кабинет и чат кнопками ниже, затем нажмите «Готово».',
    ];

    if (counts.length > 0) {
      lines.push(`Доступно сейчас — ${counts.join(', ')}.`);
    } else {
      lines.push('Свободных кабинетов или чатов пока нет — обновите Meta или зарегистрируйте чат через /register.');
    }

    lines.push('', this.renderProjectConnectDraft(session));
    return lines.join('\n');
  }

  buildProjectConnectKeyboard(session) {
    if (!session) {
      return undefined;
    }

    const keyboard = [];
    const accountChoices = this.getProjectConnectAccountChoices(session, { includeSelected: true });
    const accountPageSize =
      Number.isFinite(Number(session.accountPageSize)) && Number(session.accountPageSize) > 0
        ? Number(session.accountPageSize)
        : 6;
    const accountItems = accountChoices.filter((choice) => choice.available || choice.selected);
    const accountPages = Math.max(1, Math.ceil(accountItems.length / accountPageSize) || 1);
    const accountPage = Math.max(
      0,
      Math.min(Number(session.accountPage) || 0, Math.max(0, accountPages - 1)),
    );
    const accountSlice = accountItems.slice(
      accountPage * accountPageSize,
      accountPage * accountPageSize + accountPageSize,
    );

    if (accountSlice.length > 0) {
      const accountButtons = accountSlice.map((choice) => {
        const account = choice.account;
        const label = account?.name ? truncateLabel(account.name, 22) : `act_${choice.key}`;
        const currency = account?.currency ? ` ${account.currency}` : '';
        const prefix = choice.selected ? '✅' : '📊';
        return {
          text: `${prefix} ${label}${currency}`.trim(),
          callback_data: `admin:project_connect:account:${choice.key}`,
        };
      });
      const rows = chunkArray(accountButtons, 2);
      keyboard.push(...rows);

      if (accountPages > 1) {
        keyboard.push([
          {
            text: '◀',
            callback_data: 'admin:project_connect:page:account:prev',
          },
          {
            text: `${accountPage + 1}/${accountPages}`,
            callback_data: 'admin:project_connect:noop',
          },
          {
            text: '▶',
            callback_data: 'admin:project_connect:page:account:next',
          },
        ]);
      }
    }

    const chatChoices = this.getProjectConnectChatChoices(session, { includeSelected: true });
    const chatPageSize =
      Number.isFinite(Number(session.chatPageSize)) && Number(session.chatPageSize) > 0
        ? Number(session.chatPageSize)
        : 6;
    const chatItems = chatChoices.filter((choice) => choice.available || choice.selected);
    const chatPages = Math.max(1, Math.ceil(chatItems.length / chatPageSize) || 1);
    const chatPage = Math.max(0, Math.min(Number(session.chatPage) || 0, Math.max(0, chatPages - 1)));
    const chatSlice = chatItems.slice(chatPage * chatPageSize, chatPage * chatPageSize + chatPageSize);

    if (chatSlice.length > 0) {
      const chatButtons = chatSlice.map((choice) => {
        const chat = choice.chat;
        const title = chat.label || chat.threadTitle || chat.chatTitle || chat.chatId;
        const label = truncateLabel(title || chat.chatId, 22);
        const prefix = choice.selected ? '✅' : '💬';
        const thread = chat.threadId ? `:${chat.threadId}` : '';
        return {
          text: `${prefix} ${label}`,
          callback_data: `admin:project_connect:chat:${chat.chatId}${thread}`,
        };
      });
      const rows = chunkArray(chatButtons, 2);
      keyboard.push(...rows);

      if (chatPages > 1) {
        keyboard.push([
          {
            text: '◀',
            callback_data: 'admin:project_connect:page:chat:prev',
          },
          {
            text: `${chatPage + 1}/${chatPages}`,
            callback_data: 'admin:project_connect:noop',
          },
          {
            text: '▶',
            callback_data: 'admin:project_connect:page:chat:next',
          },
        ]);
      }
    }

    if (session.pendingExisting) {
      keyboard.push([
        { text: '🔁 Обновить проект', callback_data: 'admin:project_connect:reuse' },
      ]);
    }

    keyboard.push([
      { text: '♻️ Обновить списки', callback_data: 'admin:project_connect:refresh' },
      { text: '🛑 Отмена', callback_data: 'admin:project_connect:cancel' },
    ]);

    keyboard.push([{ text: '✅ Готово', callback_data: 'admin:project_connect:save' }]);

    if (keyboard.length === 0) {
      return undefined;
    }

    return { inline_keyboard: keyboard };
  }


  async notifyProjectCreated(record, { initiator, sourceChatId, action = 'created', previous = null } = {}) {
    if (!record || typeof record !== 'object') {
      return;
    }

    const projectId = record.id || record.code || record.key || 'project';
    const accountId = record.meta_account_id || record.ad_account_id || '';
    const chatId = record.chat?.id || '';
    const threadId = record.chat?.thread_id || record.chat?.threadId || null;
    const timezone = record.settings?.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;

    const isUpdate = action === 'updated';

    const lines = [
      isUpdate ? '<b>Проект обновлён</b>' : '<b>Новый проект подключён</b>',
      `Код: <code>${escapeHtml(projectId)}</code>`,
      accountId ? `Аккаунт: <code>act_${escapeHtml(String(accountId))}</code>` : 'Аккаунт: не указан',
      chatId ? `Чат: <code>${escapeHtml(chatId)}</code>${threadId ? ` / <code>${escapeHtml(String(threadId))}</code>` : ''}` : 'Чат: не задан',
    ];

    if (isUpdate && previous) {
      const prevChatId = previous.chatId || '';
      const prevThreadId = previous.threadId || '';
      if (prevChatId && (prevChatId !== chatId || prevThreadId !== String(threadId || ''))) {
        lines.push(
          '',
          `Было: <code>${escapeHtml(prevChatId)}</code>${
            prevThreadId ? ` / <code>${escapeHtml(prevThreadId)}</code>` : ''
          }`,
        );
      }
    }

    const kpi = extractProjectKpi(record);
    if (kpi) {
      lines.push('', '<b>KPI</b>', ...formatKpiLines(kpi));
    }

    const schedule = extractScheduleSettings(record);
    if (schedule) {
      lines.push('', '<b>Расписание</b>', ...formatScheduleLines(schedule, { timezone }));
    }

    if (isUpdate) {
      lines.push('', 'Изменения применены. Проверьте карточку проекта для актуальных настроек.');
    }

    const message = lines.join('\n');
    const adminTargets = Array.from(this.config.adminIds || []);

    for (const target of adminTargets) {
      if (!target) {
        continue;
      }

      const targetId = String(target);
      if (sourceChatId && String(sourceChatId) === targetId) {
        continue;
      }
      if (initiator && String(initiator) === targetId) {
        continue;
      }

      try {
        await this.sendMessageWithFallback({
          chat_id: targetId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
      } catch (error) {
        console.warn('Failed to notify admin about project', targetId, error);
      }
    }

    if (chatId && !/^https?:/i.test(chatId)) {
      const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      if (threadId && /^\d+$/.test(String(threadId))) {
        payload.message_thread_id = Number(threadId);
      }

      if (!sourceChatId || String(sourceChatId) !== String(chatId)) {
        try {
          await this.sendMessageWithFallback(payload);
        } catch (error) {
          console.warn('Failed to notify project chat', chatId, error);
        }
      }
    }

    this.queueLog({
      kind: 'project',
      status: isUpdate ? 'updated_notified' : 'notified',
      project_id: projectId,
      project_key: record.key || null,
      chat_id: chatId || null,
    });
  }

  async finishProjectConnectSession(session) {
    const draft = session.draft || {};

    if (!draft.adAccountId) {
      return { ok: false, error: 'account_required' };
    }
    if (!draft.chatId) {
      return { ok: false, error: 'chat_required' };
    }
    const slugSource = draft.code || draft.name || draft.adAccountId;
    const slug = normalizeProjectIdForCallback(slugSource || '');
    if (!slug) {
      return { ok: false, error: 'code_invalid' };
    }

    const numericAccountId = normalizeAccountKey(draft.adAccountId);
    const adAccountId = numericAccountId || String(draft.adAccountId).replace(/^act_/, '');

    this.refreshProjectConnectSuggestions(session);

    if (!this.config.canManageAccount(session.userId, `act_${adAccountId}`)) {
      return { ok: false, error: 'account_forbidden' };
    }

    let projectKey = `${PROJECT_KEY_PREFIX}${slug}`;
    let isUpdate = Boolean(session.allowUpdate && session.projectKey);
    if (isUpdate) {
      projectKey = session.projectKey;
    }

    let stored = null;
    if (isUpdate) {
      try {
        stored = await this.storage.getJson('DB', projectKey);
      } catch (error) {
        console.warn('Failed to read existing project for update', projectKey, error);
      }
      if (!stored) {
        isUpdate = false;
        projectKey = `${PROJECT_KEY_PREFIX}${slug}`;
      }
    }

    if (!isUpdate) {
      try {
        stored = await this.storage.getJson('DB', projectKey);
      } catch (error) {
        console.warn('Failed to read project before create', projectKey, error);
      }
      if (stored) {
        return { ok: false, error: 'code_conflict' };
      }
    }

    const accountEntry = this.findExistingProjectByAccount(session, draft.adAccountId);
    if (accountEntry && (!isUpdate || accountEntry.key !== projectKey)) {
      return { ok: false, error: 'account_conflict', detail: accountEntry.record?.code || accountEntry.record?.id };
    }

    const accountMeta = this.findProjectConnectAccount(session, `act_${adAccountId}`);
    const currencyCandidate = draft.currency || accountMeta?.currency || stored?.metrics?.currency || 'USD';
    const currency = currencyCandidate ? String(currencyCandidate).toUpperCase() : 'USD';
    const timezone = draft.timezone || stored?.settings?.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
    const derivedSchedule = session.scheduleSuggestion || buildDefaultProjectSchedule({ timezone });
    const derivedKpi = session.kpiSuggestion || deriveDefaultProjectKpi(accountMeta, { currency });
    const storedSchedule = stored ? extractScheduleSettings(stored) : null;
    const storedKpi = stored ? extractProjectKpi(stored) : null;
    let scheduleToStore = isUpdate ? storedSchedule || derivedSchedule : derivedSchedule;
    if (scheduleToStore) {
      scheduleToStore = { ...scheduleToStore, timezone };
    }
    const kpiToStore = isUpdate ? storedKpi || derivedKpi : derivedKpi;
    const nowIso = new Date().toISOString();
    const previousRecord = stored ? normalizeProjectRecord(projectKey, stored) : null;

    const record = stored && typeof stored === 'object' ? { ...stored } : {};
    record.id = slug;
    record.key = projectKey;
    record.code = draft.code || slug;
    record.name = draft.name || accountMeta?.name || record.name || slug;
    record.ad_account_id = adAccountId;
    record.meta_account_id = adAccountId;
    record.chat = {
      ...(record.chat || {}),
      id: draft.chatId,
      thread_id: draft.threadId,
      title: draft.chatTitle || record.chat?.title || '',
      url: buildTelegramTopicUrl(draft.chatId, draft.threadId),
    };
    record.settings = { ...(record.settings || {}), timezone };
    record.metrics = { ...(record.metrics || {}), currency };
    record.meta = {
      ...(record.meta || {}),
      accountId: adAccountId,
      accountName: accountMeta?.name || record.meta?.accountName || record.name || '',
    };
    if (draft.kpiNote) {
      record.notes = { ...(record.notes || {}), kpi: draft.kpiNote };
    }

    if (session.portalTouched || (!isUpdate && draft.portalToken)) {
      if (draft.portalToken) {
        record.portal = { token: draft.portalToken };
      } else {
        delete record.portal;
      }
    }

    if (!isUpdate) {
      let portalToken = draft.portalToken || record.portal?.token || '';
      if (!portalToken) {
        portalToken = generatePortalToken({});
      }

      const signature = portalToken
        ? await buildPortalSignature({ code: record.code || slug, token: portalToken })
        : '';

      record.portal = {
        ...(record.portal || {}),
        token: portalToken,
        enabled: true,
        updated_at: nowIso,
        created_at: record.portal?.created_at || nowIso,
      };
      delete record.portal.disabled;
      delete record.portal.disabled_at;
      if (signature) {
        record.portal.signature = signature;
      }

      record.portal_tokens = [portalToken];
      record.portal_signatures = signature ? [signature] : [];

      record.tokens = { ...(record.tokens || {}) };
      record.tokens.portal = portalToken;
      if (signature) {
        record.tokens.portal_signature = signature;
      }

      record.client = { ...(record.client || {}) };
      record.client.billing = { ...(record.client.billing || {}) };
      if (!record.client.billing.status || record.client.billing.status === 'declined') {
        record.client.billing.status = 'active';
      }
      record.client.billing.portal_disabled = false;
      record.client.billing.portalDisabled = false;
      record.client.billing.declined_at = null;
    }

    if (scheduleToStore) {
      record.schedule = { ...scheduleToStore };
      record.settings = { ...record.settings, schedule: { ...scheduleToStore }, timezone };
      record.reporting = {
        ...(record.reporting || {}),
        schedule: { ...scheduleToStore },
      };
    }

    if (kpiToStore) {
      record.kpi = { ...kpiToStore };
      record.metrics = { ...record.metrics, kpi: { ...kpiToStore }, currency };
      record.settings = { ...record.settings, kpi: { ...kpiToStore }, timezone };
      const reporting = { ...(record.reporting || {}) };
      if (scheduleToStore) {
        reporting.schedule = { ...scheduleToStore };
      }
      reporting.kpi = { ...kpiToStore };
      record.reporting = reporting;
    }

    record.updated_at = nowIso;
    record.updated_by = session.userId || null;
    if (!isUpdate || !record.created_at) {
      record.created_at = record.created_at || nowIso;
    }

    try {
      await this.storage.putJson('DB', projectKey, record);
    } catch (error) {
      console.error('Failed to persist project record', projectKey, error);
      return { ok: false, error: 'storage_failed', detail: error?.message || String(error) };
    }

    this.queueLog({
      kind: 'project',
      status: isUpdate ? 'updated' : 'created',
      project_key: projectKey,
      user_id: session.userId,
      timezone,
    });

    return {
      ok: true,
      key: projectKey,
      record,
      schedule: scheduleToStore || null,
      kpi: kpiToStore || null,
      action: isUpdate ? 'updated' : 'created',
      previous: previousRecord,
    };
  }

  async handleScheduleSessionInput({ session, message, text }) {
    await this.sendReply(
      message,
      'Используйте кнопки редактора расписания под сообщением. Для отмены нажмите «↩️ Назад» или /cancel.',
    );
    return { handled: true };
  }

  buildScheduleEditorKeyboard(base, session) {
    const mode = session?.scheduleMode || 'main';
    const draft = session?.scheduleDraft || {};

    if (mode === 'periods') {
      const rows = [];
      for (const option of SCHEDULE_PERIOD_OPTIONS) {
        rows.push([
          {
            text: `${option.label}${draft.periods?.includes(option.value) ? ' ✅' : ''}`,
            callback_data: `${base}:schedule:periods:toggle:${option.value}`,
          },
        ]);
      }
      rows.push([
        { text: '🧹 Очистить', callback_data: `${base}:schedule:periods:clear` },
        { text: '↩️ Назад', callback_data: `${base}:schedule:back` },
      ]);
      rows.push([{ text: '✅ Сохранить', callback_data: `${base}:schedule:save` }]);
      return { inline_keyboard: rows };
    }

    if (mode === 'times') {
      const rows = [];
      for (let i = 0; i < SCHEDULE_TIME_OPTIONS.length; i += 3) {
        rows.push(
          SCHEDULE_TIME_OPTIONS.slice(i, i + 3).map((time) => ({
            text: `${time}${draft.times?.includes(time) ? ' ✅' : ''}`,
            callback_data: `${base}:schedule:times:toggle:${time}`,
          })),
        );
      }
      rows.push([
        { text: '🧹 Очистить', callback_data: `${base}:schedule:times:clear` },
        { text: '↩️ Назад', callback_data: `${base}:schedule:back` },
      ]);
      rows.push([{ text: '✅ Сохранить', callback_data: `${base}:schedule:save` }]);
      return { inline_keyboard: rows };
    }

    if (mode === 'timezone') {
      const rows = [];
      const baseChoices = [draft.timezone, this.config.defaultTimezone, 'Asia/Tashkent', 'Asia/Almaty', 'Europe/Moscow', 'UTC']
        .filter(Boolean)
        .map((value) => String(value));
      const unique = Array.from(new Set(baseChoices));
      for (let i = 0; i < unique.length; i += 2) {
        rows.push(
          unique.slice(i, i + 2).map((value) => ({
            text: `${value}${draft.timezone === value ? ' ✅' : ''}`,
            callback_data: `${base}:schedule:timezone:set:${encodeURIComponent(value)}`,
          })),
        );
      }
      rows.push([
        { text: '↩️ Назад', callback_data: `${base}:schedule:back` },
      ]);
      rows.push([{ text: '✅ Сохранить', callback_data: `${base}:schedule:save` }]);
      return { inline_keyboard: rows };
    }

    if (mode === 'cadence') {
      const rows = [];
      for (const option of SCHEDULE_CADENCE_OPTIONS) {
        rows.push([
          {
            text: `${option.label}${draft.cadence === option.value ? ' ✅' : ''}`,
            callback_data: `${base}:schedule:cadence:set:${option.value}`,
          },
        ]);
      }
      rows.push([
        { text: '↩️ Назад', callback_data: `${base}:schedule:back` },
      ]);
      rows.push([{ text: '✅ Сохранить', callback_data: `${base}:schedule:save` }]);
      return { inline_keyboard: rows };
    }

    const keyboard = { inline_keyboard: [] };
    keyboard.inline_keyboard.push([
      { text: '🗓️ Периоды', callback_data: `${base}:schedule:periods` },
      { text: '⏰ Время', callback_data: `${base}:schedule:times` },
    ]);
    keyboard.inline_keyboard.push([
      { text: '🌍 Таймзона', callback_data: `${base}:schedule:timezone` },
      { text: '🔁 Частота', callback_data: `${base}:schedule:cadence` },
    ]);
    keyboard.inline_keyboard.push([
      {
        text: draft.quietWeekends ? '🔔 Включить выходные' : '🤫 Тихие выходные',
        callback_data: `${base}:schedule:quiet:toggle`,
      },
    ]);
    if (session?.scheduleSuggestion) {
      keyboard.inline_keyboard.push([{ text: '♻️ Подставить рекомендации', callback_data: `${base}:schedule:apply` }]);
    }
    keyboard.inline_keyboard.push([
      { text: '✅ Сохранить', callback_data: `${base}:schedule:save` },
      { text: '↩️ Отмена', callback_data: `${base}:schedule:cancel` },
    ]);
    keyboard.inline_keyboard.push([
      { text: '⬅️ К проекту', callback_data: `${base}:open` },
      { text: '🎯 KPI', callback_data: `${base}:kpi` },
    ]);
    return keyboard;
  }

  async renderScheduleEditor(message, { chatId, base, session, context }) {
    if (!session) {
      return;
    }

    if (!session.scheduleDraft) {
      const current = extractScheduleSettings(context.rawProject) || {};
      const defaultTimezone = this.config.defaultTimezone || context.project?.timezone || DEFAULT_TIMEZONE_FALLBACK;
      session.scheduleDraft = normalizeScheduleDraft(current, {
        defaultTimezone,
      });
    }
    if (!session.scheduleSuggestion && context.scheduleSuggestion) {
      session.scheduleSuggestion = normalizeScheduleDraft(context.scheduleSuggestion, {
        defaultTimezone: this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK,
      });
    }
    if (!session.scheduleMode) {
      session.scheduleMode = 'main';
    }

    await this.saveAdminSession(session);

    const draft = session.scheduleDraft || {};
    const lines = ['<b>Редактор расписания</b>', ...describeScheduleDraft(draft, { timezone: this.config.defaultTimezone })];
    if (session.scheduleSuggestion) {
      lines.push('', '<b>Рекомендация</b>', ...describeScheduleDraft(session.scheduleSuggestion, { timezone: this.config.defaultTimezone }));
    }

    if (session.scheduleMode === 'main') {
      lines.push('', 'Выберите блок для изменения.');
    } else if (session.scheduleMode === 'periods') {
      lines.push('', 'Отметьте периоды, которые войдут в отчёты.');
    } else if (session.scheduleMode === 'times') {
      lines.push('', 'Выберите время отправки отчётов.');
    } else if (session.scheduleMode === 'timezone') {
      lines.push('', 'Выберите часовой пояс, в котором считать расписание.');
    } else if (session.scheduleMode === 'cadence') {
      lines.push('', 'Выберите частоту отправки отчётов.');
    }

    const replyMarkup = this.buildScheduleEditorKeyboard(base, session);
    await this.renderAdminMessage(message, {
      chatId,
      text: lines.join('\n'),
      reply_markup: replyMarkup,
    });
  }

  async saveScheduleDraftFromSession(session, { context, userId, base, message, chatId }) {
    const projectKey = session.projectKey;
    if (!projectKey) {
      return { ok: false, reason: 'project_missing' };
    }

    let raw = await this.storage.getJson('DB', projectKey);
    if (!raw || typeof raw !== 'object') {
      raw = {};
    }

    applyProjectIdentity(raw, session.projectSnapshot);

    const draft = session.scheduleDraft || normalizeScheduleDraft(extractScheduleSettings(context.rawProject) || {}, {
      defaultTimezone: this.config.defaultTimezone,
    });

    const storedSchedule = {};
    if (draft.cadence) {
      storedSchedule.cadence = draft.cadence;
    }
    if (Array.isArray(draft.times) && draft.times.length > 0) {
      storedSchedule.times = Array.from(new Set(draft.times)).sort();
    }
    if (Array.isArray(draft.periods) && draft.periods.length > 0) {
      storedSchedule.periods = Array.from(new Set(draft.periods));
    }
    if (draft.timezone) {
      storedSchedule.timezone = draft.timezone;
    }
    if (typeof draft.quietWeekends === 'boolean') {
      storedSchedule.quietWeekends = draft.quietWeekends;
      storedSchedule.quiet_weekends = draft.quietWeekends;
      storedSchedule.mute_weekends = draft.quietWeekends;
    }

    const now = new Date().toISOString();
    raw.schedule = { ...storedSchedule };
    raw.settings = raw.settings || {};
    raw.settings.schedule = { ...storedSchedule };
    raw.reporting = raw.reporting || {};
    raw.reporting.schedule = { ...storedSchedule };
    raw.updated_at = now;
    if (userId) {
      raw.updated_by = userId;
    }

    await this.storage.putJson('DB', projectKey, raw);
    await this.clearAdminSession(userId);

    const lines = [
      '<b>Расписание сохранено</b>',
      ...formatScheduleLines(storedSchedule, { timezone: this.config.defaultTimezone }),
      '',
      'Настройки можно скорректировать повторно в любой момент.',
    ];

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '⬅️ К проекту', callback_data: `${base}:open` },
          { text: '🎯 KPI', callback_data: `${base}:kpi` },
        ],
      ],
    };

    await this.renderAdminMessage(message, { chatId, text: lines.join('\n'), reply_markup: replyMarkup });
    this.queueLog({
      kind: 'admin_session',
      status: 'saved',
      session_kind: session.kind,
      user_id: userId,
      project_key: projectKey,
    });

    return { ok: true, storedSchedule };
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

      const timezone = schedule.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
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

          const portalUrl = await this.buildProjectPortalLink(project, { rawProject });
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
                reply_markup: buildProjectReportKeyboard(`admin:project:${baseCallbackId}`, { portalUrl }),
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
      const autopauseConfig = extractAutopauseSettings(rawProject);
      let autopauseState = await this.readAutopauseState(projectKey);
      if (!alerts) {
        continue;
      }

      const schedule = extractScheduleSettings(rawProject) || {};
      const timezone = schedule.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
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
          const fingerprint = signals.fingerprint || '';
          const hasIssues = signals.isCritical && fingerprint;

          if (hasIssues) {
            const billingState = state.billing || {};
            if (billingState.fingerprint !== fingerprint) {
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
                fingerprint,
                notifiedAt: new Date().toISOString(),
              };
              stateChanged = true;
            }
          } else if (state.billing && state.billing.fingerprint) {
            state.billing = { fingerprint: '', clearedAt: new Date().toISOString() };
            stateChanged = true;
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

            const autopThreshold = Number.isFinite(autopauseConfig?.thresholdDays)
              ? autopauseConfig.thresholdDays
              : 3;

            if (
              exceeded &&
              autopauseConfig?.enabled &&
              autopauseConfig.allowAuto !== false &&
              !autopauseConfig.manualOnly &&
              this.metaService &&
              streak >= autopThreshold
            ) {
              const lastAutoDate = autopauseState?.lastAutoDate || autopauseState?.lastAttemptDate || null;
              if (lastAutoDate !== localDateIso) {
                try {
                  const result = await this.applyAutopauseToProject({
                    projectKey,
                    project,
                    rawProject,
                    account,
                    report,
                    reason: 'kpi_overrun',
                    baseCallbackId,
                    adminTargets,
                    notifyAdmins: true,
                  });

                  autopauseState = await this.readAutopauseState(projectKey);
                  autopauseState.lastAutoDate = localDateIso;
                  autopauseState.lastAttemptDate = localDateIso;
                  autopauseState.lastAttemptResult = result.ok
                    ? `поставлено ${result.paused.length}`
                    : result.reason || 'без изменений';
                  autopauseState.lastReason = result.reason || 'kpi_overrun';
                  await this.writeAutopauseState(projectKey, autopauseState);
                } catch (error) {
                  console.error('Autopause apply failed', projectKey, error);
                }
              }
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

    const chatType = message?.chat?.type ?? '';
    const isGroupChat = GROUP_CHAT_TYPES.has(String(chatType));
    const chatId = normalizeTelegramId(message?.chat?.id);
    const threadId = normalizeThreadIdValue(message?.message_thread_id);

    if (isGroupChat) {
      if (commandName !== 'register') {
        this.queueLog({
          kind: 'command',
          name: commandName,
          status: 'ignored',
          reason: 'group_command_blocked',
          chat_id: chatId ?? message?.chat?.id ?? null,
          thread_id: threadId || null,
        });
        return { handled: false, reason: 'group_command_blocked' };
      }

      const alreadyRegistered = await this.isChatRegistered(chatId, threadId);
      if (alreadyRegistered) {
        this.queueLog({
          kind: 'command',
          name: commandName,
          status: 'ignored',
          reason: 'group_already_registered',
          chat_id: chatId ?? message?.chat?.id ?? null,
          thread_id: threadId || null,
        });
        return { handled: false, reason: 'group_chat_registered' };
      }
    }

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

  async renderAdminMessage(message, payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const {
      chatId = null,
      text = '',
      parse_mode = 'HTML',
      disable_web_page_preview = true,
      reply_markup = undefined,
    } = payload;

    if (!text) {
      return null;
    }

    const base = {
      text,
      parse_mode,
      disable_web_page_preview,
      reply_markup,
    };

    if (message?.chat?.id && message?.message_id) {
      try {
        await this.telegram.editMessageText({
          chat_id: message.chat.id,
          message_id: message.message_id,
          ...base,
        });
        return { mode: 'edit' };
      } catch (error) {
        console.warn('Failed to edit admin message', error);
      }
    }

    const targetChatId = chatId ?? message?.chat?.id ?? null;
    if (!targetChatId) {
      throw new Error('chat_id is required for admin message');
    }

    await this.sendMessageWithFallback({ chat_id: targetChatId, ...base }, message);
    return { mode: 'send' };
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

  async applyAutopauseToProject({
    projectKey,
    project,
    rawProject,
    account,
    report = null,
    reason = 'manual',
    baseCallbackId = null,
    adminTargets = [],
    notifyAdmins = false,
    userId = null,
  }) {
    const autopause = extractAutopauseSettings(rawProject);
    if (!autopause.enabled) {
      return { ok: false, reason: 'disabled', autopause };
    }

    if (reason !== 'manual' && autopause.manualOnly) {
      return { ok: false, reason: 'manual_only', autopause };
    }

    if (!this.metaService) {
      return { ok: false, reason: 'meta_unavailable', autopause };
    }

    const schedule = extractScheduleSettings(rawProject) || {};
    const timezone = schedule.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
    const campaignFilter = extractReportCampaignFilter(rawProject);
    const kpi = extractProjectKpi(rawProject);
    const kpiTarget = Number.isFinite(kpi?.cpa)
      ? kpi.cpa
      : Number.isFinite(kpi?.cpl)
      ? kpi.cpl
      : null;

    let accountReport = report;
    if (!accountReport) {
      try {
        accountReport = await this.metaService.fetchAccountReport({
          project,
          account,
          preset: 'week',
          timezone,
          campaignIds: campaignFilter,
        });
      } catch (error) {
        return { ok: false, reason: 'report_failed', error, autopause };
      }
    }

    const candidates = selectAutopauseCandidates({
      campaigns: accountReport?.campaigns || [],
      kpiTarget,
      limit: 6,
    });

    if (candidates.length === 0) {
      return { ok: false, reason: 'no_candidates', autopause };
    }

    let pauseResult;
    try {
      pauseResult = await this.metaService.pauseCampaigns({
        campaignIds: candidates.map((item) => item.id),
      });
    } catch (error) {
      return { ok: false, reason: 'meta_error', error, autopause };
    }

    const paused = pauseResult.paused || [];
    const failed = pauseResult.failed || [];
    const nowIso = new Date().toISOString();

    let stored = null;
    try {
      stored = (await this.storage.getJson('DB', projectKey)) || {};
    } catch (error) {
      stored = {};
    }

    if (!stored || typeof stored !== 'object') {
      stored = {};
    }

    const storedAutopause =
      stored.autopause && typeof stored.autopause === 'object' ? { ...stored.autopause } : {};

    storedAutopause.enabled = autopause.enabled;
    storedAutopause.manual_only = autopause.manualOnly;
    storedAutopause.threshold_days = autopause.thresholdDays;
    storedAutopause.last_triggered_at = nowIso;
    storedAutopause.last_reason = reason;
    storedAutopause.last_campaign_ids = paused;
    storedAutopause.last_campaigns = candidates.map((item) => ({
      id: item.id,
      name: item.name,
      reason: item.reason,
    }));

    stored.autopause = storedAutopause;
    stored.updated_at = nowIso;
    if (userId) {
      stored.updated_by = userId;
    }

    await this.storage.putJson('DB', projectKey, stored);

    const autopauseState = await this.readAutopauseState(projectKey);
    autopauseState.lastTriggeredAt = nowIso;
    autopauseState.lastReason = reason;
    autopauseState.lastPausedIds = paused;
    autopauseState.lastFailed = failed;
    autopauseState.lastCandidates = candidates;
    await this.writeAutopauseState(projectKey, autopauseState);

    if (notifyAdmins && baseCallbackId) {
      const lines = [
        '⏸ <b>Автопауза кампаний</b>',
        `<b>${escapeHtml(project.name)}</b> — приостановлены кампании по причине ${escapeHtml(reason)}.`,
      ];

      if (paused.length > 0) {
        lines.push('', 'Поставлены на паузу:');
        for (const entry of candidates) {
          if (!paused.includes(entry.id)) {
            continue;
          }
          lines.push(`• <b>${escapeHtml(entry.name)}</b> — ${escapeHtml(entry.reason)}`);
        }
      }

      if (failed.length > 0) {
        lines.push('', 'Не удалось остановить:');
        for (const entry of failed) {
          lines.push(`• ${escapeHtml(entry.id)} — ${escapeHtml(entry.error || 'ошибка')}`);
        }
      }

      const extraRows = [[{ text: '⬅️ К проекту', callback_data: `admin:project:${baseCallbackId}:open` }]];

      await this.sendProjectAlert({
        project,
        baseCallbackId,
        text: lines.join('\n'),
        extraRows,
        adminTargets,
        kind: 'autopause',
      });
    }

    return {
      ok: paused.length > 0,
      paused,
      failed,
      candidates,
      autopause: storedAutopause,
      reason,
    };
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

  async saveReportPreview(projectKey, preview, { merge = false } = {}) {
    if (!projectKey || !preview) {
      return null;
    }

    const state = await this.readReportState(projectKey);
    const base = merge && state.latest && typeof state.latest === 'object' ? state.latest : {};
    const savedAt = merge && base.saved_at ? base.saved_at : new Date().toISOString();
    state.latest = {
      ...base,
      ...preview,
      saved_at: savedAt,
    };
    await this.writeReportState(projectKey, state);
    return state.latest;
  }

  async loadReportPreview(projectKey) {
    if (!projectKey) {
      return null;
    }

    const state = await this.readReportState(projectKey);
    return state.latest || null;
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

  async readAutopauseState(projectKey) {
    if (!projectKey) {
      return {};
    }
    const key = `${AUTOPAUSE_STATE_PREFIX}${projectKey}`;
    const state = await this.storage.getJson('DB', key);
    if (!state || typeof state !== 'object') {
      return {};
    }
    return state;
  }

  async writeAutopauseState(projectKey, state) {
    if (!projectKey) {
      return false;
    }
    const key = `${AUTOPAUSE_STATE_PREFIX}${projectKey}`;
    return this.storage.putJson('DB', key, state || {});
  }

  async buildAdminPanelPayload({ forceMetaRefresh = false, adminId = null, chatId = null, threadId = null } = {}) {
    const metaPromise = this.metaService
      ? forceMetaRefresh
        ? this.metaService.refreshOverview()
        : this.metaService.ensureOverview({
            backgroundRefresh: true,
            executionContext: this.executionContext,
          })
      : this.storage.readMetaStatus();

    const [metaResult, chatKeys, projectKeys, webhookStatus] = await Promise.all([
      metaPromise,
      this.storage.listKeys('DB', CHAT_KEY_PREFIX, 100),
      this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 100),
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

    const projectSummaryResult = buildProjectSummaries(projectRecords, metaStatus, {
      timezone: this.config.defaultTimezone,
    });
    const projectSummaries = projectSummaryResult.items;
    const visibleProjectSummaries = projectSummaries.filter((item) => !item?.placeholder);
    const placeholderCount = projectSummaryResult.placeholderCount || 0;
    const placeholdersShown = projectSummaryResult.placeholdersShown || 0;

    const dashboard = renderAdminDashboard({
      metaStatus,
      projectSummaries: visibleProjectSummaries,
      webhook: webhookStatus,
      totals: { projects: projectKeys.length, chats: chatKeys.length },
      timezone: this.config.defaultTimezone,
      placeholderCount,
      placeholdersShown,
    });

    const summary = [dashboard];

    if (projectKeys.length > projectRecords.length) {
      summary.push(
        '',
        `Показаны первые ${projectRecords.length} проектов из ${projectKeys.length}. Откройте раздел «Проекты» для полного списка.`,
      );
    }

    if (placeholderCount > placeholdersShown) {
      summary.push(
        '',
        `Аккаунтов Meta без проекта: показано ${placeholdersShown} из ${placeholderCount}. Загляните в раздел «Новые РК».`,
      );
    }

    let authButton = { text: '🔐 Авторизоваться в Facebook', callback_data: 'admin:fb:auth' };
    if (adminId) {
      const session = await this.createMetaOAuthSession({
        adminId,
        chatId,
        threadId,
      });
      if (session?.link) {
        authButton = { text: '🔐 Авторизоваться в Facebook', url: session.link };
      }
    }

    const inlineKeyboard = [
      [authButton, { text: '➕ Подключить проект', callback_data: 'admin:project:connect' }],
      [
        { text: '📁 Проекты', callback_data: 'admin:projects' },
        { text: '🆕 Новые РК', callback_data: 'admin:projects:new' },
      ],
    ];

    inlineKeyboard.push([
      { text: '🔄 Обновиться', callback_data: 'admin:refresh' },
      { text: '🔁 Вебхук', callback_data: 'admin:webhook:refresh' },
    ]);

    const replyMarkup = { inline_keyboard: inlineKeyboard };

    return {
      text: summary.join('\n'),
      reply_markup: replyMarkup,
      placeholders: projectSummaryResult.placeholders || [],
      projectSummaries: visibleProjectSummaries,
    };
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
        portalTokens: [],
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
      if (data.startsWith('admin:project_connect:')) {
        const payload = data.slice('admin:project_connect:'.length);
        const parts = payload.split(':');
        const action = parts[0] || '';
        const session = await this.loadAdminSession(userId);

        if (!session || session.kind !== 'project_connect') {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Сессия подключения не найдена. Нажмите «Подключить проект» ещё раз.',
            show_alert: true,
          });
          return { handled: false, reason: 'project_connect_session_missing' };
        }

        let shouldUpdate = false;
        let answerText = '';
        let showAlert = false;

        const updatePanel = async () => {
          const text = this.renderProjectConnectPanel(session);
          const replyMarkup = this.buildProjectConnectKeyboard(session);
          await this.renderAdminMessage(message, {
            chatId,
            text,
            reply_markup: replyMarkup,
          });
        };

        switch (action) {
          case 'account': {
            const rawTarget = parts[1] || '';
            const target = rawTarget.startsWith('act_') ? rawTarget : `act_${rawTarget}`;
            const result = this.applyProjectConnectAccount(session, target, { userId });
            if (!result.ok) {
              const messageText = this.describeProjectConnectError(result.error);
              answerText = messageText.replace(/<[^>]+>/g, '');
              showAlert = true;
              break;
            }

            shouldUpdate = true;
            answerText = result.account?.name
              ? `Аккаунт «${result.account.name}» выбран.`
              : 'Рекламный аккаунт выбран.';
            this.queueLog({
              kind: 'admin_session',
              status: 'updated',
              session_kind: 'project_connect',
              user_id: userId,
              action: 'project_connect_account',
              account_id: target,
            });
            break;
          }
          case 'chat': {
            const chatIdPart = parts[1] || '';
            const threadPart = parts[2] || '';
            const chatKey = buildChatKey(chatIdPart, threadPart);
            const entry = Array.isArray(session.chatEntries)
              ? session.chatEntries.find((item) => item && item.key === chatKey)
              : null;
            if (!entry) {
              answerText = 'Чат не найден. Зарегистрируйте его через /register.';
              showAlert = true;
              break;
            }

            const applyResult = this.applyProjectConnectChatEntry(session, entry);
            if (!applyResult.ok) {
              const messageText = this.describeProjectConnectError(applyResult.error || 'chat_required');
              answerText = messageText.replace(/<[^>]+>/g, '');
              showAlert = true;
              break;
            }

            shouldUpdate = true;
            answerText = entry.label
              ? `Чат «${entry.label}» выбран.`
              : 'Чат выбран.';
            this.queueLog({
              kind: 'admin_session',
              status: 'updated',
              session_kind: 'project_connect',
              user_id: userId,
              action: 'project_connect_chat',
              chat_id: entry.chatId,
              thread_id: entry.threadId || '',
            });
            break;
          }
          case 'reuse': {
            if (!session.pendingExisting) {
              answerText = 'Проект для обновления не найден.';
              showAlert = true;
              break;
            }

            const pendingCode = session.pendingExisting.code || session.pendingExistingKey || '';
            let existing = pendingCode ? this.findExistingProjectByCode(session, pendingCode) : null;
            if (!existing && session.draft?.adAccountId) {
              existing = this.findExistingProjectByAccount(session, session.draft.adAccountId);
            }

            if (!existing) {
              answerText = 'Не удалось найти проект. Обновите списки и попробуйте ещё раз.';
              showAlert = true;
              break;
            }

            this.applyExistingProjectToDraft(session, existing, { keepPortalToken: true });
            shouldUpdate = true;
            answerText = existing.record?.name
              ? `Проект «${existing.record.name}» готов к обновлению.`
              : 'Будет обновлена существующая запись.';
            this.queueLog({
              kind: 'admin_session',
              status: 'updated',
              session_kind: 'project_connect',
              user_id: userId,
              action: 'project_connect_reuse',
              project_key: existing.key,
            });
            break;
          }
          case 'page': {
            const target = parts[1] || '';
            const direction = parts[2] || '';
            if (target === 'account') {
              const items = this.getProjectConnectAccountChoices(session, { includeSelected: true }).filter(
                (choice) => choice.available || choice.selected,
              );
              const pageSize =
                Number.isFinite(Number(session.accountPageSize)) && Number(session.accountPageSize) > 0
                  ? Number(session.accountPageSize)
                  : 6;
              const pages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
              let page = Math.max(0, Math.min(Number(session.accountPage) || 0, pages - 1));
              if (direction === 'next') {
                page = Math.min(page + 1, pages - 1);
              } else if (direction === 'prev') {
                page = Math.max(page - 1, 0);
              } else if (/^\d+$/.test(direction)) {
                page = Math.max(0, Math.min(Number(direction), pages - 1));
              }
              session.accountPage = page;
              shouldUpdate = true;
              answerText = 'Страница аккаунтов изменена.';
            } else if (target === 'chat') {
              const items = this.getProjectConnectChatChoices(session, { includeSelected: true }).filter(
                (choice) => choice.available || choice.selected,
              );
              const pageSize =
                Number.isFinite(Number(session.chatPageSize)) && Number(session.chatPageSize) > 0
                  ? Number(session.chatPageSize)
                  : 6;
              const pages = Math.max(1, Math.ceil(items.length / pageSize) || 1);
              let page = Math.max(0, Math.min(Number(session.chatPage) || 0, pages - 1));
              if (direction === 'next') {
                page = Math.min(page + 1, pages - 1);
              } else if (direction === 'prev') {
                page = Math.max(page - 1, 0);
              } else if (/^\d+$/.test(direction)) {
                page = Math.max(0, Math.min(Number(direction), pages - 1));
              }
              session.chatPage = page;
              shouldUpdate = true;
              answerText = 'Страница чатов изменена.';
            } else {
              answerText = 'Страница недоступна.';
            }
            break;
          }
          case 'refresh': {
            session.accountPage = 0;
            session.chatPage = 0;
            await this.populateProjectConnectSession(session, { forceRefreshMeta: true });
            this.refreshProjectConnectSuggestions(session);
            shouldUpdate = true;
            answerText = 'Данные Meta и список чатов обновлены.';
            this.queueLog({
              kind: 'admin_session',
              status: 'updated',
              session_kind: 'project_connect',
              user_id: userId,
              action: 'project_connect_refresh',
            });
            break;
          }
          case 'save': {
            this.refreshProjectConnectSuggestions(session);
            const result = await this.finishProjectConnectSession(session);
            if (!result.ok) {
              const messageText = this.describeProjectConnectError(result.error, result.detail);
              answerText = messageText.replace(/<[^>]+>/g, '');
              showAlert = true;
              break;
            }

            await this.clearAdminSession(userId);

            const record = result.record;
            const accountId = record.meta_account_id || record.ad_account_id || session.draft?.adAccountId || '';
            const chatInfo = record.chat || {};
            const threadId = chatInfo.thread_id || chatInfo.threadId || '';
            const lines = [
              result.action === 'updated' ? '<b>Проект обновлён</b>' : '<b>Проект подключён</b>',
              `Код: <code>${escapeHtml(record.code)}</code>`,
            ];
            if (accountId) {
              lines.push(`Аккаунт: <code>act_${escapeHtml(String(accountId))}</code>`);
            }
            if (chatInfo.id) {
              lines.push(
                `Чат: <code>${escapeHtml(chatInfo.id)}</code>${
                  threadId ? ` / <code>${escapeHtml(String(threadId))}</code>` : ''
                }`,
              );
            }
            lines.push(
              result.action === 'updated'
                ? 'Данные проекта обновлены. Проверьте карточку в админ-панели.'
                : 'Проект готов. Настройте KPI и отчёты в карточке проекта.',
            );

            const successMarkup = {
              inline_keyboard: [[{ text: '⬅️ К админке', callback_data: 'admin:panel' }]],
            };

            await this.renderAdminMessage(message, {
              chatId,
              text: lines.join('\n'),
              reply_markup: successMarkup,
            });

            await this.notifyProjectCreated(record, {
              initiator: userId,
              sourceChatId: chatId,
              action: result.action,
              previous: result.previous || null,
            });

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: result.action === 'updated' ? 'Проект обновлён.' : 'Проект подключён.',
            });

            this.queueLog({
              kind: 'admin_session',
              status: 'saved',
              session_kind: 'project_connect',
              user_id: userId,
              action: result.action === 'updated' ? 'project_connect_update' : 'project_connect_create',
              project_key: record.key || null,
            });

            return { handled: true };
          }
          case 'cancel': {
            await this.clearAdminSession(userId);
            if (message?.chat?.id && message?.message_id) {
              try {
                await this.telegram.editMessageText({
                  chat_id: message.chat.id,
                  message_id: message.message_id,
                  text: '🛑 Сессия подключения отменена.',
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                });
              } catch (error) {
                console.warn('Failed to edit cancelled project connect message', error);
              }
            }
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Сессия подключения отменена.',
            });
            this.queueLog({
              kind: 'admin_session',
              status: 'cancelled',
              session_kind: 'project_connect',
              user_id: userId,
              action: 'project_connect_cancel',
            });
            return { handled: true };
          }
          case 'noop': {
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Выберите пункт меню.' });
            return { handled: true };
          }
          default: {
            answerText = 'Действие не поддерживается.';
            showAlert = true;
            break;
          }
        }

        if (shouldUpdate) {
          await this.populateProjectConnectSession(session);
          this.refreshProjectConnectSuggestions(session);
          await this.saveAdminSession(session);
          await updatePanel();
        } else {
          await this.saveAdminSession(session);
        }

        await this.telegram.answerCallbackQuery({
          callback_query_id: id,
          text: answerText || 'Готово.',
          show_alert: showAlert,
        });

        return { handled: true };
      }

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

        await this.renderAdminMessage(message, {
          chatId,
          text: `${body.join('\n')}\n\n${escapeHtml(session.link)}`,
          reply_markup: replyMarkup,
        });

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

      if (data.startsWith('admin:new:connect:')) {
        if (!this.config.isProjectManager(userId)) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: '⛔ У вас нет прав для подключения проектов.',
            show_alert: true,
          });
          this.queueLog({
            kind: 'callback',
            status: 'forbidden',
            data,
            chat_id: chatId,
            user_id: userId,
            action: 'project_connect_forbidden',
          });
          return { handled: false, reason: 'project_connect_forbidden' };
        }

        const accountToken = data.slice('admin:new:connect:'.length).trim();
        if (!accountToken) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить рекламный кабинет.',
            show_alert: true,
          });
          return { handled: false, reason: 'account_missing' };
        }

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
            console.warn('Failed to load Meta overview for quick connect', error);
          }
        } else {
          const status = await this.storage.readMetaStatus();
          accounts = Array.isArray(status?.facebook?.adAccounts) ? status.facebook.adAccounts : [];
        }

        const session = await this.startProjectConnectSession({
          userId,
          chatId,
          threadId: message?.message_thread_id ?? null,
          accounts,
          preferredAccountId: accountToken,
        });

        if (!session) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось открыть форму. Попробуйте ещё раз.',
            show_alert: true,
          });
          return { handled: false, reason: 'project_connect_session_failed' };
        }

        const body = this.renderProjectConnectPanel(session);
        const replyMarkup = this.buildProjectConnectKeyboard(session);

        await this.renderAdminMessage(message, {
          chatId,
          text: body,
          reply_markup: replyMarkup,
        });

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Форма подключения открыта.' });
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

      if (data === 'admin:project:connect') {
        if (!this.config.isProjectManager(userId)) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: '⛔ У вас нет прав для подключения проектов.',
            show_alert: true,
          });
          this.queueLog({
            kind: 'callback',
            status: 'forbidden',
            data,
            chat_id: chatId,
            user_id: userId,
            action: 'project_connect_forbidden',
          });
          return { handled: false, reason: 'project_connect_forbidden' };
        }

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

        const session = await this.startProjectConnectSession({
          userId,
          chatId,
          threadId: message?.message_thread_id ?? null,
          accounts,
        });

        if (!session) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось открыть форму. Попробуйте ещё раз.',
            show_alert: true,
          });
          return { handled: false, reason: 'project_connect_session_failed' };
        }

        const body = this.renderProjectConnectPanel(session);
        const replyMarkup = this.buildProjectConnectKeyboard(session);

        await this.renderAdminMessage(message, {
          chatId,
          text: body,
          reply_markup: replyMarkup,
        });

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
        const projectRecords = await Promise.all(
          projectKeys.map(async (key) => {
            try {
              const data = await this.storage.getJson('DB', key);
              return normalizeProjectRecord(key, data);
            } catch (error) {
              console.warn('Failed to load project for list', key, error);
              return normalizeProjectRecord(key, null);
            }
          }),
        );

        let metaStatus = await this.storage.readMetaStatus();
        if (this.metaService) {
          try {
            const ensure = await this.metaService.ensureOverview({
              backgroundRefresh: true,
              executionContext: this.executionContext,
            });
            metaStatus = ensure?.status ?? metaStatus;
          } catch (error) {
            console.warn('Failed to refresh Meta overview for project list', error);
          }
        }

        const summaryResult = buildProjectSummaries(projectRecords, metaStatus, {
          timezone: this.config.defaultTimezone,
        });
        const items = summaryResult.items.filter((item) => !item.placeholder);
        const buttons = [];
        for (const item of items) {
          const chatLabel = item.chatTitle ? ` · ${truncateLabel(item.chatTitle, 18)}` : '';
          const label = truncateLabel(`${item.title}${chatLabel}`, 32);
          buttons.push({
            text: label,
            callback_data: `admin:project:${item.callbackId}:open`,
          });
        }

        const keyboard = chunkArray(buttons, 2);
        keyboard.push([{ text: '⬅️ К админке', callback_data: 'admin:panel' }]);

        const lines = [];
        lines.push('<b>Проекты</b>');
        lines.push(items.length ? 'Выберите проект для просмотра.' : 'Проекты пока не подключены.');

        await this.renderAdminMessage(message, {
          chatId,
          text: lines.join('\n'),
          reply_markup: { inline_keyboard: keyboard },
        });

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Проекты отображены.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data === 'admin:projects:new') {
        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 50);
        const projectRecords = await Promise.all(
          projectKeys.map(async (key) => {
            try {
              const data = await this.storage.getJson('DB', key);
              return normalizeProjectRecord(key, data);
            } catch (error) {
              console.warn('Failed to load project for new accounts list', key, error);
              return normalizeProjectRecord(key, null);
            }
          }),
        );

        let metaStatus = await this.storage.readMetaStatus();
        if (this.metaService) {
          try {
            const ensure = await this.metaService.ensureOverview({
              backgroundRefresh: true,
              executionContext: this.executionContext,
            });
            metaStatus = ensure?.status ?? metaStatus;
          } catch (error) {
            console.warn('Failed to refresh Meta overview for new accounts list', error);
          }
        }

        const summaryResult = buildProjectSummaries(projectRecords, metaStatus, {
          timezone: this.config.defaultTimezone,
        });

        const placeholders = Array.isArray(summaryResult.placeholders)
          ? summaryResult.placeholders
          : [];

        const buttons = [];
        for (const item of placeholders) {
          const label = truncateLabel(item.title || item.accountId || 'Рекламный аккаунт', 32);
          const accountToken = item.accountId || item.id || item.callbackId;
          buttons.push({
            text: `➕ ${label}`,
            callback_data: `admin:new:connect:${accountToken}`,
          });
        }

        if (buttons.length === 0) {
          buttons.push({ text: '✅ Все кабинеты подключены', callback_data: 'admin:panel' });
        }

        const keyboard = chunkArray(buttons, 1);
        keyboard.push([{ text: '⬅️ К админке', callback_data: 'admin:panel' }]);

        const lines = [];
        lines.push('<b>Новые рекламные кабинеты</b>');
        lines.push(
          placeholders.length
            ? 'Выберите кабинет, чтобы начать подключение проекта.'
            : 'Свободных кабинетов Meta не осталось — все проекты подключены.',
        );

        await this.renderAdminMessage(message, {
          chatId,
          text: lines.join('\n'),
          reply_markup: { inline_keyboard: keyboard },
        });

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Список кабинетов обновлён.' });
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
          const panel = await this.buildAdminPanelPayload({
            adminId: userId,
            chatId: message?.chat?.id ?? chatId,
            threadId: message?.message_thread_id ?? null,
          });
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

        const panel = await this.buildAdminPanelPayload({
          forceMetaRefresh: true,
          adminId: userId,
          chatId: message?.chat?.id ?? chatId,
          threadId: message?.message_thread_id ?? null,
        });
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

        const panel = await this.buildAdminPanelPayload({
          adminId: userId,
          chatId,
          threadId: message?.message_thread_id ?? null,
        });
        await this.renderAdminMessage(message, {
          chatId,
          text: panel.text,
          reply_markup: panel.reply_markup,
        });

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

        await this.renderAdminMessage(message, {
          chatId,
          text: body,
        });

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
        const extraAction = parts[5] || '';
        const extraParam = parts[6] || '';
        const base = `admin:project:${projectId}`;

        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат для вывода информации о проекте.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        let context = await this.resolveProjectContext(projectId, {
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
          const portalUrl = await this.buildProjectPortalLink(context.project, {
            rawProject: context.rawProject,
          });
          const replyMarkup = buildProjectDetailKeyboard(base, {
            chatUrl: context.project.chatUrl,
            portalUrl,
          });

          await this.renderAdminMessage(message, {
            chatId,
            text: detail.text,
            reply_markup: replyMarkup,
          });

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

        if (action === 'portal') {
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(
              context.project.id || context.project.code || projectId,
            )}`;

          const renderPortalPanel = async () => {
            const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });
            const hasPortal = Boolean(portalUrl);
            const body = ['<b>Клиентский портал</b>'];
            if (hasPortal) {
              body.push('Статус: 🟢 Активен', 'Поделитесь ссылкой с клиентом или отключите доступ при необходимости.');
            } else {
              body.push('Статус: 🔴 Отключён', 'Нажмите «Создать портал», чтобы сгенерировать ссылку для клиента.');
            }

            const rows = [];
            if (hasPortal) {
              rows.push([{ text: '🌐 Перейти в портал', url: portalUrl }]);
              rows.push([
                { text: '♻️ Перегенерировать', callback_data: `${base}:portal:refresh` },
                { text: '🚫 Отключить', callback_data: `${base}:portal:disable` },
              ]);
            } else {
              rows.push([{ text: '✨ Создать портал', callback_data: `${base}:portal:create` }]);
            }
            rows.push([{ text: '⬅️ К проекту', callback_data: `${base}:open` }]);

            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: { inline_keyboard: rows },
            });
          };

          const nowIso = new Date().toISOString();

          if (['create', 'refresh'].includes(subAction)) {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before portal update', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }

            if (!stored.portal || typeof stored.portal !== 'object') {
              stored.portal = {};
            }

            const token = generatePortalToken({});
            const signature = await buildPortalSignature({
              code: context.project?.code || context.project?.id || projectId,
              token,
            });
            stored.portal.token = token;
            stored.portal.enabled = true;
            stored.portal.updated_at = nowIso;
            stored.portal.created_at = stored.portal.created_at || nowIso;
            stored.portal.disabled = false;
            delete stored.portal.disabled_at;
            delete stored.portal.disabledAt;
            if (signature) {
              stored.portal.signature = signature;
            }
            stored.portal_tokens = [token];
            stored.portal_signatures = signature ? [signature] : [];

            if (!stored.tokens || typeof stored.tokens !== 'object') {
              stored.tokens = {};
            }
            stored.tokens.portal = token;
            if (signature) {
              stored.tokens.portal_signature = signature;
            }

            if (!stored.client || typeof stored.client !== 'object') {
              stored.client = {};
            }
            if (!stored.client.billing || typeof stored.client.billing !== 'object') {
              stored.client.billing = {};
            }
            stored.client.billing.status = stored.client.billing.status === 'declined' ? 'active' : stored.client.billing.status || 'active';
            stored.client.billing.portal_disabled = false;
            stored.client.billing.portalDisabled = false;
            stored.client.billing.declined_at = null;

            stored.updated_at = nowIso;
            if (userId) {
              stored.updated_by = userId;
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: subAction === 'refresh' ? 'Портал обновлён.' : 'Портал создан.',
            });

            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: `portal:${subAction}`,
            });

            await renderPortalPanel();
            return { handled: true };
          }

          if (subAction === 'disable') {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before portal disable', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }

            if (!stored.portal || typeof stored.portal !== 'object') {
              stored.portal = {};
            }
            stored.portal.enabled = false;
            stored.portal.disabled = true;
            stored.portal.disabled_at = nowIso;
            delete stored.portal.token;
            delete stored.portal.signature;
            stored.portal_tokens = [];
            stored.portal_signatures = [];

            if (!stored.client || typeof stored.client !== 'object') {
              stored.client = {};
            }
            if (!stored.client.billing || typeof stored.client.billing !== 'object') {
              stored.client.billing = {};
            }
            stored.client.billing.portal_disabled = true;
            stored.client.billing.portalDisabled = true;
            stored.client.billing.status = stored.client.billing.status || 'paused';
            stored.client.billing.declined_at = stored.client.billing.declined_at || nowIso;

            if (stored.tokens && typeof stored.tokens === 'object') {
              delete stored.tokens.portal;
              delete stored.tokens.portal_signature;
            }

            stored.updated_at = nowIso;
            if (userId) {
              stored.updated_by = userId;
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Портал отключён.',
            });

            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: 'portal:disable',
            });

            await renderPortalPanel();
            return { handled: true };
          }

          await renderPortalPanel();
          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Управление порталом.' });
          return { handled: true };
        }

        if (action === 'reports') {
          const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;
          const previewState = await this.loadReportPreview(projectKey);
          const lines = ['<b>Отчёты проекта</b>'];

          if (previewState?.label) {
            const label = escapeHtml(previewState.label);
            const timestamp = previewState.saved_at
              ? formatTimestamp(previewState.saved_at, this.config.defaultTimezone)
              : null;
            lines.push(`Последний отчёт: ${label}${timestamp ? ` • ${escapeHtml(timestamp)}` : ''}`);
          }

          lines.push('Выберите период ниже — бот подготовит цифры и кнопки для отправки клиенту.');

          const hasPreview = Boolean(previewState?.adminText || previewState?.clientText || previewState?.text);
          const canSendToChat = hasPreview && Boolean(context.project.chatId);
          const replyMarkup = buildProjectReportKeyboard(base, {
            portalUrl,
            hasPreview,
            canSendToChat,
            canSendToAdmin: hasPreview,
          });

          await this.renderAdminMessage(message, {
            chatId,
            text: lines.join('\n'),
            reply_markup: replyMarkup,
          });

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Выберите период отчёта.' });
          return { handled: true };
        }

        if (action === 'report') {
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;

          if (subAction === 'send') {
            const target = extraAction || 'chat';
            const previewState = await this.loadReportPreview(projectKey);
            if (!previewState || !previewState.adminText?.length && !previewState.clientText?.length && !previewState.text?.length) {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Нет готового отчёта для отправки. Сначала сформируйте отчёт.',
                show_alert: true,
              });
              return { handled: true };
            }

            const portalUrl = previewState.portalUrl
              ? previewState.portalUrl
              : await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });
            const clientText = previewState.clientText || previewState.text || previewState.adminText;
            const adminText = previewState.adminText || previewState.clientText || previewState.text;

            if (target === 'chat') {
              if (!context.project.chatId) {
                await this.telegram.answerCallbackQuery({
                  callback_query_id: id,
                  text: 'У проекта не указан чат клиента.',
                  show_alert: true,
                });
                return { handled: true };
              }

              const payload = {
                chat_id: context.project.chatId,
                text: clientText,
                parse_mode: 'HTML',
                disable_web_page_preview: false,
              };
              if (context.project.threadId) {
                payload.message_thread_id = Number(context.project.threadId);
              }
              if (portalUrl) {
                payload.reply_markup = { inline_keyboard: [[{ text: '🌐 Портал', url: portalUrl }]] };
              }

              await this.sendMessageWithFallback(payload, message);
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Отправлено в чат клиента.' });

              const nowIso = new Date().toISOString();
              await this.saveReportPreview(projectKey, {
                ...previewState,
                portalUrl,
                last_sent: { target: 'chat', at: nowIso, by: userId },
              }, { merge: true });

              const replyMarkup = buildProjectReportKeyboard(base, {
                portalUrl,
                hasPreview: true,
                canSendToChat: true,
                canSendToAdmin: true,
              });
              await this.renderAdminMessage(message, { chatId, text: adminText, reply_markup: replyMarkup });
              return { handled: true };
            }

            const destinationId = callback?.from?.id ? String(callback.from.id) : null;
            if (!destinationId) {
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Не удалось определить получателя.' });
              return { handled: true };
            }

            const payload = {
              chat_id: destinationId,
              text: adminText,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            };
            if (portalUrl) {
              payload.reply_markup = { inline_keyboard: [[{ text: '🌐 Портал', url: portalUrl }]] };
            }

            await this.sendMessageWithFallback(payload, message);
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Отчёт отправлен в личные сообщения.' });

            const nowIso = new Date().toISOString();
            await this.saveReportPreview(projectKey, {
              ...previewState,
              portalUrl,
              last_sent: { target: 'admin', at: nowIso, by: userId },
            }, { merge: true });

            const replyMarkup = buildProjectReportKeyboard(base, {
              portalUrl,
              hasPreview: true,
              canSendToChat: Boolean(context.project.chatId),
              canSendToAdmin: true,
            });
            await this.renderAdminMessage(message, { chatId, text: adminText, reply_markup: replyMarkup });
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

            await this.renderAdminMessage(message, {
              chatId,
              text: [
                '<b>Пользовательский период отчёта</b>',
                'Отправьте даты в формате <code>YYYY-MM-DD YYYY-MM-DD</code>.',
                'Например: <code>2024-05-01 2024-05-07</code>.',
              ].join('\n'),
            });

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
          const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });

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
              await this.renderAdminMessage(message, {
                chatId,
                text: ['<b>Ошибка при формировании отчёта</b>', escapeHtml(errorMessage)].join('\n'),
              });
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

          const nowIso = new Date().toISOString();
          await this.saveReportPreview(projectKey, {
            adminText: bodyText,
            clientText: preview.text,
            text: preview.text,
            preset,
            range: preview.range || null,
            label: preview.label || formatReportPresetLabel(preset),
            portalUrl,
            generated_at: nowIso,
            generated_by: userId,
          });

          const replyMarkup = buildProjectReportKeyboard(base, {
            portalUrl,
            hasPreview: true,
            canSendToChat: Boolean(context.project.chatId),
            canSendToAdmin: true,
          });

          await this.renderAdminMessage(message, {
            chatId,
            text: bodyText,
            reply_markup: replyMarkup,
          });

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
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;
          const scheduleSettings = extractScheduleSettings(context.rawProject);
          const timezone = scheduleSettings?.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
          const campaignFilter = extractReportCampaignFilter(context.rawProject);
          const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });

          const definitions = [
            { id: 'week', preset: 'week', label: '7 дней' },
            { id: 'yesterday', preset: 'yesterday', label: 'Вчера' },
            { id: 'today', preset: 'today', label: 'Сегодня' },
          ];

          const sections = [];
          const errors = [];

          for (const definition of definitions) {
            let reportData = null;
            if (this.metaService) {
              try {
                reportData = await this.metaService.fetchAccountReport({
                  project: context.project,
                  account: context.account,
                  preset: definition.preset,
                  timezone,
                  campaignIds: campaignFilter,
                });
              } catch (error) {
                errors.push(`${definition.label}: ${error?.message || 'ошибка Meta API'}`);
              }
            }

            const preview = buildProjectReportPreview({
              project: context.project,
              account: context.account,
              rawProject: context.rawProject,
              preset: definition.preset,
              report: reportData,
            });

            sections.push({ definition, preview, label: definition.label });
          }

          const digest = buildDigestPreview({ sections, timezone });

          let adminText = digest.text;
          if (!this.metaService) {
            adminText = `${adminText}\n\n⚠️ Прямая выгрузка Meta недоступна — показаны данные панели.`;
          } else if (errors.length > 0) {
            adminText = `${adminText}\n\n⚠️ Не все периоды удалось обновить:\n${errors
              .map((line) => `• ${escapeHtml(line)}`)
              .join('\n')}`;
          }

          const clientText = digest.text;

          const nowIso = new Date().toISOString();
          await this.saveReportPreview(projectKey, {
            adminText,
            clientText,
            text: clientText,
            preset: 'digest',
            range: null,
            label: 'Сводный отчёт',
            portalUrl,
            generated_at: nowIso,
            generated_by: userId,
            digest: sections.map((section) => ({
              id: section.definition.id,
              label: section.definition.label,
              range: section.preview?.range || null,
            })),
          });

          const replyMarkup = buildProjectReportKeyboard(base, {
            portalUrl,
            hasPreview: true,
            canSendToChat: Boolean(context.project.chatId),
            canSendToAdmin: true,
          });

          await this.renderAdminMessage(message, {
            chatId,
            text: adminText,
            reply_markup: replyMarkup,
          });

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Сводный отчёт готов.' });
          this.queueLog({
            kind: 'callback',
            status: 'ok',
            data,
            chat_id: chatId,
            user_id: userId,
            project_id: context.project.id,
            action: 'report:digest',
          });
          return { handled: true };
        }

        if (action === 'analytics') {
          const account = context.account || {};
          const spendToday = Number.isFinite(account.spendTodayUsd)
            ? formatUsd(account.spendTodayUsd, { digitsBelowOne: 2, digitsAboveOne: 2 })
            : '—';
          const leadsToday = Number.isFinite(account.leadsToday) ? formatInteger(account.leadsToday) : '—';
          const cpaRange = formatCpaRange(account.cpaMinUsd, account.cpaMaxUsd, account.campaignSummaries);
          const campaignsRunning = Number.isFinite(account.runningCampaigns)
            ? formatInteger(account.runningCampaigns)
            : '—';

          const lines = [
            '<b>Аналитика</b>',
            '📊 Показатели за сегодня:',
            `• Расход: ${spendToday}`,
            `• Лиды: ${leadsToday}`,
            cpaRange ? `• CPA (7д): ${cpaRange}` : null,
            `• Активных кампаний: ${campaignsRunning}`,
            '',
            'Выберите действие: посмотреть отчёт, настроить KPI или алерты.',
          ].filter(Boolean);

          const portalUrl = await this.buildProjectPortalLink(context.project, { rawProject: context.rawProject });
          const keyboard = { inline_keyboard: [] };
          if (portalUrl) {
            keyboard.inline_keyboard.push([{ text: '🌐 Открыть портал', url: portalUrl }]);
          }
          keyboard.inline_keyboard.push([
            { text: '📈 Отчёт', callback_data: `${base}:reports` },
            { text: '🎯 KPI', callback_data: `${base}:kpi` },
            { text: '🚨 Алерты', callback_data: `${base}:alerts` },
          ]);
          keyboard.inline_keyboard.push([{ text: '⬅️ К проекту', callback_data: `${base}:open` }]);

          await this.renderAdminMessage(message, { chatId, text: lines.join('\n'), reply_markup: keyboard });
          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Показатели обновлены.' });
          return { handled: true };
        }

        if (action === 'kpi') {
          const expectedProjectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;

          if (subAction === 'edit') {
            const session = await this.startAdminSession({
              userId,
              chatId,
              threadId: message?.message_thread_id ?? null,
              project: context.project,
              kind: 'kpi_edit',
              base,
            });
            if (session) {
              session.projectKey = expectedProjectKey;
              session.kpiMode = 'main';
              session.kpiDraft = null;
              if (context.kpiSuggestion) {
                session.kpiSuggestion = normalizeKpiDraft(context.kpiSuggestion);
              }
              await this.saveAdminSession(session);
              await this.renderKpiEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Редактор KPI открыт.' });
              this.queueLog({
                kind: 'callback',
                status: 'ok',
                data,
                chat_id: chatId,
                user_id: userId,
                project_id: context.project.id,
                action: 'kpi_editor_open',
              });
              return { handled: true };
            }
          }

          const session = userId ? await this.loadAdminSession(userId) : null;
          const ownsSession =
            session &&
            session.kind === 'kpi_edit' &&
            session.projectKey === expectedProjectKey &&
            (!session.projectId || session.projectId === (context.project.id || ''));

          if (subAction === 'save') {
            if (!ownsSession) {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Откройте редактор KPI через кнопку «✏️ Изменить KPI».',
                show_alert: true,
              });
              return { handled: true };
            }

            const result = await this.saveKpiDraftFromSession(session, {
              context,
              userId,
              base,
              message,
              chatId,
            });
            if (result.ok) {
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'KPI сохранены.' });
            } else {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Не удалось сохранить KPI. Повторите попытку.',
                show_alert: true,
              });
            }
            return { handled: true };
          }

          if (subAction === 'cancel') {
            if (ownsSession) {
              await this.clearAdminSession(userId);
            }
            const kpi = extractProjectKpi(context.rawProject);
            const body = ['<b>KPI проекта</b>', ...formatKpiLines(kpi)];
            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✏️ Изменить KPI', callback_data: `${base}:kpi:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Изменения отменены.' });
            return { handled: true };
          }

          if (subAction === 'field' && ownsSession) {
            session.kpiMode = `field:${extraAction || ''}`;
            await this.renderKpiEditor(message, { chatId, base, session, context });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Выберите значение.' });
            return { handled: true };
          }

          if (subAction === 'back' && ownsSession) {
            session.kpiMode = 'main';
            await this.renderKpiEditor(message, { chatId, base, session, context });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'К параметрам KPI.' });
            return { handled: true };
          }

          if (subAction === 'apply' && ownsSession) {
            if (session.kpiSuggestion) {
              session.kpiDraft = normalizeKpiDraft(session.kpiSuggestion);
              session.kpiMode = 'main';
              await this.renderKpiEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Рекомендации подставлены.' });
            } else {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Нет подготовленных рекомендаций.',
                show_alert: true,
              });
            }
            return { handled: true };
          }

          if (subAction === 'objective' && ownsSession) {
            if (!session.kpiDraft) {
              session.kpiDraft = normalizeKpiDraft({}, { suggestion: session.kpiSuggestion });
            }
            session.kpiDraft.objective = extraAction ? String(extraAction).toUpperCase() : null;
            session.kpiMode = 'field:objective';
            await this.renderKpiEditor(message, { chatId, base, session, context });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Цель обновлена.' });
            return { handled: true };
          }

          if (subAction === 'currency' && ownsSession) {
            if (!session.kpiDraft) {
              session.kpiDraft = normalizeKpiDraft({}, { suggestion: session.kpiSuggestion });
            }
            session.kpiDraft.currency = extraAction ? String(extraAction).toUpperCase() : null;
            session.kpiMode = 'field:currency';
            await this.renderKpiEditor(message, { chatId, base, session, context });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Валюта обновлена.' });
            return { handled: true };
          }

          if (subAction === 'clear' && ownsSession) {
            if (!session.kpiDraft) {
              session.kpiDraft = normalizeKpiDraft({}, { suggestion: session.kpiSuggestion });
            }
            if (extraAction === 'objective' || extraAction === 'currency') {
              session.kpiDraft[extraAction] = null;
            } else if (Object.prototype.hasOwnProperty.call(KPI_FIELD_CONFIG, extraAction)) {
              session.kpiDraft[extraAction] = null;
            }
            session.kpiMode = extraAction ? `field:${extraAction}` : 'main';
            await this.renderKpiEditor(message, { chatId, base, session, context });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Значение очищено.' });
            return { handled: true };
          }

          if (subAction === 'adjust' && ownsSession) {
            if (!session.kpiDraft) {
              session.kpiDraft = normalizeKpiDraft({}, { suggestion: session.kpiSuggestion });
            }
            const field = extraAction;
            const delta = Number(extraParam || 0);
            if (Object.prototype.hasOwnProperty.call(KPI_FIELD_CONFIG, field) && Number.isFinite(delta)) {
              adjustKpiDraftValue(session.kpiDraft, field, delta);
              session.kpiMode = `field:${field}`;
              await this.renderKpiEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Значение обновлено.' });
              return { handled: true };
            }
          }

          if (!subAction) {
            const kpi = extractProjectKpi(context.rawProject);
            const body = ['<b>KPI проекта</b>', ...formatKpiLines(kpi)];
            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✏️ Изменить KPI', callback_data: `${base}:kpi:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            });

            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'KPI отображены.' });
            return { handled: true };
          }

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Действие недоступно.' });
          return { handled: true };
        }

        if (action === 'alerts') {
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;

          const renderAlertsPanel = async () => {
            const alerts = extractAlertSettings(context.rawProject) || {};
            const body = [
              '<b>Алерты</b>',
              ...formatAlertLines(alerts, { account: context.account, campaigns: context.account?.campaignSummaries }),
              '',
              'Используйте кнопки ниже, чтобы включать уведомления и настраивать время.',
            ];
            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: buildAlertSettingsKeyboard(base, alerts),
            });
          };

          const updateAlertsRecord = async (mutator) => {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before alert update', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }
            if (!stored.alerts || typeof stored.alerts !== 'object') {
              stored.alerts = {};
            }

            mutator(stored.alerts);

            stored.settings = stored.settings || {};
            stored.settings.alerts = { ...stored.alerts };
            stored.config = stored.config || {};
            stored.config.alerts = { ...stored.alerts };

            stored.updated_at = new Date().toISOString();
            if (userId) {
              stored.updated_by = userId;
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });
          };

          if (subAction === 'toggle') {
            const target = extraAction || '';
            await updateAlertsRecord((alerts) => {
              if (target === 'zero') {
                const current = alerts.zeroSpend && typeof alerts.zeroSpend === 'object' ? alerts.zeroSpend : {};
                const enabled = Boolean(current.enabled ?? alerts.zeroSpend ?? alerts.zero_spend);
                const next = !enabled;
                const time = normalizeTimeToken(current.time || current.hour || ALERT_ZERO_DEFAULT_TIME) || ALERT_ZERO_DEFAULT_TIME;
                alerts.zeroSpend = { ...current, enabled: next, time };
                alerts.zero_spend = alerts.zeroSpend;
              } else if (target === 'billing') {
                const current = alerts.billing && typeof alerts.billing === 'object' ? alerts.billing : {};
                const enabled = Boolean(current.enabled ?? alerts.billing ?? alerts.payment);
                const times = Array.isArray(current.times)
                  ? current.times
                  : Array.isArray(current.hours)
                  ? current.hours
                  : ALERT_BILLING_DEFAULT_TIMES;
                const normalizedTimes = (times || ALERT_BILLING_DEFAULT_TIMES)
                  .map((time) => normalizeTimeToken(time))
                  .filter(Boolean);
                const uniqueTimes = Array.from(new Set(normalizedTimes));
                alerts.billing = {
                  ...current,
                  enabled: !enabled,
                  times: uniqueTimes.length > 0 ? uniqueTimes : ALERT_BILLING_DEFAULT_TIMES,
                };
                alerts.payment = alerts.billing;
              } else if (target === 'anomalies') {
                const current = alerts.anomalies && typeof alerts.anomalies === 'object' ? alerts.anomalies : {};
                const enabled = Boolean(current.enabled ?? alerts.anomalies);
                alerts.anomalies = { ...current, enabled: !enabled };
              } else if (target === 'creatives') {
                const current = alerts.creatives && typeof alerts.creatives === 'object' ? alerts.creatives : {};
                const enabled = Boolean(current.enabled ?? alerts.creatives ?? alerts.creative_fatigue);
                alerts.creatives = { ...current, enabled: !enabled };
                alerts.creative_fatigue = alerts.creatives;
              }
            });

            await renderAlertsPanel();
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Настройки обновлены.' });
            return { handled: true };
          }

          if (subAction === 'zero' && extraAction === 'time') {
            const encoded = extraParam || '';
            const decoded = normalizeTimeToken(encoded);
            if (!decoded) {
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Не удалось распознать время.' });
              return { handled: true };
            }

            await updateAlertsRecord((alerts) => {
              const current = alerts.zeroSpend && typeof alerts.zeroSpend === 'object' ? alerts.zeroSpend : {};
              alerts.zeroSpend = {
                ...current,
                enabled: current.enabled !== false,
                time: decoded,
              };
              alerts.zero_spend = alerts.zeroSpend;
            });

            await renderAlertsPanel();
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: `Напоминание в ${decoded}.` });
            return { handled: true };
          }

          if (subAction === 'billing') {
            if (extraAction === 'time') {
              const encoded = extraParam || '';
              const decoded = normalizeTimeToken(encoded);
              if (!decoded) {
                await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Не удалось распознать время.' });
                return { handled: true };
              }

              await updateAlertsRecord((alerts) => {
                const current = alerts.billing && typeof alerts.billing === 'object' ? alerts.billing : {};
                const currentTimes = Array.isArray(current.times)
                  ? current.times.map((time) => normalizeTimeToken(time)).filter(Boolean)
                  : Array.isArray(current.hours)
                  ? current.hours.map((time) => normalizeTimeToken(time)).filter(Boolean)
                  : ALERT_BILLING_DEFAULT_TIMES;
                const set = new Set(currentTimes);
                if (set.has(decoded)) {
                  set.delete(decoded);
                } else {
                  set.add(decoded);
                }
                const nextTimes = Array.from(set).sort();
                alerts.billing = {
                  ...current,
                  enabled: current.enabled !== false,
                  times: nextTimes.length > 0 ? nextTimes : ALERT_BILLING_DEFAULT_TIMES,
                };
                alerts.payment = alerts.billing;
              });

              await renderAlertsPanel();
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Часы проверки обновлены.' });
              return { handled: true };
            }

            if (extraAction === 'reset') {
              await updateAlertsRecord((alerts) => {
                const current = alerts.billing && typeof alerts.billing === 'object' ? alerts.billing : {};
                alerts.billing = {
                  ...current,
                  enabled: current.enabled !== false,
                  times: ALERT_BILLING_DEFAULT_TIMES,
                };
                alerts.payment = alerts.billing;
              });

              await renderAlertsPanel();
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Часы проверки сброшены.' });
              return { handled: true };
            }
          }

          await renderAlertsPanel();
          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Алерты показаны.' });
          return { handled: true };
        }

        if (action === 'autopause') {
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(
              context.project.id || context.project.code || projectId,
            )}`;
          const schedule = extractScheduleSettings(context.rawProject) || {};
          const timezone = schedule.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
          const baseCallbackId = projectId;

          const renderAutopausePanel = async () => {
            const freshContext = context;
            const autopause = extractAutopauseSettings(freshContext.rawProject);
            const autopauseState = await this.readAutopauseState(projectKey);

            const lines = ['<b>Автопауза кампаний</b>'];
            lines.push(autopause.enabled ? 'Статус: 🟢 Включена' : 'Статус: 🔴 Отключена');
            lines.push(`Порог превышений: ${autopause.thresholdDays} дн.`);

            if (autopause.manualOnly) {
              lines.push('Режим: вручную (автостоп по KPI не запустится без подтверждения).');
            }

            if (autopause.lastTriggeredAt) {
              lines.push(
                `Последнее действие: ${escapeHtml(formatTimestamp(autopause.lastTriggeredAt, timezone))}`,
              );
            } else {
              lines.push('Последнее действие: ещё не выполнялось.');
            }

            if (Array.isArray(autopause.lastCampaigns) && autopause.lastCampaigns.length > 0) {
              lines.push('', 'Последние кампании:');
              const preview = autopause.lastCampaigns.slice(0, 3);
              for (const entry of preview) {
                const name = escapeHtml(entry?.name || entry?.id || 'Кампания');
                const reason = entry?.reason ? ` — ${escapeHtml(entry.reason)}` : '';
                lines.push(`• ${name}${reason}`);
              }
              if (autopause.lastCampaigns.length > preview.length) {
                lines.push(`…ещё ${autopause.lastCampaigns.length - preview.length} кампаний`);
              }
            }

            if (autopauseState?.lastAttemptDate) {
              const attemptLabel = formatDateShort(autopauseState.lastAttemptDate, { timezone });
              const attemptResult = autopauseState.lastAttemptResult || autopauseState.lastReason || 'попытка';
              lines.push('', `Последняя проверка: ${escapeHtml(attemptLabel)} (${escapeHtml(attemptResult)})`);
            }

            lines.push('', 'Используйте кнопки ниже для управления автопаузой.');

            await this.renderAdminMessage(message, {
              chatId,
              text: lines.join('\n'),
              reply_markup: buildAutopauseKeyboard(base, { autopause }),
            });
          };

          const updateAutopauseRecord = async (mutator) => {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before autopause update', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }
            if (!stored.autopause || typeof stored.autopause !== 'object') {
              stored.autopause = {};
            }

            mutator(stored.autopause);

            stored.updated_at = new Date().toISOString();
            if (userId) {
              stored.updated_by = userId;
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });
          };

          if (subAction === 'toggle') {
            const current = extractAutopauseSettings(context.rawProject);
            const nextEnabled = !current.enabled;

            await updateAutopauseRecord((autopause) => {
              autopause.enabled = nextEnabled;
              autopause.threshold_days = Number.isFinite(current.thresholdDays)
                ? current.thresholdDays
                : 3;
            });

            await renderAutopausePanel();
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: nextEnabled ? 'Автопауза включена.' : 'Автопауза отключена.',
            });

            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: `autopause:${nextEnabled ? 'on' : 'off'}`,
            });
            return { handled: true };
          }

          if (subAction === 'threshold') {
            const daysToken = extraAction || extraParam;
            const days = Number(daysToken);
            if (!Number.isFinite(days) || days <= 0) {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Укажите число дней от 1 и выше.',
                show_alert: true,
              });
              return { handled: true };
            }

            const normalized = Math.max(1, Math.round(days));
            await updateAutopauseRecord((autopause) => {
              autopause.threshold_days = normalized;
            });

            await renderAutopausePanel();
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: `Порог установлен: ${normalized} дн.`,
            });

            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: `autopause:threshold:${normalized}`,
            });
            return { handled: true };
          }

          if (subAction === 'trigger') {
            const result = await this.applyAutopauseToProject({
              projectKey,
              project: context.project,
              rawProject: context.rawProject,
              account: context.account,
              report: null,
              reason: 'manual',
              baseCallbackId,
              adminTargets: Array.from(this.config.adminIds),
              notifyAdmins: false,
              userId,
            });

            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });
            const autopauseState = await this.readAutopauseState(projectKey);
            autopauseState.lastAttemptDate = formatDateIsoInTimeZone(new Date(), timezone).slice(0, 10);
            autopauseState.lastAttemptResult = result.ok
              ? `поставлено ${result.paused.length}`
              : result.reason || 'без изменений';
            await this.writeAutopauseState(projectKey, autopauseState);

            await renderAutopausePanel();

            const answerText = result.ok
              ? `Поставлено на паузу кампаний: ${result.paused.length}.`
              : result.reason === 'no_candidates'
              ? 'Нет кампаний для остановки.'
              : result.reason === 'disabled'
              ? 'Автопауза отключена.'
              : 'Не удалось запустить автопаузу.';

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: answerText,
              show_alert: !result.ok,
            });

            this.queueLog({
              kind: 'callback',
              status: result.ok ? 'ok' : 'noop',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: 'autopause:trigger',
              paused: result.paused,
              reason: result.reason,
            });
            return { handled: true };
          }

          if (subAction === 'history') {
            const autopause = extractAutopauseSettings(context.rawProject);
            const autopauseState = await this.readAutopauseState(projectKey);
            const lines = ['<b>История автопаузы</b>'];
            if (autopause.lastTriggeredAt) {
              lines.push(
                `Последний стоп: ${escapeHtml(formatTimestamp(autopause.lastTriggeredAt, timezone))}`,
              );
            }
            if (Array.isArray(autopause.lastCampaigns) && autopause.lastCampaigns.length > 0) {
              lines.push('', 'Кампании:');
              for (const entry of autopause.lastCampaigns) {
                const name = escapeHtml(entry?.name || entry?.id || 'Кампания');
                const reason = entry?.reason ? ` — ${escapeHtml(entry.reason)}` : '';
                lines.push(`• ${name}${reason}`);
              }
            }
            if (autopauseState?.lastFailed?.length) {
              lines.push('', 'Ошибки:');
              for (const entry of autopauseState.lastFailed) {
                lines.push(`• ${escapeHtml(entry.id)} — ${escapeHtml(entry.error || 'ошибка')}`);
              }
            }
            if (!autopause.lastTriggeredAt && !autopauseState?.lastFailed?.length) {
              lines.push('Действий ещё не было.');
            }

            await this.renderAdminMessage(message, {
              chatId,
              text: lines.join('\n'),
              reply_markup: {
                inline_keyboard: [[{ text: '⬅️ Назад', callback_data: `${base}:autopause` }]],
              },
            });

            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'История показана.' });
            return { handled: true };
          }

          await renderAutopausePanel();
          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Настройки автопаузы.' });
          return { handled: true };
        }

        if (action === 'quiet') {
          const schedule = extractScheduleSettings(context.rawProject);
          const quietEnabled = Boolean(schedule?.quietWeekends);
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(
              context.project.id || context.project.code || projectId,
            )}`;

          if (subAction === 'toggle') {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before quiet toggle', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }

            const nextQuiet = !quietEnabled;

            stored.schedule = stored.schedule || {};
            stored.schedule.quietWeekends = nextQuiet;
            stored.schedule.quiet_weekends = nextQuiet;
            stored.schedule.mute_weekends = nextQuiet;

            stored.settings = stored.settings || {};
            stored.settings.schedule = stored.settings.schedule || {};
            stored.settings.schedule.quietWeekends = nextQuiet;
            stored.settings.schedule.quiet_weekends = nextQuiet;
            stored.settings.schedule.mute_weekends = nextQuiet;

            stored.reporting = stored.reporting || {};
            stored.reporting.schedule = stored.reporting.schedule || {};
            stored.reporting.schedule.quietWeekends = nextQuiet;
            stored.reporting.schedule.quiet_weekends = nextQuiet;
            stored.reporting.schedule.mute_weekends = nextQuiet;

            stored.updated_at = new Date().toISOString();
            if (userId) {
              stored.updated_by = userId;
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });

            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: nextQuiet ? 'Тихий режим включён.' : 'Тихий режим отключён.',
            });

            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: `quiet:${nextQuiet ? 'on' : 'off'}`,
            });
          }

          const refreshedSchedule = extractScheduleSettings(context.rawProject);
          const quietNow = Boolean(refreshedSchedule?.quietWeekends);
          const lines = [
            '<b>Тихий режим</b>',
            quietNow
              ? '🔕 Выходные без уведомлений активированы.'
              : '🔔 Отчёты и алерты приходят ежедневно.',
            '',
            'Нажмите кнопку, чтобы переключить режим.',
          ];

          await this.renderAdminMessage(message, {
            chatId,
            text: lines.join('\n'),
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: quietNow ? 'Включить уведомления' : 'Отключить на выходные',
                    callback_data: `${base}:quiet:toggle`,
                  },
                ],
                [{ text: '⬅️ К проекту', callback_data: `${base}:open` }],
              ],
            },
          });

          if (subAction !== 'toggle') {
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Режим отображён.' });
          }
          return { handled: true };
        }

        if (action === 'schedule') {
          const expectedProjectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(context.project.id || context.project.code || projectId)}`;

          if (subAction === 'edit') {
            const session = await this.startAdminSession({
              userId,
              chatId,
              threadId: message?.message_thread_id ?? null,
              project: context.project,
              kind: 'schedule_edit',
              base,
            });
            if (session) {
              session.projectKey = expectedProjectKey;
              session.scheduleMode = 'main';
              session.scheduleDraft = null;
              const suggestion = context.scheduleSuggestion || context.account?.reportingSchedule || session.scheduleSuggestion;
              if (suggestion) {
                session.scheduleSuggestion = normalizeScheduleDraft(suggestion, {
                  defaultTimezone: this.config.defaultTimezone,
                });
              }
              await this.saveAdminSession(session);
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Редактор расписания открыт.' });
              this.queueLog({
                kind: 'callback',
                status: 'ok',
                data,
                chat_id: chatId,
                user_id: userId,
                project_id: context.project.id,
                action: 'schedule_editor_open',
              });
              return { handled: true };
            }
          }

          const session = userId ? await this.loadAdminSession(userId) : null;
          const ownsSession =
            session &&
            session.kind === 'schedule_edit' &&
            session.projectKey === expectedProjectKey &&
            (!session.projectId || session.projectId === (context.project.id || ''));

          if (subAction === 'save') {
            if (!ownsSession) {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Откройте редактор расписания через кнопку «🕒 Изменить расписание».',
                show_alert: true,
              });
              return { handled: true };
            }

            const result = await this.saveScheduleDraftFromSession(session, {
              context,
              userId,
              base,
              message,
              chatId,
            });
            if (result.ok) {
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Расписание сохранено.' });
            } else {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Не удалось сохранить расписание. Попробуйте позже.',
                show_alert: true,
              });
            }
            return { handled: true };
          }

          if (subAction === 'cancel') {
            if (ownsSession) {
              await this.clearAdminSession(userId);
            }
            const schedule = extractScheduleSettings(context.rawProject);
            const body = ['<b>Расписание</b>', ...formatScheduleLines(schedule, { timezone: this.config.defaultTimezone })];
            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🕒 Изменить расписание', callback_data: `${base}:schedule:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Изменения отменены.' });
            return { handled: true };
          }

          if (!ownsSession && subAction) {
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: 'Откройте редактор расписания через кнопку «🕒 Изменить расписание».',
              show_alert: true,
            });
            return { handled: true };
          }

          if (ownsSession) {
            if (!session.scheduleDraft) {
              session.scheduleDraft = normalizeScheduleDraft(extractScheduleSettings(context.rawProject) || {}, {
                defaultTimezone: this.config.defaultTimezone,
              });
            }

            if (subAction === 'periods') {
              if (extraAction === 'toggle' && extraParam) {
                session.scheduleDraft.periods = toggleListValue(session.scheduleDraft.periods, extraParam);
              } else if (extraAction === 'clear') {
                session.scheduleDraft.periods = [];
              }
              session.scheduleMode = 'periods';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Периоды обновлены.' });
              return { handled: true };
            }

            if (subAction === 'times') {
              if (extraAction === 'toggle' && extraParam) {
                session.scheduleDraft.times = toggleListValue(session.scheduleDraft.times, extraParam).sort();
              } else if (extraAction === 'clear') {
                session.scheduleDraft.times = [];
              }
              session.scheduleMode = 'times';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Время обновлено.' });
              return { handled: true };
            }

            if (subAction === 'timezone') {
              if (extraAction === 'set' && extraParam) {
                try {
                  session.scheduleDraft.timezone = decodeURIComponent(extraParam);
                } catch (error) {
                  session.scheduleDraft.timezone = extraParam;
                }
              }
              session.scheduleMode = 'timezone';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Таймзона обновлена.' });
              return { handled: true };
            }

            if (subAction === 'cadence') {
              if (extraAction === 'set' && extraParam) {
                session.scheduleDraft.cadence = extraParam;
              }
              session.scheduleMode = 'cadence';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Частота обновлена.' });
              return { handled: true };
            }

            if (subAction === 'quiet') {
              if (extraAction === 'toggle') {
                session.scheduleDraft.quietWeekends = !session.scheduleDraft.quietWeekends;
              }
              session.scheduleMode = 'main';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Режим выходных обновлён.' });
              return { handled: true };
            }

            if (subAction === 'apply') {
              if (session.scheduleSuggestion) {
                session.scheduleDraft = normalizeScheduleDraft(session.scheduleSuggestion, {
                  defaultTimezone: this.config.defaultTimezone,
                });
                session.scheduleMode = 'main';
                await this.renderScheduleEditor(message, { chatId, base, session, context });
                await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Рекомендация подставлена.' });
              } else {
                await this.telegram.answerCallbackQuery({
                  callback_query_id: id,
                  text: 'Рекомендация недоступна.',
                  show_alert: true,
                });
              }
              return { handled: true };
            }

            if (subAction === 'back') {
              session.scheduleMode = 'main';
              await this.renderScheduleEditor(message, { chatId, base, session, context });
              await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Вернулись к параметрам.' });
              return { handled: true };
            }
          }

          if (!subAction) {
            const schedule = extractScheduleSettings(context.rawProject);
            const body = ['<b>Расписание</b>', ...formatScheduleLines(schedule, { timezone: this.config.defaultTimezone })];
            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🕒 Изменить расписание', callback_data: `${base}:schedule:edit` },
                    { text: '⬅️ К проекту', callback_data: `${base}:open` },
                  ],
                ],
              },
            });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Расписание отображено.' });
            return { handled: true };
          }

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Действие недоступно.' });
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

          await this.renderAdminMessage(message, {
            chatId,
            text: body.join('\n'),
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🕒 Изменить расписание', callback_data: `${base}:schedule:edit` },
                  { text: '⬅️ К проекту', callback_data: `${base}:open` },
                ],
              ],
            },
          });

          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Настройки показаны.' });
          return { handled: true };
        }

        if (action === 'payment') {
          const projectKey =
            context.project.key ||
            `${PROJECT_KEY_PREFIX}${normalizeProjectIdForCallback(
              context.project.id || context.project.code || projectId,
            )}`;
          const timezone =
            extractScheduleSettings(context.rawProject)?.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;

          const renderPayment = async () => {
            const billingLines = formatClientBillingLines(context.project.clientBilling, { timezone });
            const body = [
              '<b>Оплата проекта</b>',
              ...billingLines,
              '',
              'Отметьте оплату, чтобы портал и алерты работали корректно.',
            ];
            const keyboard = {
              inline_keyboard: [
                [
                  { text: 'Оплатил сегодня', callback_data: `${base}:payment:mark:today` },
                  { text: 'Оплатил вчера', callback_data: `${base}:payment:mark:yesterday` },
                ],
                [{ text: '📅 Выбрать дату', callback_data: `${base}:payment:calendar` }],
                [{ text: '🚫 Отказался оплачивать', callback_data: `${base}:payment:decline` }],
                [{ text: '⬅️ К проекту', callback_data: `${base}:open` }],
              ],
            };

            await this.renderAdminMessage(message, {
              chatId,
              text: body.join('\n'),
              reply_markup: keyboard,
            });
          };

          const savePayment = async ({ isoDate, status }) => {
            let stored = null;
            try {
              stored = await this.storage.getJson('DB', projectKey);
            } catch (error) {
              console.warn('Failed to read project before payment update', projectKey, error);
            }
            if (!stored || typeof stored !== 'object') {
              stored = {};
            }

            if (!stored.client || typeof stored.client !== 'object') {
              stored.client = {};
            }
            if (!stored.client.billing || typeof stored.client.billing !== 'object') {
              stored.client.billing = {};
            }

            if (isoDate) {
              stored.client.billing.last_payment_at = isoDate;
            }

            if (status) {
              stored.client.billing.status = status;
              if (status === 'declined') {
                stored.client.billing.declined_at = new Date().toISOString();
                stored.client.billing.portal_disabled = true;
                stored.client.billing.portalDisabled = true;
              } else {
                stored.client.billing.declined_at = null;
                stored.client.billing.portal_disabled = false;
                stored.client.billing.portalDisabled = false;
              }
            }

            stored.updated_at = new Date().toISOString();
            if (userId) {
              stored.updated_by = userId;
            }

            if (status === 'declined') {
              if (!stored.portal || typeof stored.portal !== 'object') {
                stored.portal = {};
              }
              stored.portal.enabled = false;
              stored.portal.disabled = true;
              stored.portal.disabled_at = stored.updated_at;
              delete stored.portal.token;
              delete stored.portal.signature;
              stored.portal_tokens = [];
              stored.portal_signatures = [];
              if (stored.tokens && typeof stored.tokens === 'object') {
                delete stored.tokens.portal;
                delete stored.tokens.portal_signature;
              }
            } else if (status === 'active') {
              if (!isPortalActive(stored)) {
                if (!stored.portal || typeof stored.portal !== 'object') {
                  stored.portal = {};
                }
                const token = stored.portal.token || generatePortalToken({});
                const signature = await buildPortalSignature({
                  code: context.project?.code || context.project?.id || projectId,
                  token,
                });
                stored.portal.token = token;
                stored.portal.enabled = true;
                stored.portal.updated_at = stored.updated_at;
                stored.portal.created_at = stored.portal.created_at || stored.updated_at;
                stored.portal.disabled = false;
                delete stored.portal.disabled_at;
                stored.portal_tokens = [token];
                stored.portal_signatures = signature ? [signature] : [];
                if (signature) {
                  stored.portal.signature = signature;
                }
                if (!stored.tokens || typeof stored.tokens !== 'object') {
                  stored.tokens = {};
                }
                stored.tokens.portal = token;
                if (signature) {
                  stored.tokens.portal_signature = signature;
                }
              }
            }

            await this.storage.putJson('DB', projectKey, stored);
            context = await this.resolveProjectContext(projectId, { forceMetaRefresh: false });
          };

          if (subAction === 'calendar') {
            await this.renderAdminMessage(message, {
              chatId,
              text: '<b>Выберите дату оплаты</b>',
              reply_markup: buildPaymentCalendarKeyboard(base, { timezone }),
            });
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Выберите дату.' });
            return { handled: true };
          }

          if (subAction === 'mark') {
            const target = new Date();
            if (extraAction === 'yesterday') {
              target.setDate(target.getDate() - 1);
            }
            const iso = formatDateIsoInTimeZone(target, timezone).slice(0, 10);
            await savePayment({ isoDate: iso, status: 'active' });
            await renderPayment();
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: extraAction === 'yesterday' ? 'Оплата за вчера отмечена.' : 'Оплата за сегодня отмечена.',
            });
            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: `payment:mark:${extraAction || 'today'}`,
            });
            return { handled: true };
          }

          if (subAction === 'set') {
            const parsed = parseDateInput(extraAction);
            if (!parsed) {
              await this.telegram.answerCallbackQuery({
                callback_query_id: id,
                text: 'Дата не распознана. Используйте формат ГГГГ-ММ-ДД.',
                show_alert: true,
              });
              return { handled: false, reason: 'payment_date_invalid' };
            }

            const iso = formatDateIsoInTimeZone(parsed, timezone).slice(0, 10);
            await savePayment({ isoDate: iso, status: 'active' });
            await renderPayment();
            await this.telegram.answerCallbackQuery({
              callback_query_id: id,
              text: `Оплата за ${formatDateShort(parsed, { timezone })} сохранена.`,
            });
            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: 'payment:set',
              note: iso,
            });
            return { handled: true };
          }

          if (subAction === 'decline') {
            await savePayment({ status: 'declined' });
            await renderPayment();
            await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Клиент отмечен как не оплативший.' });
            this.queueLog({
              kind: 'callback',
              status: 'ok',
              data,
              chat_id: chatId,
              user_id: userId,
              project_id: context.project.id,
              action: 'payment:decline',
            });
            return { handled: true };
          }

          await renderPayment();
          await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Статус оплаты.' });
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
    const envTz = typeof env.DEFAULT_TZ === 'string' ? env.DEFAULT_TZ.trim() : '';
    this.defaultTimezone = envTz || DEFAULT_TIMEZONE_FALLBACK;
    this.workerUrl = typeof env.WORKER_URL === 'string' ? env.WORKER_URL.trim() : '';
    this.metaAppId = typeof env.FB_APP_ID === 'string' ? env.FB_APP_ID.trim() : '';
    this.metaAppSecret = typeof env.FB_APP_SECRET === 'string' ? env.FB_APP_SECRET.trim() : '';
    this.metaLongToken = AppConfig.resolveMetaLongToken(env);
    this.metaGraphVersion = AppConfig.resolveMetaGraphVersion(env);
    this.metaManageToken = AppConfig.resolveMetaManageToken(env);
    this.telegramWebhookUrl = AppConfig.resolveWebhookUrl(env);
    this.portalAccessToken = AppConfig.resolvePortalToken(env);
    this.metaOAuthRedirectUrl = AppConfig.resolveMetaRedirectUrl(env);
    this.projectManagerIds = parseAdminIds(
      env.PROJECT_MANAGER_IDS || env.PROJECT_MANAGERS || env.PROJECT_ACCESS_IDS || '',
    );
    if (this.projectManagerIds.size === 0) {
      this.projectManagerIds = new Set(this.adminIds);
    }
    this.projectAccountAccess = parseProjectAccountAccess(
      env.PROJECT_ACCOUNT_ACCESS || env.PROJECT_ACCOUNT_ALLOWLIST || env.PROJECT_ACCOUNT_ADMINS || '',
    );
    this.projectChatPresets = parseProjectChatPresets(
      env.PROJECT_CHAT_PRESETS || env.PROJECT_CHAT_TEMPLATES || env.CHAT_PRESETS || '',
    );
    this.projectChatPresetIndex = {};
    for (const preset of this.projectChatPresets) {
      if (preset && preset.key && !this.projectChatPresetIndex[preset.key]) {
        this.projectChatPresetIndex[preset.key] = preset;
      }
    }
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

  isProjectManager(userId) {
    if (!userId) {
      return false;
    }
    return this.projectManagerIds.has(String(userId));
  }

  canManageAccount(userId, accountId) {
    if (!this.isProjectManager(userId)) {
      return false;
    }

    const normalized = normalizeAccountKey(accountId);
    if (!normalized) {
      return true;
    }

    const rules = this.projectAccountAccess[normalized];
    if (!rules || rules.length === 0) {
      return true;
    }

    const user = String(userId);
    return rules.includes(user) || rules.includes('*') || rules.includes('all');
  }

  listChatPresets() {
    return Array.isArray(this.projectChatPresets) ? [...this.projectChatPresets] : [];
  }

  getChatPreset(key) {
    if (!key) {
      return null;
    }

    const normalized = normalizePresetKey(key);
    if (!normalized) {
      return null;
    }

    return this.projectChatPresetIndex[normalized] || null;
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
    if (!this.config.workerUrl && request && typeof request.url === 'string') {
      try {
        const origin = new URL(request.url).origin;
        if (origin && origin !== 'null') {
          this.config.workerUrl = origin;
        }
      } catch (error) {
        console.warn('Failed to derive worker origin from request', error);
      }
    }
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

    if (normalizedPath === '/api/meta/status') {
      return this.handleMetaStatusApi(url);
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
        if (result?.status) {
          const syncTask = this.syncProjectsFromMetaStatus(result.status).catch((error) => {
            console.error('Project sync during /manage/meta refresh failed', error);
          });
          if (this.executionContext?.waitUntil) {
            this.executionContext.waitUntil(syncTask);
          } else {
            await syncTask;
          }
        }
        const diagnostics = await this.storage.readMetaAccountSnapshot();
        return jsonResponse({ ok: true, action: 'refresh', ...result, diagnostics });
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
      const diagnostics = await this.storage.readMetaAccountSnapshot();
      return jsonResponse({ ok: true, action: 'info', ...result, diagnostics });
    } catch (error) {
      return jsonResponse(
        { ok: false, error: error?.message || String(error), action: 'info' },
        { status: 502 },
      );
    }
  }

  async handleMetaStatusApi(url) {
    if (!this.metaService) {
      return jsonResponse({ ok: false, error: 'meta_service_unavailable' }, { status: 503 });
    }

    const method = (this.request.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: 'GET,HEAD,OPTIONS',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Max-Age': '600',
        },
      });
    }

    const wantsHead = method === 'HEAD';
    if (method !== 'GET' && method !== 'HEAD') {
      const response = jsonResponse(
        { ok: false, error: 'method_not_allowed' },
        {
          status: 405,
          headers: {
            Allow: 'GET,HEAD,OPTIONS',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
      if (wantsHead) {
        const headers = new Headers(response.headers);
        return new Response(null, { status: response.status, headers });
      }
      return response;
    }

    const respond = (body, { status = 200, headers = {} } = {}) => {
      const response = jsonResponse(body, {
        status,
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
          ...headers,
        },
      });
      if (wantsHead) {
        const headHeaders = new Headers(response.headers);
        return new Response(null, { status: response.status, headers: headHeaders });
      }
      return response;
    };

    const projectCode = safeDecode(
      pickFirstFilled(url.searchParams.get('code'), url.searchParams.get('project'), ''),
    );
    if (!projectCode) {
      return respond({ ok: false, error: 'project_required' }, { status: 400 });
    }

    const signature = pickFirstFilled(
      url.searchParams.get('sig'),
      url.searchParams.get('signature'),
      url.searchParams.get('token'),
      url.searchParams.get('key'),
    );

    if (!signature) {
      return respond({ ok: false, error: 'signature_required' }, { status: 401 });
    }

    const refreshRequested = /^(1|true|yes|on)$/i.test(url.searchParams.get('refresh') || '');
    const context = await this.resolveProjectContext(projectCode, {
      forceMetaRefresh: refreshRequested,
    });

    if (!context?.project) {
      return respond({ ok: false, error: 'project_not_found' }, { status: 404 });
    }

    const portalTokens = collectPortalTokens({
      rawProject: context.rawProject,
      project: context.project,
      config: this.config,
    });

    if (portalTokens.size === 0) {
      return respond({ ok: false, error: 'portal_disabled' }, { status: 403 });
    }

    const projectIdentifier = context.project.code || context.project.id || projectCode;
    const signatureOk = await portalSignatureMatches(signature, {
      code: projectIdentifier,
      tokens: portalTokens,
    });

    if (!signatureOk) {
      return respond({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const definitions = listPortalPeriodDefinitions();
    const requestedPeriod = String(url.searchParams.get('period') || '').toLowerCase();
    const definition =
      definitions.find((item) => item.id === requestedPeriod) || definitions[0] || {
        id: 'today',
        label: 'Сегодня',
        preset: 'today',
      };

    const timezone =
      extractScheduleSettings(context.rawProject)?.timezone ||
      this.config.defaultTimezone ||
      DEFAULT_TIMEZONE_FALLBACK;
    const campaignFilter = extractReportCampaignFilter(context.rawProject);
    const kpi = extractProjectKpi(context.rawProject);

    let currency =
      context.account?.currency ||
      context.project?.metrics?.currency ||
      context.project?.currency ||
      null;
    let report = null;
    let errorMessage = null;

    try {
      report = await this.metaService.fetchAccountReport({
        project: context.project,
        account: context.account,
        preset: definition.preset,
        timezone,
        campaignIds: campaignFilter,
      });
      if (!currency && report?.currency) {
        currency = report.currency;
      }
    } catch (error) {
      errorMessage = error?.message || 'Не удалось загрузить статистику';
    }

    const periods = [
      {
        id: definition.id,
        label: definition.label,
        report,
        error: errorMessage,
      },
    ];

    const dataset = buildPortalDataset({
      projectCode: projectIdentifier,
      signature,
      timezone,
      currency: currency || report?.currency || 'USD',
      periods,
      account: context.account,
      kpi,
    });

    const periodPayload = dataset.periods[definition.id] ? { ...dataset.periods[definition.id], fresh: true } : null;

    return respond({
      ok: true,
      project: {
        code: projectIdentifier,
        name: context.project?.name || null,
      },
      timezone,
      period: periodPayload,
    });
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

  async syncProjectsFromMetaStatus(status, { limit = 200 } = {}) {
    const snapshot = pickMetaStatus(status) || {};
    const facebook = snapshot.facebook && typeof snapshot.facebook === 'object' ? snapshot.facebook : {};
    const accounts = Array.isArray(facebook.adAccounts) ? facebook.adAccounts : [];
    if (accounts.length === 0) {
      return { updated: 0, matched: 0, remaining: 0 };
    }

    const accountIndex = new Map();
    for (const account of accounts) {
      if (!account || typeof account !== 'object') {
        continue;
      }
      const normalized = normalizeAccountKey(account.accountId ?? account.id);
      if (!normalized || accountIndex.has(normalized)) {
        continue;
      }
      accountIndex.set(normalized, account);
    }

    if (accountIndex.size === 0) {
      return { updated: 0, matched: 0, remaining: 0 };
    }

    const projectKeys = await this.storage.listKeys('DB', PROJECT_KEY_PREFIX, limit);
    if (!Array.isArray(projectKeys) || projectKeys.length === 0) {
      return { updated: 0, matched: 0, remaining: accountIndex.size };
    }

    const nowIso = new Date().toISOString();
    const updatedAt = facebook.updatedAt || facebook.updated_at || nowIso;
    let updatedCount = 0;
    let matchedCount = 0;

    for (const key of projectKeys) {
      let record = null;
      try {
        record = await this.storage.getJson('DB', key);
      } catch (error) {
        console.warn('Failed to load project for Meta sync', key, error);
        continue;
      }

      if (!record || typeof record !== 'object') {
        continue;
      }

      const accountKey = normalizeAccountKey(
        record.meta_account_id ||
          record.ad_account_id ||
          record.account_id ||
          record.adAccountId ||
          record.meta?.accountId,
      );

      if (!accountKey || !accountIndex.has(accountKey)) {
        continue;
      }

      const account = accountIndex.get(accountKey);
      const merged = this.mergeMetaAccountDiagnostics(record, account, { updatedAt });
      if (merged.changed) {
        merged.record.updated_at = nowIso;
        try {
          await this.storage.putJson('DB', key, merged.record);
          updatedCount += 1;
        } catch (error) {
          console.error('Failed to update project with Meta diagnostics', key, error);
        }
      }

      matchedCount += 1;
      accountIndex.delete(accountKey);
    }

    return { updated: updatedCount, matched: matchedCount, remaining: accountIndex.size };
  }

  mergeMetaAccountDiagnostics(record, account, { updatedAt } = {}) {
    const result = record && typeof record === 'object' ? { ...record } : {};
    result.meta = { ...(result.meta || {}) };
    result.metrics = { ...(result.metrics || {}) };
    if (result.billing) {
      result.billing = { ...result.billing };
    }

    const diagnostics = { ...(result.meta?.diagnostics || {}) };
    const now = parseDateInput(updatedAt) || new Date();
    let changed = false;

    const accountId = normalizeAccountKey(account?.accountId ?? account?.id);
    if (accountId) {
      const prefixed = `act_${accountId}`;
      if (result.meta.accountId !== prefixed) {
        result.meta.accountId = prefixed;
        changed = true;
      }
      if (!result.meta.accountKey) {
        result.meta.accountKey = prefixed;
      }
    }

    const accountName = account?.name || '';
    if (accountName && result.meta.accountName !== accountName) {
      result.meta.accountName = accountName;
      if (!result.name || result.name === record?.meta?.accountName) {
        result.name = accountName;
      }
      changed = true;
    }

    const currency = account?.currency ? String(account.currency).toUpperCase() : '';
    if (currency && result.metrics.currency !== currency) {
      result.metrics.currency = currency;
      changed = true;
    }

    const spendToday = Number(account?.spendTodayUsd ?? account?.spend_today_usd);
    if (Number.isFinite(spendToday)) {
      if (result.metrics.spend_today_usd !== spendToday || result.metrics.spendTodayUsd !== spendToday) {
        result.metrics.spend_today_usd = spendToday;
        result.metrics.spendTodayUsd = spendToday;
        changed = true;
      }
      diagnostics.spendTodayUsd = spendToday;
    }

    const billingSource = account?.billingNextAt || account?.billing_next_at || null;
    const countdown = formatDaysUntil(billingSource, { now });
    if (billingSource) {
      if (!result.billing) {
        result.billing = {};
      }
      if (result.billing.next_payment_at !== billingSource) {
        result.billing.next_payment_at = billingSource;
        changed = true;
      }
    }
    if (countdown.label && (!result.billing || result.billing.due_label !== countdown.label)) {
      result.billing = { ...(result.billing || {}), due_label: countdown.label };
      changed = true;
    }
    if (Number.isFinite(countdown.value)) {
      const currentDueDays = Number(result.billing?.due_days);
      if (currentDueDays !== countdown.value) {
        result.billing = { ...(result.billing || {}), due_days: countdown.value };
        changed = true;
      }
    }

    const issues = [];
    if (Array.isArray(account?.paymentIssues)) {
      for (const issue of account.paymentIssues) {
        if (issue) issues.push(String(issue));
      }
    }
    if (account?.paymentIssue) {
      issues.push(String(account.paymentIssue));
    }

    const cardLast4 =
      account?.defaultPaymentMethodLast4 ||
      account?.paymentMethodLast4 ||
      account?.card_last4 ||
      account?.default_card_last4 ||
      null;

    const debt = Number(account?.debtUsd ?? account?.debt_usd ?? account?.balance);
    const cpaMinRaw = Number(account?.cpaMinUsd ?? account?.cpa_min_usd ?? account?.cpaMin);
    const cpaMaxRaw = Number(account?.cpaMaxUsd ?? account?.cpa_max_usd ?? account?.cpaMax);
    const cpaMin = Number.isFinite(cpaMinRaw) && cpaMinRaw > 0 ? cpaMinRaw : null;
    const cpaMax = Number.isFinite(cpaMaxRaw) && cpaMaxRaw > 0 ? cpaMaxRaw : null;
    const runningCampaigns = Number(account?.runningCampaigns ?? account?.campaignsRunning ?? account?.activeCampaigns);

    diagnostics.status = account?.paymentStatusLabel || account?.statusLabel || account?.status || diagnostics.status || '';
    diagnostics.issues = issues;
    diagnostics.requiresAttention = Boolean(
      account?.requiresAttention ||
        issues.length > 0 ||
        (Number.isFinite(countdown.value) && countdown.value <= 3) ||
        account?.debtUsd,
    );
    diagnostics.billingNextAt = billingSource || null;
    diagnostics.billingDueLabel = countdown.label || account?.billingDueLabel || diagnostics.billingDueLabel || null;
    diagnostics.billingDueInDays = Number.isFinite(countdown.value) ? countdown.value : diagnostics.billingDueInDays ?? null;
    diagnostics.cardLast4 = cardLast4 || diagnostics.cardLast4 || null;
    diagnostics.debtUsd = Number.isFinite(debt) ? debt : diagnostics.debtUsd ?? null;
    diagnostics.runningCampaigns = Number.isFinite(runningCampaigns)
      ? runningCampaigns
      : diagnostics.runningCampaigns ?? null;
    diagnostics.cpaMinUsd = cpaMin ?? diagnostics.cpaMinUsd ?? null;
    diagnostics.cpaMaxUsd = cpaMax ?? diagnostics.cpaMaxUsd ?? null;
    diagnostics.signal = determineAccountSignal(account, { daysUntilDue: countdown });
    diagnostics.updated_at = updatedAt || new Date().toISOString();

    if (!deepEqualObjects(result.meta.diagnostics, diagnostics)) {
      result.meta.diagnostics = diagnostics;
      changed = true;
    }

    return { record: result, changed };
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
      if (META_TOKEN_FALLBACK_KEY && META_TOKEN_FALLBACK_KEY !== META_TOKEN_KEY) {
        await this.storage.deleteKey('DB', META_TOKEN_FALLBACK_KEY).catch(() => {});
      }
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
        .then(async (result) => {
          if (result?.status) {
            try {
              await this.syncProjectsFromMetaStatus(result.status);
            } catch (syncError) {
              console.error('Project sync after Meta refresh failed', syncError);
            }
          }
          return result;
        })
        .catch((error) => {
          console.error('Meta overview refresh after OAuth failed', error);
        });
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

    if (!stored && META_TOKEN_FALLBACK_KEY && META_TOKEN_FALLBACK_KEY !== META_TOKEN_KEY) {
      try {
        stored = await this.storage.getJson('DB', META_TOKEN_FALLBACK_KEY);
      } catch (error) {
        console.warn('Failed to read legacy Meta token', error);
      }
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

  async resolveProjectContext(callbackId, options = {}) {
    const bot = this.bot;
    if (bot && typeof bot.resolveProjectContext === 'function') {
      return bot.resolveProjectContext(callbackId, options);
    }

    if (!this._portalContextResolver) {
      const base = {
        storage: this.storage,
        metaService: this.metaService,
        executionContext: this.executionContext,
      };
      this._portalContextResolver = TelegramBot.prototype.resolveProjectContext.bind(base);
    }

    return this._portalContextResolver(callbackId, options);
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

    const portalTokens = collectPortalTokens({
      rawProject: context.rawProject,
      project: context.project,
      config: this.config,
    });

    if (portalTokens.size === 0) {
      return htmlResponse(
        '<h1>Доступ ограничен</h1><p>Для проекта ещё не настроен токен клиентского портала.</p>',
        { status: 403 },
      );
    }

    const projectIdentifier = context.project.code || context.project.id || projectCode;
    const signatureOk = await portalSignatureMatches(signature, {
      code: projectIdentifier,
      tokens: portalTokens,
    });

    if (!signatureOk) {
      return htmlResponse(
        '<h1>Доступ запрещён</h1><p>Проверьте подпись ссылки или запросите новую у менеджера проекта.</p>',
        { status: 403 },
      );
    }

    const timezone =
      extractScheduleSettings(context.rawProject)?.timezone || this.config.defaultTimezone || DEFAULT_TIMEZONE_FALLBACK;
    const campaignFilter = extractReportCampaignFilter(context.rawProject);
    const kpi = extractProjectKpi(context.rawProject);

    const definitions = listPortalPeriodDefinitions();

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
      feedbackStatus,
      projectCode: projectIdentifier,
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
      const logPayload = {
        scope: 'fetch',
        message: error?.message || String(error),
        stack: error?.stack || null,
        url: request?.url || null,
      };
      if (app?.storage && typeof app.storage.logError === 'function') {
        const promise = app.storage.logError(logPayload).catch((logError) => {
          console.warn('Failed to persist fetch error log', logError);
        });
        if (executionContext?.waitUntil) {
          executionContext.waitUntil(promise);
        } else {
          await promise;
        }
      }
      return jsonResponse(
        { ok: false, error: error?.message || 'internal_error' },
        { status: 500 },
      );
    }
  },

  async scheduled(event, env, executionContext) {
    const app = new WorkerApp(new Request('https://worker.invalid/'), env, executionContext);
    try {
      return await app.handleScheduled(event);
    } catch (error) {
      console.error('Unhandled scheduled error', error);
      const logPayload = {
        scope: 'scheduled',
        message: error?.message || String(error),
        stack: error?.stack || null,
        scheduledTime: event?.scheduledTime || null,
        cron: event?.cron || null,
      };
      if (app?.storage && typeof app.storage.logError === 'function') {
        const promise = app.storage.logError(logPayload).catch((logError) => {
          console.warn('Failed to persist scheduled error log', logError);
        });
        if (executionContext?.waitUntil) {
          executionContext.waitUntil(promise);
        } else {
          await promise;
        }
      }
      throw error;
    }
  },
};

export default worker;
