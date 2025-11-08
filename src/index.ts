// @ts-nocheck
/**
 * Bot Reports worker (incremental rebuild)
 *
 * This file reimplements the production Telegram automation worker inside TypeScript so it can be deployed
 * from Git. The code mirrors the existing functionality in Cloudflare (reports, billing checks, portal, etc.)
 * but is organised so we can iterate on it in smaller portions.
 */

export interface Env {
  DB: KVNamespace;
  BOT_TOKEN: string;
  FB_APP_ID?: string;
  FB_APP_SECRET?: string;
  FB_LONG_TOKEN?: string;
  ADMIN_IDS?: string;
  ADMIN_ID?: string;
  WORKER_URL?: string;
  DEFAULT_TZ?: string;
  GS_WEBHOOK?: string;
}

const missingConfig = (env: Env, keys: (keyof Env)[]) =>
  keys.filter((key) => !env[key] || env[key] === '' || env[key] == null);

const requireBotToken = (env: Env) => {
  const token = env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN secret is not configured');
  }
  return token;
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    if (url.pathname === '/tg' && request.method === 'POST') {
      const missing = missingConfig(env, ['BOT_TOKEN']);
      if (missing.length) {
        console.error(`[config] Telegram webhook skipped, missing secrets: ${missing.join(', ')}`);
        return new Response('Telegram webhook is not configured', { status: 500 });
      }
      const update = await request.json();
      await handleTelegram(update, env);
      return new Response('ok');
    }

    if (url.pathname === '/fb_auth') {
      return fbAuth(url, env);
    }

    if (url.pathname === '/fb_cb') {
      return fbCallback(url, env);
    }

    if (url.pathname === '/fb_debug') {
      return fbDebug(url, env);
    }

    if (url.pathname.startsWith('/p/')) {
      return handlePortal(url, env);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (missingConfig(env, ['BOT_TOKEN']).length) {
      console.error('[config] Scheduled tasks skipped: BOT_TOKEN secret is missing');
      return;
    }
    const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
    const now = new Date();
    const projects = (await listProjects(env.DB)).map(normalizeProject);

    for (const project of projects) {
      if (!project.active || project.billing === 'paused') continue;
      const times = Array.isArray(project.times) && project.times.length > 0 ? project.times : [project.time || '09:30'];
      if (project.mute_weekends && isWeekend(now, tz)) continue;
      for (const hm of times) {
        if (isTime(now, hm, tz)) {
          event.waitUntil(sendReportForProject(project.code, project, env, { archive: true, csv: true }));
        }
      }
    }

    if (isMonday(now, tz)) {
      for (const project of projects) {
        if (!project.active || project.billing === 'paused') continue;
        if (project.weekly?.enabled === false) continue;
        const times = Array.isArray(project.times) && project.times.length > 0 ? project.times : [project.time || '09:30'];
        if (times.some((hm) => isTime(now, hm, tz))) {
          event.waitUntil(sendWeeklyCombo(project, env));
        }
      }
    }

    for (const project of projects) {
      if (!project.alerts || project.alerts.enabled === false) continue;
      const billingTimes = project.alerts.billing_times || ['10:00', '14:00', '18:00'];
      const zeroSpendTime = project.alerts.no_spend_by || '12:00';
      for (const hm of billingTimes) {
        if (isTime(now, hm, tz)) {
          event.waitUntil(checkBillingAndNotify(project, env));
        }
      }
      if (zeroSpendTime && isTime(now, zeroSpendTime, tz)) {
        event.waitUntil(checkZeroSpendWithActiveCampaigns(project, env));
      }
    }

    if (localHM(now, tz) === '19:30') {
      for (const project of projects) {
        event.waitUntil(checkKPIAndAutopauseStreak(project, env));
      }
    }

    if (['11:00', '17:00'].includes(localHM(now, tz))) {
      for (const project of projects) {
        if (project.alerts?.enabled === false) continue;
        event.waitUntil(checkDisapprovals(project, env));
        event.waitUntil(checkAnomalies(project, env));
        event.waitUntil(checkCreativeFatigue(project, env));
      }
    }
  },
};

const escapeHTML = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value: number) => new Intl.NumberFormat('ru-RU').format(value || 0);

const truncate = (value: string | undefined | null, max: number) => {
  const str = value || '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

const htmlResponse = (body: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:24px;white-space:pre-wrap}</style><body>${body}</body>`,
    { headers: { 'content-type': 'text/html; charset=UTF-8' } },
  );

const currencySymbol = (currency?: string | null) => {
  if (!currency) return '';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  if (currency === 'RUB') return '₽';
  if (currency === 'UZS') return ' сум';
  return ` ${currency}`;
};

const localHM = (date: Date, tz: string) => {
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hh, mm] = format.format(date).split(':');
  return `${hh}:${mm}`;
};

const isTime = (now: Date, hm: string, tz: string) => localHM(now, tz) === (hm || '09:30');
const isWeekend = (now: Date, tz: string) => {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return weekday === 'Sat' || weekday === 'Sun';
};

const ymdLocal = (date: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const fmtDate = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const addMonth = (iso?: string | null) => {
  const source = new Date(iso || Date.now());
  const next = new Date(source);
  next.setMonth(source.getMonth() + 1);
  return next.toISOString();
};

const daysUntil = (iso: string, tz: string) => {
  const now = new Date();
  const end = new Date(iso);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / 86400000);
};

const shiftDays = (date: Date, days: number) => new Date(date.getTime() - days * 86400000);

const tgTopicLink = (chatId: number, threadId?: number | null) => {
  const slug = String(chatId).replace('-100', '');
  return `https://t.me/c/${slug}/${threadId || 1}`;
};

interface StoredProject {
  code: string;
  act: string;
  chat_id: number;
  thread_id?: number | null;
  period?: string;
  time?: string;
  times?: string[];
  mute_weekends?: boolean;
  active?: boolean;
  billing?: 'paid' | 'paused';
  billing_paid_at?: string | null;
  billing_next_at?: string | null;
  campaigns?: string[];
  kpi?: { cpl?: number | null; leads_per_day?: number | null; daily_budget?: number | null };
  weekly?: { enabled?: boolean; mode?: 'week_today' | 'week_yesterday' };
  alerts?: { enabled?: boolean; billing_times?: string[]; no_spend_by?: string | null };
  autopause?: { enabled?: boolean; days?: number };
  anomaly?: { cpl_jump?: number; ctr_drop?: number; impr_drop?: number; freq?: number };
  billing_status?: string;
}

const normalizeProject = (project: StoredProject) => {
  const copy: any = { ...project };
  if (!Array.isArray(copy.times) || copy.times.length === 0) copy.times = [copy.time || '09:30'];
  if (!copy.weekly) copy.weekly = { enabled: true, mode: 'week_today' };
  if (!copy.alerts) copy.alerts = { enabled: true, billing_times: ['10:00', '14:00', '18:00'], no_spend_by: '12:00' };
  if (!copy.kpi) copy.kpi = { cpl: null, leads_per_day: null, daily_budget: null };
  if (!copy.autopause) copy.autopause = { enabled: false, days: 3 };
  if (!copy.anomaly) copy.anomaly = { cpl_jump: 0.5, ctr_drop: 0.4, impr_drop: 0.5, freq: 3.5 };
  if (copy.billing == null) copy.billing = 'paid';
  if (copy.active == null) copy.active = true;
  return copy as StoredProject;
};


const listProjects = async (DB: KVNamespace) => {
  const { keys } = await DB.list({ prefix: 'project:' });
  const result: StoredProject[] = [];
  for (const key of keys) {
    const raw = await DB.get(key.name);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    result.push({ code: key.name.split(':')[1], ...parsed });
  }
  return result;
};

const getProject = async (DB: KVNamespace, code: string) => {
  const raw = await DB.get(`project:${code}`);
  return raw ? (JSON.parse(raw) as StoredProject) : null;
};

