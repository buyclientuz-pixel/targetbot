#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const REQUIRED_ENV_KEYS = ['ADMIN_IDS', 'DEFAULT_TZ', 'FB_APP_ID', 'FB_APP_SECRET'];
const BOT_TOKEN_ENV_KEYS = [
  'BOT_TOKEN',
  'TG_API_TOKEN',
  'TG_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_TOKEN',
  'TELEGRAM_API_TOKEN',
  'TELEGRAM_BOT_API_TOKEN',
];
const OPTIONAL_ENV_KEYS = ['FB_LONG_TOKEN', 'WORKER_URL', 'GS_WEBHOOK'];
const TELEGRAM_TIMEOUT_MS = 9000;

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseEnvFile(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadEnvSnapshot() {
  const snapshot = { ...process.env };
  for (const filename of ['.dev.vars', '.env']) {
    const fullPath = resolve(process.cwd(), filename);
    if (!existsSync(fullPath)) continue;
    try {
      const content = await readFile(fullPath, 'utf8');
      const parsed = parseEnvFile(content);
      for (const [key, value] of Object.entries(parsed)) {
        if (!hasValue(snapshot[key]) && hasValue(value)) {
          snapshot[key] = value;
        }
      }
    } catch (error) {
      console.warn(`⚠️  Не удалось прочитать ${filename}: ${error.message}`);
    }
  }
  return snapshot;
}

function extractKvBindings(tomlContent) {
  const blocks = [];
  const regex = /\[\[kv_namespaces\]\]\s*([\s\S]*?)(?=\n\s*\[|$)/g;
  let match;
  while ((match = regex.exec(tomlContent)) !== null) {
    const block = match[1];
    const bindingMatch = block.match(/binding\s*=\s*"([^"\n]+)"/);
    const idMatch = block.match(/id\s*=\s*"([^"\n]+)"/);
    const previewMatch = block.match(/preview_id\s*=\s*"([^"\n]+)"/);
    if (!bindingMatch) continue;
    blocks.push({
      binding: bindingMatch[1],
      id: idMatch ? idMatch[1] : null,
      previewId: previewMatch ? previewMatch[1] : null,
    });
  }
  return blocks;
}

