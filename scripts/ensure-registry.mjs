#!/usr/bin/env node
import { execSync } from 'node:child_process';

const registries = [
  process.env.NPM_REGISTRY_OVERRIDE,
  'https://registry.npmjs.cf/',
  'https://registry.npmjs.org/'
].filter(Boolean);

const normalize = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);

async function isReachable(url) {
  const target = `${normalize(url)}/-/ping`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      return true;
    }
    console.warn(`[registry] ${url} ping returned ${res.status}`);
  } catch (error) {
    console.warn(`[registry] ${url} ping failed: ${error.message}`);
  }
  return false;
}

async function main() {
  for (const url of registries) {
    if (await isReachable(url)) {
      execSync(`npm config set registry ${url} --location=project`, { stdio: 'inherit' });
      console.log(`✅ Using npm registry: ${url}`);
      return;
    }
  }
  console.error('❌ No npm registry endpoints are reachable.');
  process.exit(1);
}

main();
