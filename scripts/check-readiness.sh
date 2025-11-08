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
  echo "You can also run './scripts/set-kv-ids.sh' to update wrangler.toml, or 'wrangler kv namespace list' to copy the IDs." >&2

  if command -v wrangler >/dev/null 2>&1; then
    if output=$(wrangler kv namespace list 2>&1); then
      echo >&2
      echo "Available KV namespaces from 'wrangler kv namespace list':" >&2
      echo "$output" >&2
    else
      echo >&2
      echo "(Tried to run 'wrangler kv namespace list' but it failed; ensure you are logged in with 'wrangler login'.)" >&2
    fi
  else
    echo >&2
    echo "Install Wrangler first so you can list namespace IDs: npm install -g wrangler" >&2
  fi

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
