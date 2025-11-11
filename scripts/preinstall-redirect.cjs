'use strict';

const { spawnSync } = require('node:child_process');

function parseOriginalArgs() {
  try {
    const raw = process.env.npm_config_argv;
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.original)) {
      return parsed.original.map((value) => String(value));
    }
    return [];
  } catch (error) {
    console.warn('[preinstall-redirect] Unable to parse npm_config_argv', error);
    return [];
  }
}

function shouldRedirect(originalArgs) {
  if (process.env.TARGETBOT_INSTALL_REDIRECT === '1') {
    return false;
  }
  return originalArgs.some((arg) => arg === 'ci' || arg === 'clean-install');
}

function runInstall(originalArgs) {
  console.log(
    `[preinstall-redirect] Detected "npm ${originalArgs.join(' ')}" – running "npm install --force --legacy-peer-deps" instead.`,
  );

  const result = spawnSync(
    'npm',
    ['install', '--force', '--legacy-peer-deps'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TARGETBOT_INSTALL_REDIRECT: '1',
      },
    },
  );

  if (result.error) {
    console.error('[preinstall-redirect] Failed to run npm install', result.error);
    process.exit(result.status ?? 1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.error('[preinstall-redirect] npm install exited with status', result.status);
    process.exit(result.status);
  }

  console.log('[preinstall-redirect] npm install completed successfully.');
  process.exit(0);
}

const originalArgs = parseOriginalArgs();
if (shouldRedirect(originalArgs)) {
  runInstall(originalArgs);
}

