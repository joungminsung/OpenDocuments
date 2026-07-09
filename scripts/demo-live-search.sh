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

if [[ ! -d "$DATA_DIR" ]]; then
  echo "[!!] Demo index not found: $DATA_DIR"
  echo "[->] Run: ./scripts/demo-index.sh"
  exit 1
fi

cd "$ROOT_DIR/examples/presentation-demo"

echo "[--] OpenDocuments live search demo"
echo "[--] Type a search query and press Enter. Type q to quit."

while true; do
  printf "\nsearch> "
  IFS= read -r query

  if [[ "$query" == "q" || "$query" == "quit" || "$query" == "exit" ]]; then
    echo "[--] bye"
    break
  fi

  if [[ -z "$query" ]]; then
    continue
  fi

  OPENDOCUMENTS_DATA_DIR="$DATA_DIR" \
  OPENDOCUMENTS_PROBE_RETRIES="${OPENDOCUMENTS_PROBE_RETRIES:-1}" \
  OPENDOCUMENTS_PROBE_DELAY_MS="${OPENDOCUMENTS_PROBE_DELAY_MS:-250}" \
  node "$CLI" search "$query" --top 3
done
