#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/packages/cli/dist/index.js"
DATA_DIR="$ROOT_DIR/.opendocuments-demo"

if [[ ! -f "$CLI" ]]; then
  echo "[!!] CLI build not found: $CLI"
  echo "[->] Run: npm install && npm run build"
  exit 1
fi

cd "$ROOT_DIR/examples/presentation-demo"

run_search() {
  local query="$1"
  echo
  echo "[->] opendocuments search \"$query\""
  OPENDOCUMENTS_DATA_DIR="$DATA_DIR" \
  OPENDOCUMENTS_PROBE_RETRIES="${OPENDOCUMENTS_PROBE_RETRIES:-1}" \
  OPENDOCUMENTS_PROBE_DELAY_MS="${OPENDOCUMENTS_PROBE_DELAY_MS:-250}" \
  node "$CLI" search "$query" --top 3
}

run_search "fictional internal analytics assistant product engineering operations"
run_search "private retrieval layer local-first indexing source-grounded search architecture"
run_search "sensitive patterns replaced hashed removed PII"
run_search "RTO 30 minutes recovery objective"
run_search "What is the Delta Lakehouse reference?"
