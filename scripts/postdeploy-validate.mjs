#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const REQUEST_TIMEOUT_MS = 10000;

function loadEnvSnapshot() {
  const snapshot = { ...process.env };
  for (const filename of ['.dev.vars', '.env']) {
    const full = resolve(process.cwd(), filename);
    if (!existsSync(full)) continue;
    try {
      const text = readFileSync(full, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        if (key && !(key in snapshot)) {
          snapshot[key] = value;
        }
      }
    } catch (error) {
      console.warn('⚠️  Не удалось прочитать %s: %s', filename, error.message);
    }
  }
  return snapshot;
}

function parseProjects(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((chunk) => {
      const [id, name] = chunk.split(':');
      return { id: (id || '').trim(), name: (name || '').trim() };
    })
    .filter((item) => item.id && item.name);
}

function maskToken(token = '') {
  if (!token) return '';
  if (token.length <= 8) return token;
  return token.slice(0, 5) + '****' + token.slice(-2);
}

function normalizeBaseUrl(value) {
  if (!value) return '';
  let url = value.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return url;
}

async function requestWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

async function validateEndpoint(entry, context) {
  const { baseUrl, adminKey, token } = context;
  if (entry.requiresBase && !baseUrl) {
    return { status: 'skipped', reason: 'WORKER_URL не задан' };
  }
  if (entry.requiresAdmin && !adminKey) {
    return { status: 'skipped', reason: 'ADMIN_KEY не найден' };
  }
  if (entry.requiresToken && !token) {
    return { status: 'skipped', reason: 'BOT_TOKEN не настроен' };
  }
  const url = new URL((entry.requiresBase ? baseUrl : entry.url) + entry.path);
  if (entry.requiresAdmin && adminKey) {
    url.searchParams.set('key', adminKey);
  }
  if (entry.appendToken && token) {
    url.searchParams.set('token', token);
  }
  if (entry.appendParams) {
    for (const [key, value] of Object.entries(entry.appendParams)) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const { response, text } = await requestWithTimeout(url.toString(), { method: entry.method || 'GET' });
    const ok = response.ok;
    if (!ok) {
      return { status: 'error', reason: `HTTP ${response.status}`, body: text.slice(0, 400) };
    }
    if (entry.expectJson) {
      try {
        JSON.parse(text);
      } catch (error) {
        return { status: 'error', reason: 'JSON parse failed', body: text.slice(0, 200) };
      }
    }
    if (entry.expectText && !text.trim()) {
      return { status: 'warn', reason: 'Пустой ответ' };
    }
    return { status: 'ok', body: text.slice(0, 200) };
  } catch (error) {
    return { status: 'error', reason: error.name === 'AbortError' ? 'timeout' : error.message };
  }
}

async function main() {
  const env = loadEnvSnapshot();
  const baseUrl = normalizeBaseUrl(env.WORKER_URL || env.INTEGRATION_BASE_URL || '');
  const adminKey = (env.ADMIN_KEY || '').trim();
  const token = (env.BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '').trim();
  const projects = parseProjects(env.PROJECTS);
  const sampleProject = projects.length > 0 ? projects[0] : null;

  const endpoints = [
    { name: 'Health', path: '/health', requiresBase: true, expectJson: true },
    { name: 'API Ping', path: '/api/ping', requiresBase: true, expectJson: true },
    { name: 'Admin Projects API', path: '/api/admin', requiresBase: true, requiresAdmin: true, expectJson: true },
    {
      name: 'Telegram webhook status',
      path: '/manage/telegram/webhook',
      requiresBase: true,
      requiresToken: true,
      appendToken: true,
      appendParams: { action: 'status' },
      expectJson: true,
    },
  ];

  if (sampleProject) {
    endpoints.push(
      {
        name: `Portal summary (${sampleProject.id})`,
        path: `/portal/${sampleProject.id}`,
        requiresBase: true,
        expectText: true,
      },
      {
        name: `Portal campaigns (${sampleProject.id})`,
        path: `/portal/${sampleProject.id}/campaigns`,
        requiresBase: true,
        expectText: true,
      },
      {
        name: `Project API (${sampleProject.id})`,
        path: `/api/project/${sampleProject.id}`,
        requiresBase: true,
        expectJson: true,
      },
    );
  }

  console.log('🧪 Постдеплойная проверка');
  if (!baseUrl) {
    console.warn('⚠️  WORKER_URL не указан. Добавьте переменную или передайте INTEGRATION_BASE_URL.');
  } else {
    console.log('🔗 Базовый URL:', baseUrl);
  }
  if (adminKey) {
    console.log('🔐 ADMIN_KEY: OK');
  } else {
    console.warn('⚠️  ADMIN_KEY не найден — некоторые проверки будут пропущены.');
  }
  if (token) {
    console.log('🤖 BOT_TOKEN:', maskToken(token));
  } else {
    console.warn('⚠️  BOT_TOKEN не найден — пропуск проверки вебхука.');
  }
  if (projects.length > 0) {
    console.log('📂 Проекты:', projects.map((p) => `${p.id} (${p.name})`).join(', '));
  } else {
    console.warn('⚠️  Список проектов пуст. Добавьте PROJECTS или файл reports/projects.json');
  }

  const results = [];
  for (const entry of endpoints) {
    process.stdout.write(`→ ${entry.name} ... `);
    const result = await validateEndpoint(entry, { baseUrl, adminKey, token });
    results.push({ entry, result });
    switch (result.status) {
      case 'ok':
        console.log('✅');
        break;
      case 'warn':
        console.log('⚠️ ', result.reason || 'Предупреждение');
        break;
      case 'skipped':
        console.log('⏭ ', result.reason || 'Пропуск');
        break;
      default:
        console.log('❌ ', result.reason || 'Ошибка');
        break;
    }
    if (result.body) {
      await delay(10);
      console.log('   ↳ Ответ:', result.body.replace(/\s+/g, ' ').slice(0, 160));
    }
  }

  const errors = results.filter((item) => item.result.status === 'error');
  const warnings = results.filter((item) => item.result.status === 'warn');

  console.log('\n📋 Итог:');
  console.log('  • Проверок:', results.length);
  console.log('  • Ошибок:', errors.length);
  console.log('  • Предупреждений:', warnings.length);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('❌ Критическая ошибка проверки:', error);
  process.exitCode = 1;
});
