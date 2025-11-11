#!/usr/bin/env node

const DEFAULT_ITERATIONS = 5;

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

  const iterationsRaw = resolveSetting({
    args,
    names: ['iterations', 'count'],
    env: ['R2_LOAD_ITERATIONS'],
  });
  const iterations = iterationsRaw ? Number(iterationsRaw) : DEFAULT_ITERATIONS;
  const prefix = resolveSetting({
    args,
    names: ['prefix'],
    env: ['R2_LOAD_PREFIX'],
    fallback: 'reports/__loadtest',
  });

  const payload = {
    action: 'r2-load-test',
  };

  if (Number.isFinite(iterations) && iterations > 0) {
    payload.iterations = Math.min(Math.max(Math.trunc(iterations), 1), 25);
  }

  if (prefix) {
    payload.prefix = prefix;
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
    console.error('✘ Запрос завершился ошибкой:', response.status, bodyText);
    process.exitCode = 1;
    return;
  }

  const summary = data.summary || {};
  console.log('✅ R2 load test completed');
  console.log('  iterations:', summary.iterations ?? payload.iterations);
  if (summary.writes) {
    console.log('  writes ok:', summary.writes.ok, 'avg_ms:', summary.writes.avg_ms ?? 'n/a');
  }
  if (summary.reads) {
    console.log('  reads ok:', summary.reads.ok, 'avg_ms:', summary.reads.avg_ms ?? 'n/a');
  }
  if (summary.prefix) {
    console.log('  prefix:', summary.prefix);
  }
}

run().catch((error) => {
  console.error('✘ Ошибка выполнения теста:', error);
  process.exitCode = 1;
});