const saveProject = async (DB: KVNamespace, code: string, project: StoredProject) => {
  await DB.put(`project:${code}`, JSON.stringify(project));
};

const removeProject = (DB: KVNamespace, code: string) => DB.delete(`project:${code}`);

const chatKeyPrimary = (chatId: number, threadId: number) => `chat-${chatId}:${threadId}`;
const chatKeyLegacy = (chatId: number, threadId: number) => `chat:${chatId}:${threadId}`;

const parseChatKey = (name: string) => {
  const normaliseThread = (value?: string) => {
    if (value == null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  if (name.startsWith('chat-')) {
    const [chat, thread] = name.slice('chat-'.length).split(':');
    if (!chat) return null;
    return { chat_id: Number(chat), thread_id: normaliseThread(thread) };
  }
  if (name.startsWith('chat:')) {
    const [, chat, thread] = name.split(':');
    if (!chat) return null;
    return { chat_id: Number(chat), thread_id: normaliseThread(thread) };
  }
  return null;
};

const saveChat = async (DB: KVNamespace, chatId: number, threadId: number, meta: any) => {
  const primaryKey = chatKeyPrimary(chatId, threadId);
  await DB.put(primaryKey, JSON.stringify(meta));

  const legacyKey = chatKeyLegacy(chatId, threadId);
  if (primaryKey !== legacyKey) {
    await DB.delete(legacyKey);
  }
};

const getChat = async (DB: KVNamespace, chatId: number, threadId: number) => {
  const primary = await DB.get(chatKeyPrimary(chatId, threadId));
  if (primary) return JSON.parse(primary);

  const legacy = await DB.get(chatKeyLegacy(chatId, threadId));
  return legacy ? JSON.parse(legacy) : null;
};

const listChats = async (DB: KVNamespace) => {
  const seen = new Set<string>();
  const rows: any[] = [];

  const collect = async (prefix: string) => {
    let cursor: string | undefined;
    do {
      const res: any = await DB.list({ prefix, cursor });
      for (const key of res.keys || []) {
        const parsed = parseChatKey(key.name);
        if (!parsed) continue;
        const ref = `${parsed.chat_id}:${parsed.thread_id}`;
        if (seen.has(ref)) continue;
        const raw = await DB.get(key.name);
        if (!raw) continue;
        const data = JSON.parse(raw);
        seen.add(ref);
        rows.push({ chat_id: parsed.chat_id, thread_id: parsed.thread_id, ...data });
      }
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor);
  };

  await collect('chat-');
  await collect('chat:');

  return rows;
};

const saveUser = (DB: KVNamespace, uid: string, data: any) => DB.put(`tg_user:${uid}`, JSON.stringify(data));
const getUser = async (DB: KVNamespace, uid: string) => {
  const raw = await DB.get(`tg_user:${uid}`);
  return raw ? JSON.parse(raw) : {};
};

const saveUserAdAccounts = (DB: KVNamespace, uid: string, arr: any[]) => DB.put(`fb_accts:${uid}`, JSON.stringify(arr));
const getUserAdAccounts = async (DB: KVNamespace, uid: string) => {
  const raw = await DB.get(`fb_accts:${uid}`);
  return raw ? JSON.parse(raw) : [];
};

const putAcctMeta = (DB: KVNamespace, actId: string, meta: any) =>
  DB.put(`acct:${actId}`, JSON.stringify(meta), { expirationTtl: 60 * 60 * 24 });

const getAcctMeta = async (DB: KVNamespace, actId: string) => {
  const raw = await DB.get(`acct:${actId}`);
  return raw ? JSON.parse(raw) : null;
};

const archiveReport = (DB: KVNamespace, code: string, payload: any) =>
  DB.put(`report:${code}:${Date.now()}`, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 60 });

const listReports = async (DB: KVNamespace, code: string, limit = 20) => {
  const { keys } = await DB.list({ prefix: `report:${code}:` });
  const rows: any[] = [];
  for (const key of keys.slice(-limit)) {
    const raw = await DB.get(key.name);
    if (!raw) continue;
    rows.push({ key: key.name, ...(JSON.parse(raw) || {}) });
  }
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
};

const getTodaySpendCached = async (DB: KVNamespace, actId: string, tz: string) => {
  const key = `spend:${actId}:${ymdLocal(new Date(), tz)}`;
  const raw = await DB.get(key);
  return raw ? JSON.parse(raw) : null;
};

const putTodaySpendCached = (DB: KVNamespace, actId: string, tz: string, value: any) => {
  const key = `spend:${actId}:${ymdLocal(new Date(), tz)}`;
  return DB.put(key, JSON.stringify(value), { expirationTtl: 600 });
};

const adminList = (env: Env) => {
  const raw = (env.ADMIN_IDS || env.ADMIN_ID || '').toString();
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((value) => Number(value));
};

const isAdmin = (uid: string, env: Env) => adminList(env).includes(Number(uid));

const resolveToken = async (uid: string, env: Env) => {
  const user = await getUser(env.DB, uid);
  if (user?.fb_long_token) return user.fb_long_token;
  if (env.FB_LONG_TOKEN) return env.FB_LONG_TOKEN;
  const { keys } = await env.DB.list({ prefix: 'tg_user:' });
  for (const key of keys) {
    const row = JSON.parse((await env.DB.get(key.name)) || '{}');
    if (row.fb_long_token) return row.fb_long_token;
  }
  return '';
};

const resolveTokenAnyAdmin = async (env: Env) => {
  for (const admin of adminList(env)) {
    const user = await getUser(env.DB, String(admin));
    if (user?.fb_long_token) return user.fb_long_token;
  }
  if (env.FB_LONG_TOKEN) return env.FB_LONG_TOKEN;
  return '';
};

const normAct = (account: any) => {
  const id = (account.account_id || account.id || '').toString().replace(/^act_/, '');
  if (!id) return null;
  return { account_id: id, id: `act_${id}`, name: account.name || `Account ${id}` };
};

const fetchAdAccountsDirect = async (uid: string, env: Env) => {
  const token = await resolveToken(uid, env);
  if (!token) return { items: [], error: { message: 'Нет Meta токена' } };

  const map = new Map<string, any>();
  let url = `https://graph.facebook.com/v19.0/me/adaccounts?limit=500&access_token=${encodeURIComponent(token)}`;
  for (let i = 0; i < 10; i += 1) {
    const json = await (await fetch(url)).json();
    if (json?.error) return { items: [], error: json.error };
    if (Array.isArray(json?.data)) {
      for (const entry of json.data) {
        const norm = normAct(entry);
        if (norm) map.set(norm.account_id, norm);
      }
    }
    if (!json?.paging?.next) break;
    url = json.paging.next;
  }

  const items = Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (items.length) await saveUserAdAccounts(env.DB, uid, items);
  return { items };
};

const enrichAccounts = async (uid: string, env: Env, baseItems?: any[]) => {
  const token = await resolveToken(uid, env);
  if (!token) return;
  const items = baseItems || (await getUserAdAccounts(env.DB, uid));
  const enriched: any[] = [];
  for (const account of items) {
    const cached = await getAcctMeta(env.DB, account.account_id);
    if (cached) {
      enriched.push({ ...account, ...cached });
      continue;
    }
    const response = await fetch(
      `https://graph.facebook.com/v19.0/act_${account.account_id}?fields=id,name,currency,timezone_name,account_status,business{name}&access_token=${token}`,
    );
    const json = await response.json();
    const meta = {
      name: json.name || account.name,
      currency: json.currency || null,
      tz: json.timezone_name || null,
      business: json.business?.name || null,
      status: json.account_status || null,
    };
    await putAcctMeta(env.DB, account.account_id, meta);
    enriched.push({ ...account, ...meta });
  }
  await saveUserAdAccounts(env.DB, uid, enriched);
};


const METRIC_MAP: Record<string, { label: string; short: string; actions: string[] }> = {
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

const pickMetricForObjective = (objective?: string) =>
  METRIC_MAP[(objective || '').toUpperCase()] ||
  METRIC_MAP.LEAD_GENERATION || {
    label: 'Результаты',
    short: 'result',
    actions: [
      'lead',
      'messaging_conversation_started',
      'onsite_conversion.messaging_first_reply',
      'messaging_first_reply',
    ],
  };

const extractActionCount = (actions: any[] = [], types: string[]) => {
  const map = new Map<string, number>();
  for (const action of actions || []) {
    map.set(action.action_type, Number(action.value) || 0);
  }
  for (const type of types) {
    if (map.has(type)) return map.get(type) || 0;
  }
  return 0;
};

const extractAnyResult = (actions: any[] = []) =>
  extractActionCount(actions, [
    'lead',
    'messaging_conversation_started',
    'onsite_conversion.messaging_first_reply',
    'messaging_first_reply',
  ]);

const dowIndex = (now: Date, tz: string) => {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[weekday as 'Mon'] ?? 0;
};

const isMonday = (now: Date, tz: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now) === 'Mon';

const lastWeekRange = (tz: string) => {
  const now = new Date();
  const diff = dowIndex(now, tz);
  const lastMon = shiftDays(now, diff + 7);
  const lastSun = shiftDays(now, diff + 1);
  return { since: ymdLocal(lastMon, tz), until: ymdLocal(lastSun, tz), label: 'прошлая неделя' };
};

const todayRange = (tz: string) => {
  const value = ymdLocal(new Date(), tz);
  return { since: value, until: value, label: 'сегодня' };
};

const yesterdayRange = (tz: string) => {
  const value = ymdLocal(shiftDays(new Date(), 1), tz);
  return { since: value, until: value, label: 'вчера' };
};

const toRange = (period: string, tz: string) => {
  const now = new Date();
  if (period === 'today') return todayRange(tz);
  if (period === 'yesterday') return yesterdayRange(tz);
  if (period === 'last_week') return lastWeekRange(tz);
  if (period === 'last_7d') {
    const since = ymdLocal(shiftDays(now, 7), tz);
    const until = ymdLocal(shiftDays(now, 1), tz);
    return { since, until, label: 'посл. 7д' };
  }
  if (period === 'month_to_date') {
    const firstDay = new Date();
    firstDay.setUTCDate(1);
    const since = ymdLocal(firstDay, tz);
    const until = ymdLocal(shiftDays(new Date(), 1), tz);
    return { since, until, label: 'с начала месяца' };
  }
  return todayRange(tz);
};

const loadCampaignsList = async (act: string, token: string) => {
  let url = `https://graph.facebook.com/v19.0/${act}/campaigns?fields=id,name,objective,status,effective_status&limit=100&access_token=${token}`;
  const rows: any[] = [];
  for (let i = 0; i < 15; i += 1) {
    const json = await (await fetch(url)).json();
    if (Array.isArray(json?.data)) rows.push(...json.data);
    if (!json?.paging?.next) break;
    url = json.paging.next;
  }
  return rows.map((item) => ({
    id: item.id,
    name: item.name,
    objective: item.objective,
    status: item.status,
    effective_status: item.effective_status,
  }));
};

const getObjectiveMap = async (act: string, token: string, env: Env) => {
  const key = `objmap:${act}`;
  try {
    const raw = await env.DB.get(key);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    // ignore cache errors
  }
  const list = await loadCampaignsList(act, token);
  const map = Object.fromEntries(list.map((campaign) => [campaign.id, (campaign.objective || '').toUpperCase()]));
  await env.DB.put(key, JSON.stringify(map), { expirationTtl: 3600 });
  return map;
};

const buildReportPrettyRange = async (
  adAccountId: string,
  range: { since: string; until: string; label: string },
  token: string,
  campaignIds: string[] = [],
  kpi: any = null,
  env: Env,
) => {
  const fields = ['campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks', 'ctr', 'actions', 'frequency'].join(',');
  const params = new URLSearchParams({
    access_token: token,
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    level: 'campaign',
    fields,
    limit: '200',
  });
  if (campaignIds.length) {
    params.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]));
  }
  const response = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/insights?${params.toString()}`);
  const json = await response.json();
  if (!json?.data) return `<b>Отчёт</b> (${range.since}–${range.until})\nОшибка Meta API: ${escapeHTML(JSON.stringify(json))}`;

  let objectiveMap: Record<string, string> = {};
  try {
    objectiveMap = await getObjectiveMap(adAccountId, token, env);
  } catch (error) {
    objectiveMap = {};
  }

  const total = { spend: 0, count: 0 };
  const rows = json.data
    .map((entry: any) => {
      const spend = Number(entry.spend || 0);
      const objective = objectiveMap[entry.campaign_id] || '';
      const metric = pickMetricForObjective(objective);
      const count = extractActionCount(entry.actions, metric.actions);
      total.spend += spend;
      total.count += count;
      return {
        name: entry.campaign_name || '—',
        spend,
        count,
        metric,
        cpa: count ? spend / count : null,
      };
    })
    .sort((a: any, b: any) => b.spend - a.spend);

  const lines = rows
    .map(
      (row: any) =>
        `• <b>${escapeHTML(truncate(row.name, 48))}</b> — $${row.spend.toFixed(2)} | ${row.metric.label}: ${formatNumber(
          row.count,
        )} | ${row.metric.short === 'leads' ? 'CPL' : 'CPA'}: ${row.cpa != null ? row.cpa.toFixed(2) : '—'}`,
    )
    .join('\n');

  const cpaTotal = total.count ? (total.spend / total.count).toFixed(2) : '—';
  let kpiLine = '';
  if (kpi && (kpi.cpl || kpi.leads_per_day || kpi.daily_budget)) {
    const cplTarget = kpi.cpl || 0;
    const leadsTarget = kpi.leads_per_day || 0;
    const budgetTarget = kpi.daily_budget || 0;
    const cplOk = cplTarget > 0 && total.count > 0 ? total.spend / total.count <= cplTarget : null;
    const leadsOk = leadsTarget > 0 ? total.count >= leadsTarget : null;
    const budgetOk = budgetTarget > 0 ? total.spend <= budgetTarget : null;
    const icon = (value: boolean | null) => (value == null ? '•' : value ? '✅' : '⚠️');
    kpiLine = `\n<b>KPI:</b> CPL/CPA≤${cplTarget || '—'} ${icon(cplOk)} | Рез/д≥${leadsTarget || '—'} ${icon(
      leadsOk,
    )} | Бюд/д≤${budgetTarget || '—'} ${icon(budgetOk)}`;
  }

  return `<b>Отчёт</b> (${range.since}–${range.until})\n${lines}\n\n<b>ИТОГО:</b> $${total.spend.toFixed(2)} | Результаты: ${formatNumber(
    total.count,
  )} | CPA ср: ${cpaTotal}${kpiLine}`;
};

const buildReportPretty = async (
  adAccountId: string,
  period: string | { since: string; until: string; label: string },
  token: string,
  campaignIds: string[] = [],
  kpi: any = null,
  tz: string,
  env: Env,
) => {
  const range = typeof period === 'string' ? toRange(period, tz) : period;
  return buildReportPrettyRange(adAccountId, range, token, campaignIds, kpi, env);
};


const loadCampaignRows = async (
  adAccountId: string,
  range: { since: string; until: string; label: string },
  token: string,
  campaignIds: string[],
  env: Env,
) => {
  const params = new URLSearchParams({
    access_token: token,
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,actions',
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    limit: '500',
  });
  if (campaignIds.length) {
    params.set('filtering', JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }]));
  }
  const json = await (await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/insights?${params.toString()}`)).json();
  let objectiveMap: any = {};
  try {
    objectiveMap = await getObjectiveMap(adAccountId, token, env);
  } catch (error) {
    objectiveMap = {};
  }
  return (json.data || [])
    .map((entry: any) => {
      const spend = Number(entry.spend || 0);
      const objective = objectiveMap[entry.campaign_id] || '';
      const metric = pickMetricForObjective(objective);
      const count = extractActionCount(entry.actions || [], metric.actions);
      return { name: entry.campaign_name || '—', spend, count, cpa: count ? spend / count : null, metricLabel: metric.label };
    })
    .sort((a: any, b: any) => b.spend - a.spend);
};

