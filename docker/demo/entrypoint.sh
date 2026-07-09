#!/bin/sh
set -eu

cd /app

if [ "${OPENDOCUMENTS_MODEL_PROVIDER:-openai}" = "ollama" ] && [ -z "${OPENDOCUMENTS_MODEL_BASE_URL:-}" ]; then
  export OPENDOCUMENTS_MODEL_BASE_URL="http://ollama:11434"
fi

if [ "${OPENDOCUMENTS_DEMO_INDEX:-true}" = "true" ]; then
  key_state="nokey"
  if [ -n "${OPENDOCUMENTS_MODEL_API_KEY:-}" ] || [ -n "${GOOGLE_API_KEY:-}" ] || [ -n "${OPENAI_API_KEY:-}" ]; then
    key_state="key"
  fi

  model_state="${OPENDOCUMENTS_MODEL_PROVIDER:-openai}-${OPENDOCUMENTS_MODEL_EMBEDDING:-default}-${OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS:-default}-${key_state}"
  state_file="/data/.demo-model-state"
  if [ -f "$state_file" ] && [ "$(cat "$state_file")" != "$model_state" ]; then
    echo "[demo] Model embedding settings changed; resetting demo data volume."
    find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi

  marker="/data/.demo-indexed-${model_state}"
  if [ "${OPENDOCUMENTS_DEMO_REINDEX:-false}" = "true" ] || [ ! -f "$marker" ]; then
    echo "[demo] Indexing bundled interview documents..."
    if node packages/cli/dist/index.js index /demo-docs --reindex; then
      echo "$model_state" > "$state_file"
      date > "$marker"
    else
      echo "[demo] Demo indexing failed; starting the server anyway."
    fi
  else
    echo "[demo] Bundled interview documents already indexed. Set OPENDOCUMENTS_DEMO_REINDEX=true to refresh."
  fi
fi

echo "[demo] Starting OpenDocuments at http://localhost:${PORT:-3000}"
exec node packages/cli/dist/index.js start --port "${PORT:-3000}"
