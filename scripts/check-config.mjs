#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadDotEnv();

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Не удалось загрузить .env: ${error.message}`);
  }
}

const BOT_TOKEN_KEYS = [
  'BOT_TOKEN',
  'TG_API_TOKEN',
  'TG_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_TOKEN',
  'TELEGRAM_API_TOKEN',
  'TELEGRAM_BOT_API_TOKEN',
];

const OPTIONAL_KEYS = ['DEFAULT_TZ', 'WORKER_URL', 'FB_APP_ID', 'FB_APP_SECRET', 'GS_WEBHOOK'];
const META_KEYS = ['FB_APP_ID', 'FB_APP_SECRET'];
const R2_KEYS = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_ACCOUNT_ID',
  'R2_ENDPOINT',
];
const TELEGRAM_TIMEOUT_MS = 9000;

function log(kind, message) {
  const prefix = kind === 'error' ? '✘' : kind === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} ${message}`);
}

function parseEnv(content) {
  const result = {};
  for (const lineRaw of content.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadEnvSnapshot() {
  const snapshot = { ...process.env };
  for (const filename of ['.dev.vars', '.env']) {
    const full = resolve(process.cwd(), filename);
    if (!existsSync(full)) continue;
    try {
      const content = await readFile(full, 'utf8');
      const parsed = parseEnv(content);
      for (const [key, value] of Object.entries(parsed)) {
        if (value && !snapshot[key]) {
          snapshot[key] = value;
        }
      }
    } catch (error) {
      log('warn', `Не удалось прочитать ${filename}: ${error.message}`);
    }
  }
  return snapshot;
}

function pickBotToken(env) {
  for (const key of BOT_TOKEN_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim()) {
      return { key, value: value.trim() };
    }
  }
  return null;
}

function parseAdminIds(value) {
  const raw = typeof value === 'string' ? value : '';
  const ids = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return ids;
}

function createAbortController(timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

async function pingTelegram(token) {
  const { signal, dispose } = createAbortController();
  const url = `https://api.telegram.org/bot${token}/getMe`;
  try {
    const response = await fetch(url, { method: 'GET', signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    const data = JSON.parse(text);
    if (!data?.ok) {
      throw new Error(data?.description || 'unknown error');
    }
    return data.result;
  } finally {
    dispose();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const env = await loadEnvSnapshot();
  const tokenEntry = pickBotToken(env);

  if (tokenEntry) {
    log('ok', `Найден токен Telegram (${tokenEntry.key}).`);
  } else {
    log('error', 'Токен Telegram не найден (BOT_TOKEN или алиасы).');
    console.log(
      [
        '  • Локально положите токен в файл .dev.vars или .env строкой BOT_TOKEN="<значение>";',
        '  • Для Cloudflare выполните: wrangler secret put BOT_TOKEN (введите токен при запросе);',
        '  • В веб-интерфейсе Cloudflare откройте Workers → ваш воркер → Settings → Variables → Add secret.',
      ].join('\n')
    );
  }

  const admins = parseAdminIds(env.ADMIN_IDS);
  if (admins.length > 0) {
    log('ok', `ADMIN_IDS: ${admins.join(', ')}`);
  } else {
    log('warn', 'ADMIN_IDS не задан — будут использованы значения по умолчанию.');
  }

  for (const key of OPTIONAL_KEYS) {
    if (env[key]) {
      log('ok', `${key} задан.`);
    } else {
      log('warn', `${key} пока не задан.`);
    }
  }

  const missingMeta = META_KEYS.filter((key) => !env[key]);
  if (missingMeta.length === 0) {
    log('ok', 'Meta OAuth: FB_APP_ID и FB_APP_SECRET найдены.');
  } else {
    log('error', `Meta OAuth: отсутствуют ${missingMeta.join(', ')}.`);
    console.log(
      [
        '  • Получите значения в Meta for Developers → Settings → Basic;',
        '  • Локально добавьте строки FB_APP_ID и FB_APP_SECRET в .dev.vars или .env;',
        '  • Для Cloudflare выполните `wrangler secret put FB_APP_ID` и `wrangler secret put FB_APP_SECRET`;',
        '  • В GitHub Actions задайте одноимённые Secrets, чтобы синхронизировать значения автоматически.',
      ].join('\n'),
    );
  }

  const missingR2 = R2_KEYS.filter((key) => !env[key]);
  if (missingR2.length === 0) {
    log('ok', 'R2: все ключи найдены.');
  } else {
    log('warn', `R2: отсутствуют ${missingR2.join(', ')}.`);
    console.log(
      [
        '  • Создайте API Token в Cloudflare R2 (доступ к чтению/записи);',
        '  • Добавьте значения в .dev.vars/.env и синхронизируйте через `npm run sync:secrets`;',
        '  • Убедитесь, что Secrets заданы в GitHub Actions и Workers → Settings → Variables.',
      ].join('\n'),
    );
  }

  if (args.has('--ping-telegram')) {
    if (!tokenEntry) {
      log('error', 'Невозможно пинговать Telegram: токен отсутствует.');
    } else {
      try {
        const me = await pingTelegram(tokenEntry.value);
        log('ok', `Telegram getMe → @${me?.username ?? 'unknown'} (${me?.id ?? 'no id'})`);
      } catch (error) {
        log('error', `Telegram getMe провалился: ${error.message}`);
      }
    }
  }
}

main().catch((error) => {
  log('error', error?.message || String(error));
  process.exitCode = 1;
});