const toCSV = (rows: any[][]) =>
  rows
    .map((row) =>
      row
        .map((value) => {
          const str = value == null ? '' : String(value);
          return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(';'),
    )
    .join('\n');

const exportReportCSV = async (project: StoredProject, env: Env, token: string, period: string) => {
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const range = toRange(period || project.period || 'yesterday', tz);
  const params = new URLSearchParams({
    access_token: token,
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,actions',
    time_range: JSON.stringify({ since: range.since, until: range.until }),
    limit: '500',
  });
  const json = await (await fetch(`https://graph.facebook.com/v19.0/${project.act}/insights?${params.toString()}`)).json();
  let objectiveMap: any = {};
  try {
    objectiveMap = await getObjectiveMap(project.act, token, env);
  } catch (error) {
    objectiveMap = {};
  }
  const rows: any[][] = [[
    'Campaign',
    'Objective',
    'Metric',
    'Spend',
    'Results',
    'CPA',
    'Impr',
    'Clicks',
    'CTR %',
  ]];
  const total = { spend: 0, results: 0, impr: 0, clicks: 0 };
  for (const entry of json.data || []) {
    const spend = Number(entry.spend || 0);
    const objective = objectiveMap[entry.campaign_id] || '';
    const metric = pickMetricForObjective(objective);
    const count = extractActionCount(entry.actions || [], metric.actions);
    const impressions = Number(entry.impressions || 0);
    const clicks = Number(entry.clicks || 0);
    const ctr = Number(entry.ctr || 0);
    rows.push([
      entry.campaign_name || '—',
      objective || '—',
      metric.label,
      spend.toFixed(2),
      count,
      count ? (spend / count).toFixed(2) : '',
      impressions,
      clicks,
      ctr.toFixed(2),
    ]);
    total.spend += spend;
    total.results += count;
    total.impr += impressions;
    total.clicks += clicks;
  }
  rows.push([]);
  rows.push([
    'TOTAL',
    '—',
    '—',
    total.spend.toFixed(2),
    total.results,
    total.results ? (total.spend / total.results).toFixed(2) : '',
    total.impr,
    total.clicks,
    '',
  ]);
  return { csv: toCSV(rows), range };
};

const pushToSheets = async (env: Env, payload: any) => {
  if (!env.GS_WEBHOOK) return { ok: false, reason: 'no webhook' };
  await fetch(env.GS_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: true };
};


const todaySpend = async (act: string, token: string, env: Env) => {
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const cached = await getTodaySpendCached(env.DB, act.replace(/^act_/, ''), tz);
  if (cached) return cached;
  const value = ymdLocal(new Date(), tz);
  const params = new URLSearchParams({
    access_token: token,
    level: 'account',
    time_range: JSON.stringify({ since: value, until: value }),
    fields: 'spend',
    limit: '1',
  });
  const json = await (await fetch(`https://graph.facebook.com/v19.0/${act}/insights?${params.toString()}`)).json();
  const spend = Number(json?.data?.[0]?.spend || 0);
  const out = { spend };
  await putTodaySpendCached(env.DB, act.replace(/^act_/, ''), tz, out);
  return out;
};

const badAccountStatus = (status: number) => new Set([2, 3, 7, 8, 9, 1002]).has(Number(status));

const humanBillingReason = (entry: any) => {
  const parts: string[] = [];
  if (entry.account_status != null) parts.push(`account_status=${entry.account_status}`);
  if (entry.disable_reason != null) parts.push(`disable_reason=${entry.disable_reason}`);
  if (entry.is_prepay_account && Number(entry.balance) <= 0) parts.push('prepay balance ≤ 0');
  if (entry.spend_cap && Number(entry.amount_spent) >= Number(entry.spend_cap)) parts.push('достигнут spend_cap');
  if (entry.funding_source_details?.display_string) parts.push(`Источник: ${entry.funding_source_details.display_string}`);
  return parts.join(' · ') || 'неизвестно';
};

const checkBillingAndNotify = async (project: StoredProject, env: Env) => {
  try {
    const botToken = requireBotToken(env);
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    const fields =
      'id,name,account_status,disable_reason,is_prepay_account,amount_spent,spend_cap,balance,currency,funding_source_details{display_string}';
    const url = `https://graph.facebook.com/v19.0/${project.act}?fields=${encodeURIComponent(fields)}&access_token=${token}`;
    const json = await (await fetch(url)).json();
    if (!json || json.error) return;
    const issue =
      badAccountStatus(json.account_status) ||
      (json.is_prepay_account && Number(json.balance) <= 0) ||
      (json.spend_cap && Number(json.amount_spent) >= Number(json.spend_cap));
    const key = `acctstate:${json.id || project.act}:digest`;
    const digest = JSON.stringify({
      st: json.account_status,
      dr: json.disable_reason,
      bal: json.balance,
      cap: json.spend_cap,
      spent: json.amount_spent,
    });
    const previous = await env.DB.get(key);
    if (issue && digest !== previous) {
      const actName = await accountName(project.act, env);
      const label = await projectLabel(project, env);
      const reason = humanBillingReason(json);
      for (const admin of adminList(env)) {
        await tSend(botToken, {
          chat_id: admin,
          parse_mode: 'HTML',
          text: `⚠️ <b>Проблема биллинга/доставки</b>\n${label}\nАккаунт: <b>${escapeHTML(actName)}</b>\nПричина: ${escapeHTML(
            reason,
          )}\n\nПроверьте карту/лимиты/уведомления в Ads Manager.`,
        });
      }
      await env.DB.put(key, digest, { expirationTtl: 60 * 60 * 12 });
    }
  } catch (error) {
    // ignore
  }
};

const hasActiveCampaigns = async (act: string, token: string) => {
  let url = `https://graph.facebook.com/v19.0/${act}/campaigns?fields=id,name,status,effective_status&limit=100&access_token=${token}`;
  for (let i = 0; i < 10; i += 1) {
    const json = await (await fetch(url)).json();
    if (Array.isArray(json?.data)) {
      if (json.data.some((campaign: any) => campaign.status === 'ACTIVE' || campaign.effective_status === 'ACTIVE')) {
        return true;
      }
    }
    if (!json?.paging?.next) break;
    url = json.paging.next;
  }
  return false;
};

const checkZeroSpendWithActiveCampaigns = async (project: StoredProject, env: Env) => {
  try {
    const botToken = requireBotToken(env);
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    const spend = await todaySpend(project.act, token, env);
    const key = `flag:zero:${project.code}:${ymdLocal(new Date(), env.DEFAULT_TZ || 'Asia/Tashkent')}`;
    if (Number(spend.spend || 0) > 0) {
      await env.DB.delete(key);
      return;
    }
    if (await env.DB.get(key)) return;
    const active = await hasActiveCampaigns(project.act, token);
    if (active) {
      const actName = await accountName(project.act, env);
      const label = await projectLabel(project, env);
      for (const admin of adminList(env)) {
        await tSend(botToken, {
          chat_id: admin,
          parse_mode: 'HTML',
          text: `⚠️ <b>После контрольного времени расход = 0</b>\n${label}\nАккаунт: <b>${escapeHTML(
            actName,
          )}</b>\nВозможные причины: отклонения, лимиты, оплата/карта, пауза.`,
        });
      }
      await env.DB.put(key, '1', { expirationTtl: 60 * 60 * 24 });
    }
  } catch (error) {
    // ignore
  }
};


const checkKPIAndAutopauseStreak = async (projectInput: StoredProject, env: Env) => {
  const project = normalizeProject(projectInput);
  if (!project.autopause?.enabled || !project.kpi?.cpl) return;
  try {
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
    const range = toRange('yesterday', tz);
    const params = new URLSearchParams({
      access_token: token,
      level: 'account',
      fields: 'spend,actions',
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      limit: '1',
    });
    const json = await (await fetch(`https://graph.facebook.com/v19.0/${project.act}/insights?${params.toString()}`)).json();
    const spend = Number(json?.data?.[0]?.spend || 0);
    const results = extractAnyResult(json?.data?.[0]?.actions || []);
    const cpa = results > 0 ? spend / results : Infinity;
    const key = `streak:${project.code}`;
    let streak = Number((await env.DB.get(key)) || '0');
    if (cpa > project.kpi.cpl) streak += 1;
    else streak = 0;
    await env.DB.put(key, `${streak}`, { expirationTtl: 60 * 60 * 24 * 30 });
    if (streak >= (project.autopause.days || 3)) {
      const label = await projectLabel(project, env);
      await notifyAdmins(
        env,
        `⚠️ <b>КПИ: CPA выше цели ${streak} дн. подряд</b>\n${label}\nФакт CPA: ${isFinite(cpa) ? cpa.toFixed(2) : '∞'} > цель ${
          project.kpi.cpl
        }\n\nПредложить автопаузу выбранных кампаний?`,
        [[{ text: '⏸ Поставить на паузу выбранные кампании', callback_data: `proj:pause_suggest:${project.code}` }]],
      );
      await env.DB.put(key, '0', { expirationTtl: 60 * 60 * 24 * 30 });
    }
  } catch (error) {
    // ignore
  }
};

const pauseSelectedCampaigns = async (project: StoredProject, env: Env) => {
  const token = await resolveTokenAnyAdmin(env);
  if (!token) return { ok: 0, fail: 0 };
  const ids = project.campaigns || [];
  let ok = 0;
  let fail = 0;
  for (const cid of ids) {
    const response = await fetch(`https://graph.facebook.com/v19.0/${cid}?access_token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: 'PAUSED' }),
    });
    const json = await response.json();
    if (json && json.success) ok += 1;
    else fail += 1;
  }
  return { ok, fail };
};

const checkDisapprovals = async (project: StoredProject, env: Env) => {
  try {
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    let url = `https://graph.facebook.com/v19.0/${project.act}/ads?fields=id,name,effective_status,configured_status,ad_review_feedback&limit=200&access_token=${token}`;
    let total = 0;
    let bad = 0;
    const samples: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const json = await (await fetch(url)).json();
      const arr = json?.data || [];
      total += arr.length;
      for (const ad of arr) {
        const status = (ad.effective_status || '').toUpperCase();
        if (status.includes('DISAPPROVED') || status.includes('PENDING_REVIEW')) {
          bad += 1;
          samples.push(`${truncate(ad.name, 32)} — ${status}`);
        }
      }
      if (!json?.paging?.next) break;
      url = json.paging.next;
    }
    if (total >= 10 && bad / Math.max(total, 1) >= 0.3) {
      const label = await projectLabel(project, env);
      await notifyAdmins(
        env,
        `🚫 <b>Массовые отклонения/ревью</b>\n${label}\nПроблемных: ${bad}/${total}\nПримеры:\n${escapeHTML(
          samples.slice(0, 5).join('\n'),
        )}`,
      );
    }
  } catch (error) {
    // ignore
  }
};

const checkAnomalies = async (project: StoredProject, env: Env) => {
  try {
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
    const today = toRange('today', tz);
    const yesterday = toRange('yesterday', tz);
    const fields = 'campaign_name,spend,impressions,clicks,ctr,actions,frequency';
    const query = (range: any) =>
      fetch(
        `https://graph.facebook.com/v19.0/${
          project.act
        }/insights?${new URLSearchParams({
          access_token: token,
          level: 'campaign',
          fields,
          time_range: JSON.stringify({ since: range.since, until: range.until }),
          limit: '200',
        }).toString()}`,
      ).then((r) => r.json());
    const [todayJson, yesterdayJson] = await Promise.all([query(today), query(yesterday)]);
    const map = (json: any) =>
      Object.fromEntries(
        (json.data || []).map((entry: any) => [
          entry.campaign_name,
          {
            spend: Number(entry.spend || 0),
            impressions: Number(entry.impressions || 0),
            clicks: Number(entry.clicks || 0),
            ctr: Number(entry.ctr || 0),
            results: extractAnyResult(entry.actions || []),
            frequency: Number(entry.frequency || 0),
          },
        ]),
      );
    const todayMap = map(todayJson);
    const yesterdayMap = map(yesterdayJson);
    const flags: string[] = [];
    for (const name of Object.keys(todayMap)) {
      const current = todayMap[name];
      const prev = yesterdayMap[name] || { spend: 0, impressions: 0, clicks: 0, ctr: 0, results: 0, frequency: 0 };
      const cpaCurrent = current.results > 0 ? current.spend / current.results : Infinity;
      const cpaPrev = prev.results > 0 ? prev.spend / prev.results : Infinity;
      const ctrDrop = prev.ctr > 0 ? (prev.ctr - current.ctr) / prev.ctr : 0;
      const imprDrop = prev.impressions > 0 ? (prev.impressions - current.impressions) / prev.impressions : 0;
      if (
        (project.kpi?.cpl && isFinite(cpaCurrent) && cpaCurrent > project.kpi.cpl * (1 + project.anomaly.cpl_jump)) ||
        ctrDrop > project.anomaly.ctr_drop ||
        imprDrop > project.anomaly.impr_drop ||
        current.frequency > project.anomaly.freq
      ) {
        flags.push(
          `• <b>${escapeHTML(truncate(name, 42))}</b> — CPA: ${isFinite(cpaCurrent) ? cpaCurrent.toFixed(2) : '∞'} (${isFinite(
            cpaPrev,
          )
            ? `vs ${cpaPrev.toFixed(2)}`
            : '—'}), CTR ${current.ctr.toFixed(2)}%, Impr ${formatNumber(current.impressions)}, Freq ${
            current.frequency.toFixed(2)
          }`,
        );
      }
    }
    if (flags.length) {
      const label = await projectLabel(project, env);
      await notifyAdmins(
        env,
        `📉 <b>Аномалии метрик</b>\n${label}\n${flags.slice(0, 10).join('\n')}${flags.length > 10 ? '\n…' : ''}`,
      );
    }
  } catch (error) {
    // ignore
  }
};

const checkCreativeFatigue = async (project: StoredProject, env: Env) => {
  try {
    const token = await resolveTokenAnyAdmin(env);
    if (!token) return;
    const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
    const range = toRange('last_7d', tz);
    const fields = 'ad_name,spend,impressions,clicks,ctr,actions,frequency';
    let url = `https://graph.facebook.com/v19.0/${
      project.act
    }/insights?${new URLSearchParams({
      access_token: token,
      level: 'ad',
      fields,
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      limit: '200',
    }).toString()}`;
    const tired: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const json = await (await fetch(url)).json();
      for (const entry of json.data || []) {
        const spend = Number(entry.spend || 0);
        const freq = Number(entry.frequency || 0);
        const ctr = Number(entry.ctr || 0);
        const results = extractAnyResult(entry.actions || []);
        const cpa = results > 0 ? spend / results : Infinity;
        if (freq > 3.5 && ctr < 0.5 && (!isFinite(cpa) || cpa > (project.kpi?.cpl || Infinity) * 1.2)) {
          tired.push(
            `• ${escapeHTML(truncate(entry.ad_name || '—', 42))} — Freq ${freq.toFixed(2)}, CTR ${ctr.toFixed(2)}%, CPA ${
              isFinite(cpa) ? cpa.toFixed(2) : '∞'
            }`,
          );
        }
      }
      if (!json?.paging?.next) break;
      url = json.paging.next;
    }
    if (tired.length) {
      const label = await projectLabel(project, env);
      await notifyAdmins(
        env,
        `🧩 <b>Усталость креативов</b>\n${label}\n${tired.slice(0, 10).join('\n')}${tired.length > 10 ? '\n…' : ''}\nСовет: ротация/новые связки.`,
      );
    }
  } catch (error) {
    // ignore
  }
};


const getPortalSig = (DB: KVNamespace, code: string) => DB.get(`portal:${code}:sig`);
const setPortalSig = (DB: KVNamespace, code: string, sig: string) => DB.put(`portal:${code}:sig`, sig);
const delPortalSig = (DB: KVNamespace, code: string) => DB.delete(`portal:${code}:sig`);

const genSig = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const portalURL = (base: string, code: string, sig: string) =>
  `${(base || '').replace(/\/$/, '')}/p/${encodeURIComponent(code)}?sig=${encodeURIComponent(sig)}`;

const portalError = (message: string) => `<!doctype html><meta charset="utf-8">
<title>Отчёт недоступен</title>
<style>
  body{font:16px system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:40px;color:#111}
  .card{max-width:720px;margin:auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.06)}
  h1{font-size:20px;margin:0 0 8px}
  p{margin:0;color:#555}
</style>
<div class="card"><h1>Отчёт недоступен</h1><p>${escapeHTML(message)}</p></div>`;

const renderPortalHTML = (model: any, url: URL) => {
  const periods = [
    { key: 'today', label: 'Сегодня' },
    { key: 'yesterday', label: 'Вчера' },
    { key: 'last_7d', label: '7 дней' },
    { key: 'last_week', label: 'Прошлая неделя' },
    { key: 'month_to_date', label: 'С начала месяца' },
  ];
  const link = (key: string) => {
    const next = new URL(url.toString());
    next.searchParams.set('period', key);
    return escapeHTML(next.toString());
  };
  const rowsHtml = model.rows
    .map(
      (row: any) => `
      <tr>
        <td class="name" title="${escapeHTML(row.name)}">${escapeHTML(truncate(row.name, 64))}</td>
        <td class="num">$${row.spend.toFixed(2)}</td>
        <td class="num">${formatNumber(row.count)} <span class="badge2">${escapeHTML(row.metricLabel)}</span></td>
        <td class="num">${row.cpa != null ? `$${row.cpa.toFixed(2)}` : '—'}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><meta charset="utf-8">
  <title>${escapeHTML(model.projectTitle)} — отчёт</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root{--ink:#111;--mut:#667085;--bg:#fff;--line:#eee;--pill:#f3f4f6}
    body{background:var(--bg);color:var(--ink);font:16px system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:16px}
    .wrap{max-width:980px;margin:24px auto}
    .head{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    .title{font-weight:700;font-size:20px}
    .sub{color:var(--mut);font-size:14px}
    .bar{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}
    .btn{padding:8px 12px;border-radius:999px;background:var(--pill);text-decoration:none;color:#111;border:1px solid var(--line)}
    .btn.active{background:#111;color:#fff;border-color:#111}
    table{width:100%;border-collapse:collapse;margin:12px 0 4px}
    th,td{border-bottom:1px solid var(--line);padding:10px 8px;font-size:14px}
    th{color:#444;text-align:left}
    td.num{text-align:right;font-variant-numeric:tabular-nums}
    td.name{max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .total{font-weight:700}
    .foot{display:flex;justify-content:space-between;gap:12px;color:#667085;font-size:13px;margin-top:8px}
    .badge{padding:4px 8px;border:1px solid var(--line);border-radius:8px;background:#fafafa}
    .badge2{margin-left:6px;padding:2px 8px;border:1px solid var(--line);border-radius:999px;background:#f6f6f6;color:#555;font-size:12px}
  </style>
  <div class="wrap">
    <div class="head">
      <div class="title">${escapeHTML(model.projectTitle)}</div>
      <div class="sub">Аккаунт: ${escapeHTML(model.accountName)}</div>
      <div class="sub badge">Следующая оплата: ${escapeHTML(model.nextBill)}</div>
    </div>
    <div class="bar">
      ${periods
        .map(
          (period) =>
            `<a class="btn ${period.key === model.period ? 'active' : ''}" href="${link(period.key)}">${period.label}</a>`,
        )
        .join('')}
      <span class="sub" style="margin-left:8px">(${escapeHTML(model.range.since)} — ${escapeHTML(model.range.until)})</span>
    </div>
    <table>
      <thead><tr><th>Кампания</th><th class="num">Spend</th><th class="num">Результат</th><th class="num">CPA</th></tr></thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="4" class="sub">Нет данных за выбранный период</td></tr>`}
        <tr class="total"><td>ИТОГО</td><td class="num">$${model.total.spend.toFixed(2)}</td><td class="num">${formatNumber(model.total.count)}</td><td class="num">${model.cpaTot != null ? `$${model.cpaTot.toFixed(2)}` : '—'}</td></tr>
      </tbody>
    </table>
    <div class="foot">
      <div>Обновлено: ${escapeHTML(model.when)} (${escapeHTML(model.tz)})</div>
      <div class="sub">Read-only портал. KPI и внутренние данные скрыты.</div>
    </div>
  </div>`;
};


const tSend = (token: string, body: any) =>
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const tEdit = (token: string, body: any) =>
  fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const tAns = (token: string, id: string, text: string) =>
  fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text }),
  });

const tSendDoc = async (
  token: string,
  chatId: number,
  threadId: number | null,
  blob: ArrayBuffer | Uint8Array | string,
  filename: string,
  caption?: string,
) => {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (threadId) form.append('message_thread_id', String(threadId));
  form.append('caption', caption || '');
  form.append('document', new Blob([blob], { type: 'text/csv' }), filename);
  await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
};

const sendToTopic = (token: string, chatId: number, threadId: number | null, html: string) =>
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: threadId || undefined,
      text: html,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

const tReply = (token: string, msg: any, text: string, extra: any = {}) => {
  const body: any = { chat_id: msg.chat.id, text, ...extra };
  if (msg.message_thread_id) body.message_thread_id = msg.message_thread_id;
  return tSend(token, body);
};

const tReplyDoc = (token: string, msg: any, blob: ArrayBuffer, filename: string, caption?: string) =>
  tSendDoc(token, msg.chat.id, msg.message_thread_id || null, blob, filename, caption || '');


const fbAuth = async (url: URL, env: Env) => {
  const uid = url.searchParams.get('uid');
  if (!uid) return new Response('No uid', { status: 400 });
  const missing = missingConfig(env, ['FB_APP_ID', 'FB_APP_SECRET']);
  if (missing.length) {
    console.error(`[config] Meta OAuth unavailable, missing: ${missing.join(', ')}`);
    return new Response('Meta OAuth is not configured', { status: 500 });
  }
  const force = url.searchParams.get('force');
  const redirect = `${env.WORKER_URL || url.origin}/fb_cb`;
  const scope = 'ads_read,ads_management,business_management';
  let link = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${env.FB_APP_ID}&redirect_uri=${encodeURIComponent(
    redirect,
  )}&state=${encodeURIComponent(uid)}&scope=${scope}`;
  if (force) link += '&auth_type=rerequest';
  return Response.redirect(link, 302);
};

const fbCallback = async (url: URL, env: Env) => {
  const code = url.searchParams.get('code');
  const uid = url.searchParams.get('state');
  const redirect = `${env.WORKER_URL || url.origin}/fb_cb`;
  const missing = missingConfig(env, ['FB_APP_ID', 'FB_APP_SECRET']);
  if (missing.length) {
    console.error(`[config] Meta OAuth callback aborted, missing: ${missing.join(', ')}`);
    return new Response('Meta OAuth is not configured', { status: 500 });
  }
  if (!code || !uid) return htmlResponse('OAuth error');
  const step1 = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${env.FB_APP_ID}&redirect_uri=${encodeURIComponent(
      redirect,
    )}&client_secret=${env.FB_APP_SECRET}&code=${code}`,
  );
  const json1 = await step1.json();
  const step2 = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.FB_APP_ID}&client_secret=${env.FB_APP_SECRET}&fb_exchange_token=${json1.access_token}`,
  );
  const json2 = await step2.json();
  const token = json2.access_token || json1.access_token;
  const me = await (await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`)).json();
  await saveUser(env.DB, uid, {
    fb_connected: true,
    fb_long_token: token,
    fb_user: me,
    fb_token_exp: Date.now() + (json2.expires_in || 60 * 24 * 3600) * 1000,
  });
  const base = await fetchAdAccountsDirect(uid, env);
  if (base.items?.length) await enrichAccounts(uid, env, base.items);
  return htmlResponse(`✅ Подключено как <b>${escapeHTML(me?.name || '—')}</b>. Вернитесь в Telegram.`);
};

const fbDebug = async (url: URL, env: Env) => {
  const uid = url.searchParams.get('uid') || '';
  const token = await resolveToken(uid, env);
  if (!token) return htmlResponse('Нет токена');
  const [me, perms, acts, biz] = await Promise.all([
    fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`).then((r) => r.json()),
    fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`).then((r) => r.json()),
    fetch(`https://graph.facebook.com/v19.0/me/adaccounts?limit=500&access_token=${token}`).then((r) => r.json()),
    fetch(`https://graph.facebook.com/v19.0/me/businesses?limit=200&access_token=${token}`).then((r) => r.json()),
  ]);
  return htmlResponse(
    `<h2>Meta Debug</h2>\nПользователь: <b>${escapeHTML(me?.name || '')}</b> (${escapeHTML(me?.id || '')})\nРазрешения: ${escapeHTML(
      JSON.stringify(perms?.data || [], null, 2),
    )}\n/me/adaccounts: ${acts?.data?.length || 0}\n/me/businesses: ${biz?.data?.length || 0}`,
  );
};


