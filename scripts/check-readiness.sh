#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$PROJECT_ROOT"
placeholder_lines=$(grep -n "REPLACE_WITH_" wrangler.toml || true)
if [[ -n "$placeholder_lines" ]]; then
  echo "❌ wrangler.toml still contains placeholder KV namespace IDs." >&2
  echo "$placeholder_lines" >&2
  echo >&2
  echo "Fill in the real Namespace IDs from Cloudflare Workers → Settings → Variables and bindings → KV Namespace bindings." >&2
  echo "You can also run 'wrangler kv namespace list' to copy the IDs for each binding." >&2
  echo >&2
  echo "Update these bindings in wrangler.toml:" >&2
  printf '  • %s\n' "REPORTS_NAMESPACE" "BILLING_NAMESPACE" "LOGS_NAMESPACE" >&2
  exit 1
fi
if ! command -v wrangler >/dev/null 2>&1; then
  echo "⚠️ Wrangler CLI is not installed or not on PATH." >&2
  echo "Install it with: npm install -g wrangler" >&2
  exit 1
fi
if ! wrangler --version >/dev/null 2>&1; then
  echo "⚠️ Unable to run 'wrangler --version'. Check your Wrangler installation." >&2
  exit 1
fi
if [[ ! -f src/index.ts ]]; then
  echo "⚠️ src/index.ts is missing." >&2
  exit 1
fi
if ! grep -q "export default" src/index.ts; then
  echo "⚠️ src/index.ts does not export a default handler." >&2
  exit 1
fi
echo "✅ Project is ready. Wrangler CLI is installed and configuration contains no placeholder KV IDs."
