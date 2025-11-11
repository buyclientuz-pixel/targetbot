'use strict';

const COMMAND_INDEX = 2;
const aliases = new Map([
  ['ci', 'install'],
  ['clean-install', 'install'],
  ['ic', 'install'],
  ['install-clean', 'install'],
  ['isntall-clean', 'install'],
]);

try {
  const argv = process.argv;
  if (!Array.isArray(argv) || argv.length <= COMMAND_INDEX) {
    return;
  }

  const original = String(argv[COMMAND_INDEX] || '').toLowerCase();
  if (!aliases.has(original)) {
    return;
  }

  if (process.env.NPM_CI_SHIMMED === '1') {
    return;
  }

  const replacement = aliases.get(original);
  const passthrough = argv.slice(COMMAND_INDEX + 1);
  const extraFlags = ['--force', '--legacy-peer-deps'];

  const before = argv.slice(COMMAND_INDEX).join(' ');
  const nextArgv = [
    ...argv.slice(0, COMMAND_INDEX),
    replacement,
    ...extraFlags,
    ...passthrough,
  ];

  argv.length = 0;
  Array.prototype.push.apply(argv, nextArgv);
  process.env.NPM_CI_SHIMMED = '1';
  const after = nextArgv.slice(COMMAND_INDEX).join(' ');
  console.log(`[npm-ci-shim] Redirected "${before}" -> "${after}"`);
} catch (error) {
  console.warn('[npm-ci-shim] Unable to rewrite npm command', error);
}