const accountName = async (actId: string, env: Env) => {
  const id = actId.replace(/^act_/, '');
  const meta = await getAcctMeta(env.DB, id);
  return meta?.name || `Account ${id}`;
};

const projectLabel = async (project: StoredProject, env: Env) => {
  const chat = await getChat(env.DB, project.chat_id, project.thread_id || 0);
  const act = await accountName(project.act, env);
  return `${escapeHTML(chat?.title || 'Группа')} → ${escapeHTML(act)}`;
};

const notifyAdmins = async (env: Env, text: string, kb?: any) => {
  const token = requireBotToken(env);
  for (const admin of adminList(env)) {
    await tSend(token, {
      chat_id: admin,
      parse_mode: 'HTML',
      text,
      reply_markup: kb ? { inline_keyboard: kb } : undefined,
    });
  }
};


const buildClientDigest = async (project: StoredProject, env: Env, token: string) => {
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const today = toRange('today', tz);
  const yesterday = toRange('yesterday', tz);
  const fields = 'campaign_name,spend,impressions,clicks,ctr,actions';
  const query = (range: any) =>
    fetch(
      `https://graph.facebook.com/v19.0/${
        project.act
      }/insights?${new URLSearchParams({
        access_token: token,
        level: 'campaign',
        fields,
        time_range: JSON.stringify({ since: range.since, until: range.until }),
        limit: '200',
      }).toString()}`,
    ).then((r) => r.json());
  const [todayJson, yesterdayJson] = await Promise.all([query(today), query(yesterday)]);
  const flat = (json: any) =>
    (json.data || []).map((entry: any) => ({
      name: entry.campaign_name || '—',
      spend: Number(entry.spend || 0),
      results: extractAnyResult(entry.actions || []),
      ctr: Number(entry.ctr || 0),
    }));
  const todayRows = flat(todayJson);
  const yesterdayRows = flat(yesterdayJson);
  const sum = (rows: any[], key: 'spend' | 'results') => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const spendToday = sum(todayRows, 'spend');
  const resultsToday = sum(todayRows, 'results');
  const cpaToday = resultsToday ? spendToday / resultsToday : Infinity;
  const spendYesterday = sum(yesterdayRows, 'spend');
  const resultsYesterday = sum(yesterdayRows, 'results');
  const cpaYesterday = resultsYesterday ? spendYesterday / resultsYesterday : Infinity;
  const topSpend = [...todayRows].sort((a, b) => b.spend - a.spend)[0];
  const bestCPA = todayRows.filter((row) => row.results > 0).sort((a, b) => a.spend / a.results - b.spend / b.results)[0];
  const trend = isFinite(cpaToday) && isFinite(cpaYesterday) ? (cpaToday <= cpaYesterday ? 'улучшение' : 'ухудшение') : '—';
  return `<b>Дайджест</b>
Период: сегодня
Потрачено: $${spendToday.toFixed(2)} | Результаты: ${formatNumber(resultsToday)} | CPA: ${
    isFinite(cpaToday) ? cpaToday.toFixed(2) : '—'
  }

<b>Инсайты:</b>
1) Топ по расходу: ${
    topSpend ? `${escapeHTML(truncate(topSpend.name, 42))} — $${topSpend.spend.toFixed(2)}` : '—'
  }
2) Лучший CPA: ${
    bestCPA ? `${escapeHTML(truncate(bestCPA.name, 42))} — $${(bestCPA.spend / bestCPA.results).toFixed(2)}` : '—'
  }
3) Динамика CPA vs вчера: ${trend} ${isFinite(cpaYesterday) ? `(вчера $${cpaYesterday.toFixed(2)})` : ''}`;
};

