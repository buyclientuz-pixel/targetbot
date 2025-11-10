#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const pairs = [
  { example: '.dev.vars.example', target: '.dev.vars', description: 'Wrangler dev secrets (.dev.vars)' },
  { example: '.env.example', target: '.env', description: 'Local tooling secrets (.env)' },
];

const created = [];
const skipped = [];
const missingExamples = [];

for (const pair of pairs) {
  const examplePath = resolve(process.cwd(), pair.example);
  const targetPath = resolve(process.cwd(), pair.target);

  if (!existsSync(examplePath)) {
    missingExamples.push({ ...pair, examplePath });
    continue;
  }

  if (existsSync(targetPath)) {
    skipped.push({ ...pair, targetPath });
    continue;
  }

  copyFileSync(examplePath, targetPath);
  created.push({ ...pair, examplePath, targetPath });
}

if (created.length === 0 && skipped.length === 0 && missingExamples.length === 0) {
  console.log('Nothing to bootstrap — no example files declared.');
  process.exit(0);
}

for (const entry of created) {
  console.log(`✅ Created ${entry.target} from ${entry.example}.`);
}

for (const entry of skipped) {
  console.log(`ℹ️  Skipped ${entry.target} — file already exists.`);
}

for (const entry of missingExamples) {
  console.warn(`⚠️ Example ${entry.example} is missing. Expected at ${entry.examplePath}.`);
}

if (created.length > 0) {
  console.log('\nNext steps:');
  for (const entry of created) {
    console.log(`  • Update ${entry.target} with real values for ${entry.description}.`);
  }
  console.log('  • Never commit files with real secrets — they are already ignored by .gitignore.');
}
