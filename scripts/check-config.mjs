#!/usr/bin/env node
import process from 'node:process';

const REQUIRED_VARS = [
  {
    name: 'BOT_TOKEN',
    description: 'Telegram bot token',
    validate(value) {
      return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(value);
    },
    guidance: 'Expected Telegram-style token (1234567:ABC...).',
  },
  {
    name: 'ADMIN_IDS',
    description: 'Comma-separated admin chat IDs',
    validate(value) {
      return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .every((part) => /^-?\d+$/.test(part));
    },
    guidance: 'Provide at least one numeric ID, separated by commas.',
  },
  {
    name: 'DEFAULT_TZ',
    description: 'Default time zone',
    validate(value) {
      if (typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('timeZone').includes(value);
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch (error) {
        return false;
      }
    },
    guidance: 'Use an IANA time zone identifier such as Europe/Moscow.',
  },
  {
    name: 'FB_APP_ID',
    description: 'Facebook App ID',
    validate(value) {
      return /^\d{5,}$/.test(value);
    },
    guidance: 'Expected numeric Facebook App ID.',
  },
  {
    name: 'FB_APP_SECRET',
    description: 'Facebook App Secret',
    validate(value) {
      return value.length >= 20;
    },
    guidance: 'Secret should be the long string from Meta developer console.',
  },
  {
    name: 'FB_LONG_TOKEN',
    description: 'Facebook long-lived token',
    validate(value) {
      return value.length >= 20;
    },
    guidance: 'Generate a long-lived token via the Graph API explorer.',
  },
  {
    name: 'WORKER_URL',
    description: 'Public Worker URL',
    validate(value) {
      try {
        const url = new URL(value);
        return url.protocol.startsWith('http');
      } catch (error) {
        return false;
      }
    },
    guidance: 'Provide a valid URL such as https://example.workers.dev.',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    description: 'Cloudflare API token',
    validate(value) {
      return value.length >= 20;
    },
    guidance: 'Use a token with Workers Versions permissions.',
  },
  {
    name: 'CLOUDFLARE_ACCOUNT_ID',
    description: 'Cloudflare account ID',
    validate(value) {
      return /^[a-f0-9]{32}$/i.test(value);
    },
    guidance: 'Copy the 32-character account ID from the Cloudflare dashboard.',
  },
];

const failures = [];

for (const { name, description, validate, guidance } of REQUIRED_VARS) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    failures.push({ name, description, guidance, reason: 'Missing or empty value.' });
    continue;
  }

  const trimmed = value.trim();
  if (!validate(trimmed)) {
    failures.push({ name, description, guidance, reason: 'Value failed validation.' });
  }
}

if (failures.length > 0) {
  console.error('❌ Configuration check failed. Fix the following environment variables:');
  for (const failure of failures) {
    console.error(`  • ${failure.name} (${failure.description}) — ${failure.reason}`);
    console.error(`    Hint: ${failure.guidance}`);
  }
  process.exitCode = 1;
  process.exit();
}

console.log('✅ All required configuration variables look good.');
