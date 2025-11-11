#!/usr/bin/env node

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

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = resolveSetting({
    args,
    names: ['base', 'url'],
    env: ['ADMIN_BASE_URL', 'INTEGRATION_BASE_URL', 'WORKER_URL'],
  });

  if (!baseUrl) {
    console.error('✘ Укажите URL воркера через --base или переменную ADMIN_BASE_URL/WORKER_URL.');
    process.exitCode = 1;
    return;
  }

  const adminKey = resolveSetting({
    args,
    names: ['key', 'admin-key'],
    env: ['ADMIN_KEY'],
  });

  const countRaw = resolveSetting({
    args,
    names: ['count'],
    env: ['FALLBACK_SIM_COUNT'],
  });
  const prefix = resolveSetting({
    args,
    names: ['prefix'],
    env: ['FALLBACK_SIM_PREFIX'],
    fallback: 'fallback-test',
  });
  const reason = resolveSetting({
    args,
    names: ['reason'],
    env: ['FALLBACK_SIM_REASON'],
    fallback: 'manual_test',
  });

  const payload = {
    action: 'simulate-fallback',
  };

  if (countRaw && Number.isFinite(Number(countRaw))) {
    payload.count = Math.min(Math.max(Math.trunc(Number(countRaw)), 1), 20);
  }
  if (prefix) {
    payload.prefix = prefix;
  }
  if (reason) {
    payload.reason = reason;
  }

  const endpoint = new URL('/api/admin/system', baseUrl);
  if (adminKey && !endpoint.searchParams.get('key')) {
    endpoint.searchParams.set('key', adminKey);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let data;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch (error) {
    console.error('✘ Не удалось распарсить ответ JSON:', error.message);
    console.error(bodyText);
    process.exitCode = 1;
    return;
  }

  if (!response.ok || !data?.ok) {
    console.error('✘ Симуляция завершилась ошибкой:', response.status, bodyText);
    process.exitCode = 1;
    return;
  }

  console.log('✅ Созданы fallback-записи:', data.written, '/', data.requested);
  if (data.prefix) {
    console.log('  prefix:', data.prefix);
  }
  if (data.reason) {
    console.log('  reason:', data.reason);
  }
}

run().catch((error) => {
  console.error('✘ Ошибка симуляции fallback:', error);
  process.exitCode = 1;
});
