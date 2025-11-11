#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PATTERN = /(['"])\s*\+|\+\s*(['"])/g;
const EXTENSIONS = new Set(['.js', '.ts', '.tsx']);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      results.push(...nested);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  const files = await listFiles(path.resolve('src'));
  let violations = 0;
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (PATTERN.test(line)) {
        violations += 1;
        console.log(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
      }
      PATTERN.lastIndex = 0;
    }
  }
  if (violations > 0) {
    console.error(`Found ${violations} potential string concatenations.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Failed to scan for string concatenations:', error);
  process.exitCode = 1;
});
