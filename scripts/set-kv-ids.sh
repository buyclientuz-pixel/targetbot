#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$PROJECT_ROOT"
usage() {
  cat <<'USAGE'
Usage: ./scripts/set-kv-ids.sh [--reports <id>] [--billing <id>] [--logs <id>]

Provide the Namespace IDs for your KV bindings either via flags, environment
variables (REPORTS_NAMESPACE_ID, BILLING_NAMESPACE_ID, LOGS_NAMESPACE_ID), or by
entering them interactively when prompted.
USAGE
}
REPORTS_ID="${REPORTS_NAMESPACE_ID:-}"
BILLING_ID="${BILLING_NAMESPACE_ID:-}"
LOGS_ID="${LOGS_NAMESPACE_ID:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reports)
      REPORTS_ID="${2:-}"
      shift 2
      ;;
    --billing)
      BILLING_ID="${2:-}"
      shift 2
      ;;
    --logs)
      LOGS_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done
prompt_for() {
  local var_name="$1"
  local current_value="$2"
  local prompt="$3"
  if [[ -n "$current_value" ]]; then
    echo "$current_value"
    return
  fi
  if [[ -t 0 && -t 1 ]]; then
    read -rp "$prompt" value
    echo "$value"
  else
    echo ""  # non-interactive, leave empty
  fi
}
REPORTS_ID=$(prompt_for REPORTS_ID "$REPORTS_ID" "REPORTS_NAMESPACE ID: ")
BILLING_ID=$(prompt_for BILLING_ID "$BILLING_ID" "BILLING_NAMESPACE ID: ")
LOGS_ID=$(prompt_for LOGS_ID "$LOGS_ID" "LOGS_NAMESPACE ID: ")
missing=()
[[ -z "$REPORTS_ID" ]] && missing+=(REPORTS_NAMESPACE)
[[ -z "$BILLING_ID" ]] && missing+=(BILLING_NAMESPACE)
[[ -z "$LOGS_ID" ]] && missing+=(LOGS_NAMESPACE)
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing Namespace IDs for: ${missing[*]}" >&2
  usage >&2
  exit 1
fi
update_placeholder() {
  local placeholder="$1"
  local new_value="$2"
  if ! grep -q "${placeholder}" wrangler.toml; then
    return
  fi
  python - "$placeholder" "$new_value" <<'PY'
import sys
from pathlib import Path
placeholder = sys.argv[1]
value = sys.argv[2]
path = Path("wrangler.toml")
text = path.read_text()
replaced = text.replace(f'id = "{placeholder}"', f'id = "{value}"')
if text == replaced:
    print(f"Expected placeholder {placeholder} not found for replacement", file=sys.stderr)
    raise SystemExit(1)
path.write_text(replaced)
PY
}
update_placeholder "REPLACE_WITH_REPORTS_NAMESPACE_ID" "$REPORTS_ID"
update_placeholder "REPLACE_WITH_BILLING_NAMESPACE_ID" "$BILLING_ID"
update_placeholder "REPLACE_WITH_LOGS_NAMESPACE_ID" "$LOGS_ID"
echo "Updated wrangler.toml with provided KV Namespace IDs."
./scripts/check-readiness.sh || true
