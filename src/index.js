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
const STATE_TTL_SECONDS = 600;
const PROJECT_CODE_PATTERN = /^[a-z0-9_-]{3,32}$/i;

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
  return String(env.ADMIN_IDS || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id));
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
  const times = Array.isArray(safe.times) && safe.times.length
    ? safe.times.map((value) => String(value))
    : [String(safe.time ?? '09:30')];

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
      billing_times:
        Array.isArray(safe.alerts?.billing_times) && safe.alerts.billing_times.length
          ? safe.alerts.billing_times.map((value) => String(value))
          : ['10:00', '14:00', '18:00'],
      no_spend_by: safe.alerts?.no_spend_by ?? '12:00',
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
  if (!state || state.mode !== 'create_project') {
    return { handled: false, reason: 'no_state' };
  }

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

    const project = createProjectDraft({
      code: data.code,
      act,
      chat_id: data.chat_id,
      thread_id: data.thread_id ?? 0,
    });

    await saveProject(env, project);
    await clearUserState(env, uid);

    await telegramSendMessage(
      env,
      message,
      ['✅ Проект создан.', formatProjectSummary(project), '', 'Настройте расписание и KPI через админ-панель.'].join('\n'),
      { disable_reply: true },
    );

    return { handled: true, step: 'completed' };
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

  return { handled: false, reason: 'unknown_step' };
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
        ? `<code>${project.chat_id}</code> · thread <code>${project.thread_id ?? 0}</code>`
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
