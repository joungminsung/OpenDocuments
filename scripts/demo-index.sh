#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT_DIR/packages/cli/dist/index.js"
DEMO_DIR="$ROOT_DIR/examples/presentation-demo"
CORPUS_DIR="$DEMO_DIR/corpus"
DATA_DIR="$ROOT_DIR/.opendocuments-demo"

if [[ ! -f "$CLI" ]]; then
  echo "[!!] CLI build not found: $CLI"
  echo "[->] Run: npm install && npm run build"
  exit 1
fi

if [[ ! -d "$CORPUS_DIR" ]]; then
  echo "[!!] Demo corpus not found: $CORPUS_DIR"
  exit 1
fi

echo "[--] Data directory: $DATA_DIR"
echo "[--] Demo corpus:    $CORPUS_DIR"
echo "[..] Indexing presentation demo documents"

cd "$DEMO_DIR"

OPENDOCUMENTS_DATA_DIR="$DATA_DIR" \
OPENDOCUMENTS_PROBE_RETRIES="${OPENDOCUMENTS_PROBE_RETRIES:-1}" \
OPENDOCUMENTS_PROBE_DELAY_MS="${OPENDOCUMENTS_PROBE_DELAY_MS:-250}" \
node "$CLI" index "$CORPUS_DIR" --reindex
