#!/usr/bin/env node
import { spawn } from 'node:child_process';

const steps = [
  { name: 'Lint', command: ['npm', 'run', 'lint'], skip: false },
  { name: 'Typecheck', command: ['npm', 'run', 'typecheck'], skip: false },
  { name: 'Test suite', command: ['npm', 'run', 'test'], skip: false },
  { name: 'Wrangler dry-run deploy', command: ['wrangler', 'deploy', '--dry-run'], skip: false },
];

const args = new Set(process.argv.slice(2));
const skipDeployArg = args.has('--skip-deploy');
const requiredDeployEnv = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
const hasDeployCredentials = requiredDeployEnv.every((key) => Boolean(process.env[key]));

if (skipDeployArg || !hasDeployCredentials) {
  const reason = skipDeployArg
    ? 'flag --skip-deploy was provided'
    : `missing environment variables: ${requiredDeployEnv
        .filter((key) => !process.env[key])
        .join(', ')}`;
  steps[3].skip = true;
  console.warn(`\n[warn] Skipping Wrangler dry-run deploy because ${reason}.`);
  console.warn('[warn] Provide the required credentials or run without --skip-deploy to execute the dry-run step.');
}

async function runStep(step) {
  if (step.skip) {
    console.log(`\n[skip] ${step.name}`);
    return;
  }

  console.log(`\n[run] ${step.name}`);
  await new Promise((resolve, reject) => {
    const child = spawn(step.command[0], step.command.slice(1), {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${step.name} failed with exit code ${code}`));
      }
    });
  });
}

async function run() {
  try {
    for (const step of steps) {
      await runStep(step);
    }
    console.log('\n[done] Dry-run pipeline finished successfully.');
  } catch (error) {
    console.error(`\n[error] ${error.message}`);
    process.exit(1);
  }
}

run();
