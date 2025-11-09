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
const META_STATUS_KEY = 'meta:status';
const META_TOKEN_KEY = 'meta:token';
const META_DEFAULT_GRAPH_VERSION = 'v18.0';
const META_OVERVIEW_MAX_AGE_MS = 2 * 60 * 1000;

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
      .map((account) => this.transformAdAccount(account))
      .filter((account) => account !== null);

    const enriched = await this.enrichAdAccounts(client, transformed);

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

  async enrichAdAccounts(client, accounts) {
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
        results[current] = await this.fetchCampaignSnapshot(client, account);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
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
          fields: 'id,name,effective_status,insights.date_preset(last_7d){cpa,cost_per_action_type}',
        },
      });

      const campaigns = Array.isArray(response?.data) ? response.data : [];
      const activeCount = campaigns.filter((item) => String(item?.effective_status || '').toUpperCase() === 'ACTIVE').length;
      const cpaSamples = [];
      for (const campaign of campaigns) {
        if (Array.isArray(campaign?.insights?.data)) {
          cpaSamples.push(...collectCpaSamples(campaign.insights.data));
        }
      }

      const cpaMin = cpaSamples.length ? Math.min(...cpaSamples) : null;
      const cpaMax = cpaSamples.length ? Math.max(...cpaSamples) : null;

      account.runningCampaigns = activeCount;
      account.cpaMinUsd = Number.isFinite(cpaMin) ? cpaMin : null;
      account.cpaMaxUsd = Number.isFinite(cpaMax) ? cpaMax : null;
    } catch (error) {
      console.warn('Failed to load campaign stats', accountId, error);
    }

    return account;
  }

  transformAdAccount(raw) {
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

    this.registerCommand('pingtest', async (context) => {
      await context.reply('🚀 Запускаю проверку: в течение 10 секунд придёт 10 сообщений.');
      context.defer(() => this.runPingTest(context));
    });
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

    const summary = ['<b>Админ-панель</b>'];

    const metaSection = buildMetaAdminSection(metaStatus, { timezone: this.config.defaultTimezone });
    if (metaSection.length > 0) {
      summary.push('', ...metaSection);
    }

    const webhookInfo = webhookStatus?.info || null;
    const webhookDefaultUrl = webhookStatus?.defaultUrl || '';
    const webhookActive = Boolean(webhookInfo?.url);
    const webhookLines = ['<b>Telegram</b>'];
    const webhookStatusText = webhookActive
      ? `<code>${escapeHtml(webhookInfo.url)}</code>`
      : 'не настроен';
    webhookLines.push(`Вебхук: ${webhookActive ? '🟢' : '🔴'} ${webhookStatusText}`);

    if (webhookDefaultUrl && (!webhookActive || webhookInfo.url !== webhookDefaultUrl)) {
      webhookLines.push(`Рекомендуемый URL: <code>${escapeHtml(webhookDefaultUrl)}</code>`);
    }

    if (webhookStatus?.ensured) {
      webhookLines.push('Автоматическое подключение выполнено ✅');
    }

    if (webhookStatus?.error) {
      webhookLines.push(`Ошибка: <code>${escapeHtml(webhookStatus.error)}</code>`);
    }

    if (typeof webhookInfo?.pending_update_count === 'number') {
      webhookLines.push(`В очереди: <b>${webhookInfo.pending_update_count}</b>`);
    }

    if (webhookInfo?.last_error_message) {
      webhookLines.push(`Последняя ошибка: ${escapeHtml(webhookInfo.last_error_message)}`);
    }

    if (webhookInfo?.last_error_date) {
      webhookLines.push(
        `Последняя ошибка в: ${escapeHtml(
          formatTimestamp(webhookInfo.last_error_date * 1000, this.config.defaultTimezone),
        )}`,
      );
    }

    summary.push('', ...webhookLines);

    summary.push('', '<b>Сводка</b>');
    summary.push(`• Зарегистрированных чатов: <b>${chatKeys.length}</b>`);
    summary.push(`• Проектов: <b>${projectKeys.length}</b>`);

    if (this.config.defaultTimezone) {
      summary.push(`• Таймзона по умолчанию: <code>${escapeHtml(this.config.defaultTimezone)}</code>`);
    }

    if (this.config.workerUrl) {
      summary.push(`• Worker URL: ${escapeHtml(this.config.workerUrl)}`);
    }

    summary.push('', 'OAuth Meta, отчёты и алерты будут добавлены на следующих этапах.');

    if (recentLogs.length > 0) {
      summary.push('', '<b>Последние события Telegram</b>');
      const preview = recentLogs
        .slice(Math.max(recentLogs.length - 3, 0))
        .reverse()
        .map((entry) => formatLogLine(entry, { timezone: this.config.defaultTimezone, limit: 80 }));
      summary.push(...preview);
    } else {
      summary.push('', 'Журнал событий пока пуст.');
    }

    const replyMarkup = {
      inline_keyboard: [
        [{ text: '🔐 Авторизоваться в Facebook', callback_data: 'admin:fb:auth' }],
        [{ text: '➕ Подключить проект', callback_data: 'admin:project:connect' }],
        [{ text: '📁 Проекты', callback_data: 'admin:projects' }],
        [
          { text: '🔄 Обновиться', callback_data: 'admin:refresh' },
          { text: '📄 Логи', callback_data: 'admin:logs' },
        ],
        [{ text: '🔁 Вебхук', callback_data: 'admin:webhook:refresh' }],
      ],
    };

    return { text: summary.join('\n'), reply_markup: replyMarkup };
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
        await this.telegram.answerCallbackQuery({
          callback_query_id: id,
          text: 'OAuth Meta подключим на следующем шаге.',
          show_alert: true,
        });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
        });
        return { handled: true };
      }

      if (data === 'admin:project:connect') {
        if (!chatId) {
          await this.telegram.answerCallbackQuery({
            callback_query_id: id,
            text: 'Не удалось определить чат.',
            show_alert: true,
          });
          return { handled: false, reason: 'chat_missing' };
        }

        const body = [
          '<b>Подключение проекта</b>',
          '1. Авторизуйтесь в Facebook из панели.',
          '2. Отметьте нужный бизнес-менеджер и рекламные аккаунты.',
          '3. Назначьте каналы доставки отчётов.',
          '',
          'Интеграция находится в разработке — уведомим, когда появится UI.',
        ].join('\n');

        await this.sendMessageWithFallback(
          {
            chat_id: chatId,
            text: body,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          },
          message,
        );

        await this.telegram.answerCallbackQuery({ callback_query_id: id, text: 'Инструкция отправлена.' });
        this.queueLog({
          kind: 'callback',
          status: 'ok',
          data,
          chat_id: chatId,
          user_id: userId,
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
      return htmlResponse('<h1>Meta OAuth</h1><p>Этап в разработке. Функция появится в следующих релизах.</p>');
    }

    if (normalizedPath === '/fb_cb') {
      return htmlResponse('<h1>Meta OAuth Callback</h1><p>Обработчик ещё не реализован.</p>', { status: 501 });
    }

    if (normalizedPath === '/fb_debug') {
      return htmlResponse('<h1>Meta Debug</h1><p>Диагностика появится позже.</p>', { status: 501 });
    }

    if (normalizedPath.startsWith('/p/')) {
      return htmlResponse('<h1>Портал клиента</h1><p>Раздел пока в разработке.</p>', { status: 501 });
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