function logStatus(kind, message) {
  const prefix = kind === 'error' ? '✘' : kind === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} ${message}`);
}

function isPlaceholder(value) {
  return typeof value === 'string' && /<[^>]+>/.test(value);
}

const args = process.argv.slice(2);
const strictKv = args.includes('--require-dedicated-kv');
const pingTelegram = args.includes('--ping-telegram');
const checkWebhook = args.includes('--check-webhook');

function createAbortController(timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

async function callTelegramApi(token, method, { payload = null, timeoutMs = TELEGRAM_TIMEOUT_MS, httpMethod } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('глобальный fetch недоступен в этой версии Node.');
  }

  const { signal, clear } = createAbortController(timeoutMs);
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const init = { method: httpMethod ?? (payload ? 'POST' : 'GET'), signal };

  if (init.method === 'POST') {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(payload ?? {});
  }

  try {
    const response = await fetch(url, init);
    const textBody = await response.text();
    let data = {};
    if (textBody) {
      try {
        data = JSON.parse(textBody);
      } catch (error) {
        throw new Error(`ответ не JSON: ${error.message}`);
      }
    }

    if (!response.ok) {
      const description = data?.description || textBody || `HTTP ${response.status}`;
      throw new Error(description);
    }

    if (data?.ok === false) {
      throw new Error(data?.description || 'unknown error');
    }

    return data?.result ?? null;
  } catch (error) {
    const message = error?.message ?? String(error);
    if (/The operation was aborted|aborterror/i.test(message)) {
      throw new Error('превышен таймаут Telegram API');
    }
    throw new Error(message);
  } finally {
    clear();
  }
}

async function listWranglerSecrets() {
  if (process.env.CHECK_CONFIG_SKIP_WRANGLER === '1') {
    return { attempted: false, ok: false, names: [], skipped: true };
  }

  return await new Promise((resolve) => {
    let child;
    try {
      child = spawn('npx', ['wrangler', 'secret', 'list', '--format', 'json'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ attempted: true, ok: false, names: [], error: error.message });
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          attempted: true,
          ok: false,
          names: [],
          error: stderr.trim() || `wrangler exited with code ${code}`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout || '[]');
        const names = Array.isArray(parsed)
          ? parsed
              .map((item) => (item && typeof item.name === 'string' ? item.name : null))
              .filter(Boolean)
          : [];
        resolve({ attempted: true, ok: true, names });
      } catch (error) {
        resolve({ attempted: true, ok: false, names: [], error: error.message });
      }
    });
  });
}

const envSnapshot = await loadEnvSnapshot();
let missingEnv = REQUIRED_ENV_KEYS.filter((key) => !hasValue(envSnapshot[key]));
const localBotTokens = BOT_TOKEN_ENV_KEYS.filter((key) => hasValue(envSnapshot[key]));

const wranglerSecrets = await listWranglerSecrets();
let remoteCovered = [];

if (missingEnv.length > 0 && wranglerSecrets.ok && wranglerSecrets.names.length > 0) {
  remoteCovered = missingEnv.filter((key) => wranglerSecrets.names.includes(key));
  missingEnv = missingEnv.filter((key) => !wranglerSecrets.names.includes(key));
}

const remoteBotTokens = wranglerSecrets.ok
  ? BOT_TOKEN_ENV_KEYS.filter((key) => wranglerSecrets.names.includes(key))
  : [];
const hasBotToken = localBotTokens.length > 0 || remoteBotTokens.length > 0;

if (remoteBotTokens.length > 0) {
  remoteCovered = [...new Set([...remoteCovered, ...remoteBotTokens])];
}

const botTokenAliasLabel = `${BOT_TOKEN_ENV_KEYS[0]} (алиасы: ${BOT_TOKEN_ENV_KEYS.slice(1).join(', ')})`;

if (!hasBotToken) {
  missingEnv = [...missingEnv, botTokenAliasLabel];
}

if (missingEnv.length > 0) {
  logStatus('error', `Не заданы переменные окружения: ${missingEnv.join(', ')}`);
} else {
  logStatus('ok', 'Обязательные переменные окружения заполнены.');
}

if (remoteCovered.length > 0) {
  logStatus(
    'ok',
    `Секреты, найденные через wrangler (Cloudflare): ${remoteCovered.join(', ')}`,
  );
}

if (localBotTokens.length > 0) {
  logStatus('ok', `Локально найден Telegram токен в переменных: ${localBotTokens.join(', ')}`);
}

if (remoteBotTokens.length > 0) {
  logStatus('ok', `В Cloudflare Secrets обнаружены токены: ${remoteBotTokens.join(', ')}`);
}

if (pingTelegram) {
  if (localBotTokens.length === 0) {
    logStatus('warn', 'Пинг Telegram пропущен: токен не найден в локальных переменных.');
  } else {
    const tokenKey = localBotTokens[0];
    const rawToken = envSnapshot[tokenKey];
    if (!hasValue(rawToken)) {
      logStatus('warn', `Пинг Telegram пропущен: переменная ${tokenKey} пуста.`);
    } else {
      const tokenValue = rawToken.trim();
      const startedAt = Date.now();
      try {
        const bot = await callTelegramApi(tokenValue, 'getMe', { httpMethod: 'GET' });
        const latency = Date.now() - startedAt;
        const username = bot?.username ? `@${bot.username}` : 'без username';
        logStatus('ok', `Telegram бот доступен (${username}, id ${bot?.id ?? 'неизвестно'}), отклик ${latency}мс.`);
      } catch (error) {
        logStatus('error', `Не удалось связаться с Telegram: ${error.message}`);
      }
    }
  }
}

if (checkWebhook) {
  if (localBotTokens.length === 0) {
    logStatus('warn', 'Проверка webhook пропущена: токен не найден в локальных переменных.');
  } else {
    const tokenKey = localBotTokens[0];
    const rawToken = envSnapshot[tokenKey];
    if (!hasValue(rawToken)) {
      logStatus('warn', `Проверка webhook пропущена: переменная ${tokenKey} пуста.`);
    } else {
      const tokenValue = rawToken.trim();
      try {
        const info = await callTelegramApi(tokenValue, 'getWebhookInfo', { httpMethod: 'GET' });
        const webhookUrl = info?.url ?? '';
        if (!webhookUrl) {
          logStatus('warn', 'Webhook Telegram не настроен: метод getWebhookInfo вернул пустой url.');
        } else {
          logStatus('ok', `Webhook Telegram указывает на ${webhookUrl}.`);
        }

        const workerBase = hasValue(envSnapshot.WORKER_URL)
          ? envSnapshot.WORKER_URL.trim().replace(/\/+$/, '')
          : null;
        if (workerBase) {
          const expected = `${workerBase}/tg`;
          const normalizedExpected = expected.replace(/\/+$/, '');
          const normalizedActual = webhookUrl ? webhookUrl.replace(/\/+$/, '') : '';
          if (!webhookUrl) {
            logStatus('error', `Webhook отсутствует, ожидается ${expected}.`);
          } else if (normalizedActual === normalizedExpected) {
            logStatus('ok', 'Webhook URL совпадает с WORKER_URL.');
          } else {
            logStatus(
              'warn',
              `Webhook указывает на ${webhookUrl}, ожидалось ${expected}. Обновите setWebhook после деплоя.`,
            );
          }
        } else {
          logStatus('warn', 'WORKER_URL не задан, сравнение webhook URL пропущено.');
        }

        if (info?.pending_update_count > 0) {
          logStatus('warn', `У Telegram в очереди ${info.pending_update_count} необработанных обновлений.`);
        }

        if (info?.last_error_message) {
          const errorDate = info?.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : 'неизвестно';
          logStatus('warn', `Последняя ошибка webhook (${errorDate}): ${info.last_error_message}`);
        }

        if (info?.last_synchronization_error) {
          const syncDate = info?.last_synchronization_error_date
            ? new Date(info.last_synchronization_error_date * 1000).toISOString()
            : 'неизвестно';
          logStatus('warn', `Последняя ошибка синхронизации (${syncDate}): ${info.last_synchronization_error}`);
        }
      } catch (error) {
        logStatus('error', `Не удалось получить getWebhookInfo: ${error.message}`);
      }
    }
  }
}

if (wranglerSecrets.attempted && !wranglerSecrets.ok && !wranglerSecrets.skipped) {
  logStatus(
    'warn',
    `Не удалось получить список секретов через wrangler: ${wranglerSecrets.error || 'неизвестная ошибка'}`,
  );
  logStatus(
    'warn',
    'Авторизуйтесь командой "wrangler login" или установите CHECK_CONFIG_SKIP_WRANGLER=1 для пропуска этой проверки.',
  );
}

const optionalMissing = OPTIONAL_ENV_KEYS.filter((key) => !hasValue(envSnapshot[key]));
if (optionalMissing.length > 0) {
  logStatus('warn', `Опциональные переменные окружения отсутствуют: ${optionalMissing.join(', ')}`);
} else {
  logStatus('ok', 'Опциональные переменные окружения заданы или не требуются.');
}

let kvBindings = [];
try {
  const tomlContent = await readFile(resolve(process.cwd(), 'wrangler.toml'), 'utf8');
  kvBindings = extractKvBindings(tomlContent);
} catch (error) {
  logStatus('error', `Не удалось прочитать wrangler.toml: ${error.message}`);
}

const kvErrors = [];
const kvWarnings = [];

const primaryBinding = kvBindings.find((entry) => entry.binding === 'DB');
if (!primaryBinding) {
  kvErrors.push('Отсутствует binding "DB" в wrangler.toml.');
} else if (!hasValue(primaryBinding.id) || isPlaceholder(primaryBinding.id)) {
  kvErrors.push('Binding "DB" не имеет корректного id.');
}

const dedicatedBindings = ['REPORTS_NAMESPACE', 'BILLING_NAMESPACE', 'LOGS_NAMESPACE'];
for (const bindingName of dedicatedBindings) {
  const entry = kvBindings.find((item) => item.binding === bindingName);
  if (!entry) {
    kvWarnings.push(`Binding "${bindingName}" не найден. Используется fallback на DB.`);
    if (strictKv) {
      kvErrors.push(`Binding "${bindingName}" обязателен при strict-проверке.`);
    }
    continue;
  }
  if (!hasValue(entry.id) || isPlaceholder(entry.id)) {
    const message = `Binding "${bindingName}" указан без корректного id.`;
    if (strictKv) {
      kvErrors.push(message);
    } else {
      kvWarnings.push(message);
    }
  }
}

if (kvErrors.length === 0) {
  logStatus('ok', 'KV namespace настроен: binding "DB" доступен.');
} else {
  for (const message of kvErrors) {
    logStatus('error', message);
  }
}

if (kvWarnings.length > 0) {
  for (const message of kvWarnings) {
    logStatus('warn', message);
  }
} else {
  logStatus('ok', 'Дополнительные KV namespace настроены или будут использованы позже.');
}

const exitCode = kvErrors.length > 0 || missingEnv.length > 0 ? 1 : 0;
process.exit(exitCode);