const sendWeeklyCombo = async (projectInput: StoredProject, env: Env) => {
  const project = normalizeProject(projectInput);
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const token = await resolveTokenAnyAdmin(env);
  if (!token) return;
  const botToken = requireBotToken(env);
  const key = `weekly:${project.code}:${ymdLocal(new Date(), tz)}`;
  if (await env.DB.get(key)) return;
  const weekly = await buildReportPretty(project.act, 'last_week', token, project.campaigns || [], project.kpi || null, tz, env);
  const second =
    project.weekly?.mode === 'week_yesterday'
      ? await buildReportPretty(project.act, 'yesterday', token, project.campaigns || [], project.kpi || null, tz, env)
      : await buildReportPretty(project.act, 'today', token, project.campaigns || [], project.kpi || null, tz, env);
  const label = project.weekly?.mode === 'week_yesterday' ? 'Вчера' : 'Сегодня';
  const text = `#${escapeHTML(project.code)}\n<b>Сводный отчёт (понедельник)</b>\n\n<b>Прошлая неделя</b>\n${weekly}\n\n<b>${label}</b>\n${second}`;
  await sendToTopic(botToken, project.chat_id, project.thread_id || null, text);
  await env.DB.put(key, '1', { expirationTtl: 60 * 60 * 24 });
};

