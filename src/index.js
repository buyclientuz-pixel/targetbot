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

async function fetchWithTimeout(url, options = {}, timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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
      return telegramSendMessage(env, message, 'Команда /report будет реализована на следующем этапе.');
    case '/digest':
      return telegramSendMessage(env, message, 'Команда /digest будет реализована на следующем этапе.');
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
  authUrl.searchParams.set('state', uid);
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

  return html('<p>Заглушка fb_cb. Реализуйте обмен кода на токен и сохранение в KV.</p>');
}

async function handleFbDebug(request, env) {
  const url = new URL(request.url);
  const state = { url, missing: validateRequiredEnv(env), admins: parseAdminIds(env) };
  return html(renderDebugPage(state));
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

function renderAdminHome(uid, env) {
  const baseUrl = ensureWorkerUrl(env);
  const safeUid = encodeURIComponent(String(uid ?? ''));
  const authUrl = `${baseUrl}/fb_auth?uid=${safeUid}`;
  const forceUrl = `${authUrl}&force=1`;

  return {
    text: [
      '<b>Админ-панель th-reports</b>',
      '',
      'Выберите действие:',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔌 Подключить Meta', url: authUrl },
          { text: '♻️ Переподключить', url: forceUrl },
        ],
        [
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
    { text: '📤 Отчёт', callback_data: `proj:detail:todo:report:${project.code}` },
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

  const response = renderAdminHome(uid, env);
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
    const home = renderAdminHome(uid, env);
    return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
      reply_markup: home.reply_markup,
    });
  }

  if (data === 'proj:create:chatreset' || data.startsWith('proj:create:chatnext')) {
    const state = await loadUserState(env, uid);
    if (!state || state.mode !== 'create_project' || state.step !== 'choose_chat') {
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
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
      const home = renderAdminHome(uid, env);
      return telegramEditMessage(env, message.chat.id, message.message_id, home.text, {
        reply_markup: home.reply_markup,
      });
    }
  }

  if (data === 'panel:home') {
    const response = renderAdminHome(uid, env);
    return telegramEditMessage(env, message.chat.id, message.message_id, response.text, {
      reply_markup: response.reply_markup,
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

  if (data.startsWith('proj:detail:todo:')) {
    const [, , , action = '', rawCode = ''] = data.split(':');
    const code = sanitizeProjectCode(rawCode);
    if (!isValidProjectCode(code)) {
      await telegramAnswerCallback(env, callbackQuery, 'Код проекта не распознан.');
      return { ok: false, error: 'invalid_project_code' };
    }

    const hints = {
      report: 'Кнопка отправки отчёта заработает, когда реализуем /report.',
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
    ctx.waitUntil(Promise.resolve());
  },
};
