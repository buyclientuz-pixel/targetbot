#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
