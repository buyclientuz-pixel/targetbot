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
  return `chat:${chatId}:${threadId ?? 0}`;
}

function buildHelpMessage() {
  return [
    'Привет! Это каркас бота отчётов по Meta Ads.',
    '',
    'Доступные команды:',
    '• /start — показать помощь',
    '• /help — краткая справка',
    '• /register — вызовите внутри нужного топика, чтобы привязать чат',
    '',
    'Остальные возможности будут добавляться по мере разработки.',
  ].join('\n');
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

async function telegramSendMessage(env, message, textContent) {
  if (!message?.chat?.id) {
    return { ok: false, error: 'chat_id_missing' };
  }

  const payload = {
    chat_id: message.chat.id,
    text: textContent,
    parse_mode: 'HTML',
  };

  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }

  if (message.message_id) {
    payload.reply_to_message_id = message.message_id;
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
    default:
      if (command.startsWith('/')) {
        return telegramSendMessage(env, message, 'Команда пока не поддерживается.');
      }
      return { ok: true, skipped: true };
  }
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
    await telegramAnswerCallback(env, payload.callback_query, 'Функция в разработке.');
    summary.handled = true;
    summary.kind = 'callback_query';
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

  const result = await handleTelegramCommand(env, message, command, args);
  summary.handled = true;
  summary.kind = 'command';
  summary.command = command;
  summary.result = result;

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