const sendReportForProject = async (
  code: string,
  projectInput: StoredProject,
  env: Env,
  opts: { archive?: boolean; csv?: boolean } = {},
) => {
  const project = normalizeProject(projectInput);
  const token = await resolveTokenAnyAdmin(env);
  if (!token) return;
  const botToken = requireBotToken(env);
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const period = project.period || 'yesterday';
  const html = await buildReportPretty(project.act, period, token, project.campaigns || [], project.kpi || null, tz, env);
  await sendToTopic(botToken, project.chat_id, project.thread_id || null, `#${escapeHTML(code)}\n${html}`);

  let csvBlob: Uint8Array | null = null;
  if (opts.csv) {
    const { csv, range } = await exportReportCSV(project, env, token, period);
    csvBlob = new TextEncoder().encode(csv);
    await tSendDoc(
      botToken,
      project.chat_id,
      project.thread_id || null,
      csvBlob,
      `report_${code}_${range.since}_${range.until}.csv`,
      `CSV отчёт #${code}`,
    );
    await pushToSheets(env, { code, period, ts: Date.now(), csv });
  }

  if (opts.archive) {
    await archiveReport(env.DB, code, {
      ts: Date.now(),
      type: 'auto',
      period,
      html,
      csv: csvBlob ? new TextDecoder().decode(csvBlob) : null,
    });
  }
};

