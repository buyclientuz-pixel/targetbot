#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$PROJECT_ROOT"
print_status() {
  local label="$1"
  local icon="$2"
  local message="$3"
  printf '%s %s\n' "$icon" "$label: $message"
}
if grep -q "REPLACE_WITH_" wrangler.toml; then
  print_status "KV namespaces" "❌" "IDs still need to be copied from Cloudflare (run ./scripts/set-kv-ids.sh)"
else
  print_status "KV namespaces" "✅" "All bindings have concrete IDs"
fi
if command -v wrangler >/dev/null 2>&1; then
  if wrangler --version >/dev/null 2>&1; then
    print_status "Wrangler CLI" "✅" "Installed and reachable"
  else
    print_status "Wrangler CLI" "⚠️" "Installed but failed to run; try reinstalling"
  fi
else
  print_status "Wrangler CLI" "⚠️" "Not installed locally—install with 'npm install -g wrangler' or rely on the Cloudflare Git build"
fi
if [[ -f src/index.ts ]]; then
  if grep -q "export default" src/index.ts; then
    print_status "Worker entry" "✅" "src/index.ts exports the handler"
  else
    print_status "Worker entry" "⚠️" "src/index.ts found but missing default export"
  fi
else
  print_status "Worker entry" "❌" "src/index.ts is missing"
fi
print_status "Deploy command" "ℹ️" "Use 'wrangler deploy' once the items above are green (or push to the connected repo)"
