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
  constructor({ config, storage, telegram, env, executionContext }) {
    this.config = config;
    this.storage = storage;
    this.telegram = telegram;
    this.env = env;
    this.executionContext = executionContext;
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

      const [chatKeys, projectKeys] = await Promise.all([
        this.storage.listKeys('DB', CHAT_KEY_PREFIX, 100),
        this.storage.listKeys('DB', PROJECT_KEY_PREFIX, 100),
      ]);

      const summary = [
        '<b>Админ-панель (MVP)</b>',
        `• Зарегистрированных чатов: <b>${chatKeys.length}</b>`,
        `• Проектов: <b>${projectKeys.length}</b>`,
      ];

      if (this.config.defaultTimezone) {
        summary.push(`• Таймзона по умолчанию: <code>${this.config.defaultTimezone}</code>`);
      }

      if (this.config.workerUrl) {
        summary.push(`• Worker URL: ${this.config.workerUrl}`);
      }

      summary.push('', 'OAuth Meta, отчёты и алерты будут добавлены на следующих этапах.');

      await context.reply(summary.join('\n'));
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

  queueLog(entry) {
    if (!this.executionContext) return;
    const record = { ...entry };
    this.executionContext.waitUntil(
      this.storage
        .appendTelegramLog(record)
        .catch((error) => console.error('Failed to append telegram log', error)),
    );
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
      });
    }
    return this._bot;
  }

  async handleFetch() {
    const url = new URL(this.request.url);

    if (url.pathname === '/health') {
      return this.handleHealth(url);
    }

    if (url.pathname === '/tg' && this.request.method === 'POST') {
      return this.handleTelegramWebhook();
    }

    if (url.pathname === '/fb_auth') {
      return htmlResponse('<h1>Meta OAuth</h1><p>Этап в разработке. Функция появится в следующих релизах.</p>');
    }

    if (url.pathname === '/fb_cb') {
      return htmlResponse('<h1>Meta OAuth Callback</h1><p>Обработчик ещё не реализован.</p>', { status: 501 });
    }

    if (url.pathname === '/fb_debug') {
      return htmlResponse('<h1>Meta Debug</h1><p>Диагностика появится позже.</p>', { status: 501 });
    }

    if (url.pathname.startsWith('/p/')) {
      return htmlResponse('<h1>Портал клиента</h1><p>Раздел пока в разработке.</p>', { status: 501 });
    }

    if (url.pathname === '/' || url.pathname === '') {
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

  async handleTelegramWebhook() {
    if (!this.config.botToken) {
      return jsonResponse({ ok: false, error: 'BOT_TOKEN отсутствует' }, { status: 503 });
    }

    let update;
    try {
      update = await this.request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const bot = this.bot;
    if (!bot) {
      return jsonResponse({ ok: false, error: 'bot_not_initialized' }, { status: 503 });
    }

    const result = await bot.handleUpdate(update);
    return jsonResponse({ ok: true, result });
  }

  async handleScheduled(event) {
    if (!this.config.botToken || !this.telegramClient?.isUsable) {
      return;
    }

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
}

const worker = {
  async fetch(request, env, executionContext) {
    const app = new WorkerApp(request, env, executionContext);
    return app.handleFetch();
  },

  async scheduled(event, env, executionContext) {
    const app = new WorkerApp(new Request('https://worker.invalid/'), env, executionContext);
    return app.handleScheduled(event);
  },
};

export default worker;
