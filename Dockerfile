# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/ packages/
COPY plugins/ plugins/
RUN npm install --include=optional
RUN rollup_version="$(node -p "require('./node_modules/rollup/package.json').version")" \
  && lancedb_version="$(node -p "require('./node_modules/@lancedb/lancedb/package.json').version")" \
  && node_arch="$(node -p "process.arch")" \
  && case "$node_arch" in \
    arm64) npm install --no-save "@rollup/rollup-linux-arm64-gnu@$rollup_version" "@lancedb/lancedb-linux-arm64-gnu@$lancedb_version" ;; \
    x64) npm install --no-save "@rollup/rollup-linux-x64-gnu@$rollup_version" "@lancedb/lancedb-linux-x64-gnu@$lancedb_version" ;; \
    *) echo "No explicit native package install for arch: $node_arch" ;; \
  esac
RUN npx turbo build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

# OCI image labels
LABEL org.opencontainers.image.title="OpenDocuments" \
      org.opencontainers.image.description="Self-hosted RAG platform for your documents" \
      org.opencontainers.image.source="https://github.com/joungminsung/OpenDocuments" \
      org.opencontainers.image.licenses="MIT"

# Runtime utilities for health checks and TLS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user and group
RUN groupadd --system opendocs \
  && useradd --system --gid opendocs --home-dir /app --shell /usr/sbin/nologin opendocs

WORKDIR /app

COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/core/dist/storage/migrations packages/core/dist/storage/migrations
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/cli/dist packages/cli/dist
COPY --from=builder /app/packages/cli/package.json packages/cli/
COPY --from=builder /app/packages/cli/node_modules packages/cli/node_modules
COPY --from=builder /app/packages/web/dist packages/web/dist
COPY --from=builder /app/plugins/ plugins/
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json .

# Create data directory with correct ownership
RUN mkdir -p /data && chown opendocs:opendocs /data && chown -R opendocs:opendocs /app

# Default environment variables
ENV NODE_ENV=production \
    OPENDOCUMENTS_DATA_DIR=/data \
    PORT=3000

USER opendocs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "packages/cli/dist/index.js", "start", "--port", "3000"]
