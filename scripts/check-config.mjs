#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_ENV_KEYS = ['BOT_TOKEN', 'ADMIN_IDS', 'DEFAULT_TZ', 'FB_APP_ID', 'FB_APP_SECRET'];
const OPTIONAL_ENV_KEYS = ['FB_LONG_TOKEN', 'WORKER_URL', 'GS_WEBHOOK'];

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

const envSnapshot = await loadEnvSnapshot();
const missingEnv = REQUIRED_ENV_KEYS.filter((key) => !hasValue(envSnapshot[key]));

if (missingEnv.length > 0) {
  logStatus('error', `Не заданы переменные окружения: ${missingEnv.join(', ')}`);
} else {
  logStatus('ok', 'Обязательные переменные окружения заполнены.');
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
