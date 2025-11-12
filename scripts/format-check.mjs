#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { readdir, stat, readFile } from 'node:fs/promises';

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = dirname(scriptPath);
const projectRoot = dirname(scriptsDir);
const targetDir = resolve(projectRoot, 'src');

async function gatherFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await gatherFiles(entryPath)));
    } else if (entry.isFile()) {
      const name = entry.name;
      if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.tsx')) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

async function checkFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const trailing = [];
  lines.forEach((line, index) => {
    if (/\s$/.test(line) && line.length > 0) {
      trailing.push(index + 1);
    }
  });
  if (trailing.length > 0) {
    const rel = relative(projectRoot, filePath);
    console.warn(`Warning: trailing whitespace detected in ${rel}:${trailing.join(',')}`);
    return false;
  }
  return true;
}

async function main() {
  try {
    const stats = await stat(targetDir);
    if (!stats.isDirectory()) {
      console.log('No src directory found, skipping format check.');
      return;
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      console.log('No src directory found, skipping format check.');
      return;
    }
    throw error;
  }

  const files = await gatherFiles(targetDir);
  let ok = true;
  for (const file of files) {
    const result = await checkFile(file);
    if (!result) {
      ok = false;
    }
  }
  if (!ok) {
    console.error('Formatting issues detected. Please clean trailing whitespace.');
    process.exitCode = 1;
  } else {
    console.log(`Checked ${files.length} files for trailing whitespace.`);
  }
}

main().catch((error) => {
  console.error('format-check failed', error);
  process.exitCode = 1;
});
