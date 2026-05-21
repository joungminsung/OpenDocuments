# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/ packages/
COPY plugins/ plugins/
RUN npm ci
RUN npx turbo build

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:20-alpine

# OCI image labels
LABEL org.opencontainers.image.title="OpenDocuments" \
      org.opencontainers.image.description="Self-hosted RAG platform for your documents" \
      org.opencontainers.image.source="https://github.com/joungminsung/OpenDocuments" \
      org.opencontainers.image.licenses="MIT"

# Create non-root user and group
RUN addgroup -S opendocs && adduser -S opendocs -G opendocs

WORKDIR /app

COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/core/dist/storage/migrations packages/core/dist/storage/migrations
COPY --from=builder /app/packages/core/package.json packages/core/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/cli/dist packages/cli/dist
COPY --from=builder /app/packages/cli/package.json packages/cli/
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
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "packages/cli/dist/index.js", "start", "--port", "3000"]
