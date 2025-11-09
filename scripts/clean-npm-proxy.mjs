#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const ENV_KEYS = [
  'npm_config_http_proxy',
  'npm_config_https_proxy',
  'NPM_CONFIG_HTTP_PROXY',
  'NPM_CONFIG_HTTPS_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
];

const CONFIG_KEYS = ['http-proxy', 'https-proxy'];

for (const key of ENV_KEYS) {
  if (process.env[key]) {
    delete process.env[key];
  }
}

function runNpmConfigDelete(key) {
  const result = spawnSync('npm', ['config', 'delete', key], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.error) {
    return { key, ok: false, reason: result.error.message };
  }

  if (result.status !== 0) {
    const reason = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`;
    return { key, ok: false, reason };
  }

  return { key, ok: true };
}

const outcomes = CONFIG_KEYS.map(runNpmConfigDelete);
const removed = outcomes.filter((item) => item.ok).map((item) => item.key);
const failed = outcomes.filter((item) => !item.ok);

if (removed.length > 0) {
  console.log(`Removed npm config keys: ${removed.join(', ')}`);
}

for (const item of failed) {
  console.log(`Skipped npm config key ${item.key}: ${item.reason || 'not set'}`);
}