const handlePortal = async (url: URL, env: Env) => {
  const parts = url.pathname.split('/').filter(Boolean);
  const code = parts[1];
  if (!code) return new Response('Not found', { status: 404 });
  const sig = url.searchParams.get('sig') || '';
  const stored = await getPortalSig(env.DB, code);
  if (!stored || stored !== sig) return new Response('Forbidden', { status: 403 });
  const rawProject = await getProject(env.DB, code);
  if (!rawProject) return new Response('Not found', { status: 404 });
  const project = normalizeProject({ code, ...rawProject });
  const tz = env.DEFAULT_TZ || 'Asia/Tashkent';
  const token = await resolveTokenAnyAdmin(env);
  if (!token) return htmlResponse(portalError('Временно недоступно (нет Meta токена).'));
  const allowed = new Set(['today', 'yesterday', 'last_7d', 'last_week', 'month_to_date']);
  let period = url.searchParams.get('period') || project.period || 'yesterday';
  if (!allowed.has(period)) period = 'yesterday';
  const range = toRange(period, tz);
  const rows = await loadCampaignRows(project.act, range, token, project.campaigns || [], env);
  const total = rows.reduce(
    (acc, row) => ({ spend: acc.spend + row.spend, count: acc.count + row.count }),
    { spend: 0, count: 0 },
  );
  const cpaTot = total.count ? total.spend / total.count : null;
  const chat = await getChat(env.DB, project.chat_id, project.thread_id || 0);
  const accountNameValue = await accountName(project.act, env);
  const when = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const body = renderPortalHTML(
    {
      code,
      projectTitle: chat?.title || 'Проект',
      accountName: accountNameValue,
      period,
      range,
      rows,
      total,
      cpaTot,
      nextBill: project.billing_next_at ? fmtDate(project.billing_next_at, tz) : '—',
      tz,
      when,
    },
    url,
  );
  return new Response(body, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
};


const handleTelegram = async (update: any, env: Env) => {
  const bot = requireBotToken(env);
  const message = update.message || update.callback_query?.message;
  if (!message) return;
  const text: string = update.message?.text || '';
  const fromId = String(update.message?.from?.id || update.callback_query?.from?.id || '');

  if (update.callback_query) {
    const data: string = update.callback_query.data || '';
    if (data.startsWith('proj:pause_suggest:')) {
      const code = data.split(':')[2];
      const stored = await getProject(env.DB, code);
      if (!stored) {
        await tAns(bot, update.callback_query.id, 'Проект не найден');
        return;
      }
      const project = normalizeProject({ code, ...stored });
      const result = await pauseSelectedCampaigns(project, env);
      await tAns(bot, update.callback_query.id, 'Выполнено');
      await tSend(bot, {
        chat_id: update.callback_query.message.chat.id,
        parse_mode: 'HTML',
        text: `⏸ Пауза кампаний #${escapeHTML(code)} — успешно: ${result.ok}, ошибок: ${result.fail}`,
      });
      return;
    }
    await tAns(bot, update.callback_query.id, 'OK');
    return;
  }

  if (!text) return;

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await tReply(
      bot,
      message,
      `Команды:
/ register — выполнить в нужной теме группы
/ whoami — показать chat_id и message_thread_id
/ report <код> [period]
/ digest <код>
/ portal <код> — получить ссылку на портал`,
    );
    return;
  }

  if (text.startsWith('/whoami')) {
    const cid = message.chat?.id;
    const tid = message.message_thread_id || null;
    const link = tgTopicLink(cid, tid || 1);
    const sample = `https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage?chat_id=${cid}&message_thread_id=${tid || 1}&text=TEST`;
    await tReply(bot, message, `chat_id: <code>${cid}</code>
thread_id: <code>${tid ?? '—'}</code>

Тема: ${link}
Пример sendMessage:
<code>${escapeHTML(sample)}</code>`, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    return;
  }

  if (text.startsWith('/register')) {
    if (!message.message_thread_id) {
      await tReply(bot, message, 'Вызовите /register внутри нужного топика.');
      return;
    }
    await saveChat(env.DB, message.chat.id, message.message_thread_id, {
      title: message.chat.title || '—',
      thread_name: 'Тема',
      added_by: message.from?.id,
      created_at: Date.now(),
    });
    await tReply(bot, message, `✅ Зарегистрировано: ${message.chat.title || '—'} / topic #${message.message_thread_id}`);
    return;
  }

  if (text.startsWith('/report')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await tReply(bot, message, 'Формат: /report код [period]');
      return;
    }
    const code = parts[1];
    const period = parts[2];
    const stored = await getProject(env.DB, code);
    if (!stored) {
      await tReply(bot, message, `Проект ${code} не найден`);
      return;
    }
    const project = normalizeProject({ code, ...stored });
    if (period) project.period = period;
    await sendReportForProject(code, project, env, { archive: false, csv: false });
    await tReply(bot, message, '📨 Отчёт отправлен в клиентский чат');
    return;
  }

  if (text.startsWith('/digest')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await tReply(bot, message, 'Формат: /digest код');
      return;
    }
    const code = parts[1];
    const stored = await getProject(env.DB, code);
    if (!stored) {
      await tReply(bot, message, `Проект ${code} не найден`);
      return;
    }
    const project = normalizeProject({ code, ...stored });
    const token = await resolveTokenAnyAdmin(env);
    if (!token) {
      await tReply(bot, message, 'Нет доступного Meta токена');
      return;
    }
    const digest = await buildClientDigest(project, env, token);
    await sendToTopic(bot, project.chat_id, project.thread_id || null, `#${escapeHTML(code)}\n${digest}`);
    await tReply(bot, message, 'Дайджест отправлен');
    return;
  }

  if (text.startsWith('/portal')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await tReply(bot, message, 'Формат: /portal код');
      return;
    }
    const code = parts[1];
    const stored = await getProject(env.DB, code);
    if (!stored) {
      await tReply(bot, message, `Проект ${code} не найден`);
      return;
    }
    let sig = await getPortalSig(env.DB, code);
    if (!sig) {
      sig = genSig();
      await setPortalSig(env.DB, code, sig);
    }
    const base = env.WORKER_URL || 'https://example.com';
    const url = portalURL(base, code, sig);
    await tReply(bot, message, `Ссылка на портал:
${url}`);
    return;
  }

  if (text.startsWith('/admin')) {
    if (!isAdmin(fromId, env)) {
      await tReply(bot, message, 'Нет доступа');
      return;
    }
    const accounts = await fetchAdAccountsDirect(fromId, env);
    if (accounts.items?.length) await enrichAccounts(fromId, env, accounts.items);
    const projects = await listProjects(env.DB);
    await tReply(
      bot,
      message,
      `Админ-панель

Аккаунтов найдено: ${accounts.items?.length || 0}
Проектов: ${projects.length}
Команды для работы из чата:
/report <код>
/digest <код>
/portal <код>`,
    );
    return;
  }
};
