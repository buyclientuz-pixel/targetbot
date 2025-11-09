#!/usr/bin/env node
import { spawn } from 'node:child_process';

const SECRET_DEFINITIONS = [
  { key: 'BOT_TOKEN', aliases: ['BOT_TOKEN', 'TG_API_TOKEN', 'TG_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN'], required: true },
  { key: 'ADMIN_IDS', aliases: ['ADMIN_IDS'], required: false },
  { key: 'DEFAULT_TZ', aliases: ['DEFAULT_TZ'], required: false },
  { key: 'WORKER_URL', aliases: ['WORKER_URL'], required: false },
  { key: 'FB_APP_ID', aliases: ['FB_APP_ID'], required: true },
  { key: 'FB_APP_SECRET', aliases: ['FB_APP_SECRET'], required: true },
  { key: 'FB_LONG_TOKEN', aliases: ['FB_LONG_TOKEN'], required: false },
  { key: 'META_LONG_TOKEN', aliases: ['META_LONG_TOKEN'], required: false },
  { key: 'META_MANAGE_TOKEN', aliases: ['META_MANAGE_TOKEN', 'FB_MANAGE_TOKEN'], required: false },
  { key: 'PORTAL_TOKEN', aliases: ['PORTAL_TOKEN', 'PORTAL_SIGNING_SECRET'], required: false },
  { key: 'GS_WEBHOOK', aliases: ['GS_WEBHOOK'], required: false },
  { key: 'PROJECT_MANAGER_IDS', aliases: ['PROJECT_MANAGER_IDS', 'PROJECT_MANAGERS'], required: false },
  { key: 'PROJECT_ACCOUNT_ACCESS', aliases: ['PROJECT_ACCOUNT_ACCESS', 'PROJECT_ACCOUNT_ALLOWLIST'], required: false },
  { key: 'PROJECT_CHAT_PRESETS', aliases: ['PROJECT_CHAT_PRESETS', 'PROJECT_CHAT_TEMPLATES', 'CHAT_PRESETS'], required: false },
];

function parseArgs(argv) {
  const args = { env: null, config: 'wrangler.toml', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env') {
      args.env = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--env=')) {
      args.env = arg.slice('--env='.length);
    } else if (arg === '--config') {
      args.config = argv[i + 1] ?? args.config;
      i += 1;
    } else if (arg.startsWith('--config=')) {
      args.config = arg.slice('--config='.length);
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else {
      console.warn(`⚠️ Неизвестный аргумент пропущен: ${arg}`);
    }
  }
  return args;
}

function pickValue(entry) {
  for (const name of entry.aliases) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function runWrangler(key, value, options) {
  const args = ['wrangler@4.46.0', 'secret', 'put', key];
  if (options.env) {
    args.push('--env', options.env);
  }
  if (options.config) {
    args.push('--config', options.config);
  }

  if (options.dryRun) {
    console.log(`🔸 [dry-run] ${key} ← ${'*'.repeat(Math.min(value.length, 8))}`);
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('npx', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.stdin.write(value);
    child.stdin.end();
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Synced secret ${key}`);
        resolve();
      } else {
        reject(new Error(`wrangler exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const missingRequired = [];
  const synced = [];

  for (const entry of SECRET_DEFINITIONS) {
    const value = pickValue(entry);
    if (!value) {
      if (entry.required) {
        missingRequired.push(entry.key);
        console.error(`✘ Требуется секрет ${entry.key}, но он не найден в переменных окружения (${entry.aliases.join(', ')}).`);
      } else {
        console.log(`⚠️ Пропуск ${entry.key} — значение не задано.`);
      }
      continue;
    }
    await runWrangler(entry.key, value, options);
    synced.push(entry.key);
  }

  if (missingRequired.length > 0) {
    throw new Error(`Отсутствуют обязательные секреты: ${missingRequired.join(', ')}`);
  }

  if (synced.length === 0) {
    console.warn('⚠️ Не синхронизировано ни одного секрета — проверьте переменные окружения.');
  }
}

main().catch((error) => {
  console.error(`✘ Синхронизация секретов завершилась с ошибкой: ${error.message}`);
  process.exitCode = 1;
});
