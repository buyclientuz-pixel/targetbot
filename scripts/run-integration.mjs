#!/usr/bin/env node
/*
 * Integration check runner for Targetbot.
 *
 * Usage examples:
 *   node scripts/run-integration.mjs --base https://worker.example.workers.dev \
 *     --meta-token <token> --portal-code <code> --portal-sig <sig>
 *
 * Environment variable fallbacks:
 *   INTEGRATION_BASE_URL, WORKER_URL
 *   INTEGRATION_META_TOKEN, META_MANAGE_TOKEN
 *   INTEGRATION_PORTAL_CODE, PORTAL_TEST_CODE
 *   INTEGRATION_PORTAL_SIG, PORTAL_TEST_SIG
 */

const RESULT_ICONS = {
  pending: '…',
  success: '✅',
  warning: '⚠️',
  failure: '✘',
  skipped: '➖',
};

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const [rawKey, rawValue] = item.slice(2).split('=', 2);
    const key = rawKey.trim();
    if (!key) continue;
    if (rawValue !== undefined) {
      result[key] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = 'true';
    }
  }
  return result;
}

function resolveSetting({ args, names = [], env = [], fallback = '' }) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(args, name)) {
      const value = args[name];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  for (const key of env) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function logHeading(title) {
  console.log(`\n=== ${title} ===`);
}

function describeResult(result) {
  const icon = RESULT_ICONS[result.status] ?? RESULT_ICONS.pending;
  const suffix = result.message ? ` ${result.message}` : '';
  console.log(`${icon} ${result.name}${suffix}`);
  if (result.details) {
    for (const line of [].concat(result.details)) {
      console.log(`    ${line}`);
    }
  }
  if (result.error) {
    console.log(`    → ${result.error}`);
    if (result.stack) {
      console.log(result.stack.split('\n').map((line) => `    ${line}`).join('\n'));
    }
  }
}

async function runTest(name, fn) {
  const result = { name, status: 'pending' };
  try {
    const output = await fn();
    if (output && output.status) {
      return { name, ...output };
    }
    return { name, status: 'success', details: output ? [].concat(output) : [] };
  } catch (error) {
    return {
      name,
      status: 'failure',
      error: error?.message || String(error),
      stack: error?.stack || '',
    };
  }
}

async function testMetaOAuthRedirect({ baseUrl, metaToken }) {
  if (!metaToken) {
    return {
      status: 'skipped',
      message: 'токен управления Meta не задан — пропуск',
    };
  }

  const url = new URL('/fb_auth', baseUrl);
  url.searchParams.set('token', metaToken);

  const response = await fetch(url, { method: 'GET', redirect: 'manual' });
  const location = response.headers.get('location');
  if (response.status === 302 && location && /facebook\.com\//i.test(location)) {
    return {
      status: 'success',
      details: [`HTTP ${response.status} → ${location}`],
    };
  }

  const text = await response.text();
  throw new Error(`Ожидался 302 redirect на Facebook, получено ${response.status}: ${text.slice(0, 160)}`);
}

async function testMetaManageEndpoint({ baseUrl, metaToken }) {
  if (!metaToken) {
    return {
      status: 'skipped',
      message: 'токен управления Meta не задан — пропуск',
    };
  }

  const url = new URL('/manage/meta', baseUrl);
  url.searchParams.set('token', metaToken);
  url.searchParams.set('background', '0');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  const bodyText = await response.text();
  let data;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch (error) {
    throw new Error(`Не удалось распарсить ответ JSON: ${error.message}. Тело: ${bodyText.slice(0, 200)}`);
  }

  if (!response.ok || !data?.ok) {
    throw new Error(`manage/meta вернул ошибку: HTTP ${response.status}, payload=${bodyText}`);
  }

  const accounts = Array.isArray(data.status?.accounts) ? data.status.accounts.length : 0;
  const updatedAt = data.status?.updated_at || data.status?.updatedAt || 'неизвестно';

  return {
    status: 'success',
    details: [`accounts: ${accounts}`, `updated_at: ${updatedAt}`],
  };
}

async function testClientPortal({ baseUrl, portalCode, portalSig, refresh }) {
  if (!portalCode || !portalSig) {
    return {
      status: 'skipped',
      message: 'портальный код или подпись не заданы — пропуск',
    };
  }

  const path = `/p/${encodeURIComponent(portalCode)}`;
  const url = new URL(path, baseUrl);
  url.searchParams.set('sig', portalSig);
  if (refresh) {
    url.searchParams.set('refresh', '1');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`portal вернул HTTP ${response.status}: ${text.slice(0, 160)}`);
  }

  if (!/<!DOCTYPE html>/i.test(text) && !/<html/i.test(text)) {
    throw new Error('portal ответил не HTML (ожидалась страница клиента)');
  }

  const hasSummary = /data-period="today"/i.test(text) || /Сегодня/i.test(text);
  const hasTopCampaigns = /Топ-кампании/i.test(text) || /top-campaigns/i.test(text);

  return {
    status: 'success',
    details: [
      `length: ${text.length} символов`,
      hasSummary ? 'найден блок Today/Сегодня' : '⚠️ блок Today не найден',
      hasTopCampaigns ? 'найден блок топ-кампаний' : '⚠️ блок топ-кампаний не найден',
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = resolveSetting({
    args,
    names: ['base', 'url'],
    env: ['INTEGRATION_BASE_URL', 'WORKER_URL'],
  });

  if (!baseUrl) {
    console.error('✘ Укажите URL воркера через --base или переменную INTEGRATION_BASE_URL/WORKER_URL.');
    process.exitCode = 1;
    return;
  }

  const metaToken = resolveSetting({
    args,
    names: ['meta-token', 'metaToken', 'token'],
    env: ['INTEGRATION_META_TOKEN', 'META_MANAGE_TOKEN'],
  });

  const portalCode = resolveSetting({
    args,
    names: ['portal-code', 'project'],
    env: ['INTEGRATION_PORTAL_CODE', 'PORTAL_TEST_CODE'],
  });

  const portalSig = resolveSetting({
    args,
    names: ['portal-sig', 'portal-secret', 'sig'],
    env: ['INTEGRATION_PORTAL_SIG', 'PORTAL_TEST_SIG'],
  });

  const wantsRefresh = /^1|true|yes|on$/i.test(resolveSetting({
    args,
    names: ['refresh-portal'],
    env: ['INTEGRATION_PORTAL_REFRESH'],
  }));

  logHeading('Targetbot integration checks');
  console.log(`Базовый URL: ${baseUrl}`);

  const tests = [
    {
      name: 'Meta OAuth redirect',
      fn: () => testMetaOAuthRedirect({ baseUrl, metaToken }),
    },
    {
      name: 'Meta overview API',
      fn: () => testMetaManageEndpoint({ baseUrl, metaToken }),
    },
    {
      name: 'Client portal render',
      fn: () => testClientPortal({ baseUrl, portalCode, portalSig, refresh: wantsRefresh }),
    },
  ];

  const results = [];
  for (const test of tests) {
    const result = await runTest(test.name, test.fn);
    results.push(result);
    describeResult(result);
  }

  const hasFailure = results.some((item) => item.status === 'failure');
  if (hasFailure) {
    process.exitCode = 1;
    console.log('\nНе все интеграционные проверки прошли успешно. Исправьте ошибки выше.');
    return;
  }

  const executed = results.filter((item) => item.status !== 'skipped').length;
  if (executed === 0) {
    console.log('\n⚠️ Все проверки пропущены — задайте токены/подписи в параметрах скрипта.');
  } else {
    console.log(`\nГотово: выполнено проверок — ${executed}, пропущено — ${results.length - executed}.`);
  }
}

main().catch((error) => {
  console.error('✘ Критическая ошибка интеграционных проверок:', error);
  process.exitCode = 1;
});
