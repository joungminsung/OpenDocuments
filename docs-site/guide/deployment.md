# Deployment

OpenDocuments has three operational dependencies: the application process, its SQLite/LanceDB data directory, and a working generation/embedding provider. Treat all three as part of readiness.

## npm deployment

```bash
npm install -g opendocuments
opendocuments init
opendocuments doctor
opendocuments start --port 3000
```

`init` writes new projects to `./.opendocuments` so unrelated projects do not silently share a database. It asks before downloading Ollama models. A normal `start` never pulls models.

## Docker

### Local LLM with Ollama

```bash
OPENDOCUMENTS_MODEL_PROVIDER=ollama \
OPENDOCUMENTS_MODEL_BASE_URL=http://ollama:11434 \
OPENDOCUMENTS_MODEL_LLM=qwen2.5:14b \
OPENDOCUMENTS_MODEL_EMBEDDING=mxbai-embed-large \
docker compose --profile with-ollama up -d
```

The Compose file pins Ollama to `0.32.0` by default. Override it deliberately with `OLLAMA_IMAGE=ollama/ollama:<tested-version>`.

The Ollama container does not automatically contain the configured models. Pull them explicitly:

```bash
docker compose exec ollama ollama pull qwen2.5:14b
docker compose exec ollama ollama pull mxbai-embed-large
docker compose restart opendocuments
```

### Cloud model provider

Do not enable the Ollama profile. Set the provider, its real API base URL, models, and key:

```bash
OPENDOCUMENTS_MODEL_PROVIDER=openai \
OPENDOCUMENTS_MODEL_BASE_URL=https://api.openai.com/v1 \
OPENDOCUMENTS_MODEL_API_KEY="$OPENAI_API_KEY" \
OPENDOCUMENTS_MODEL_LLM=gpt-4o \
OPENDOCUMENTS_MODEL_EMBEDDING=text-embedding-3-small \
docker compose up -d
```

When `security.dataPolicy.allowCloudProcessing` is `false`, OpenDocuments refuses to start with a cloud generation or embedding provider.

### Custom config

```bash
docker run -d \
  -v ./opendocuments.config.ts:/app/opendocuments.config.ts:ro \
  -v opendocuments-data:/data \
  -p 3000:3000 \
  opendocuments
```

## Readiness and monitoring

| Endpoint | Purpose | Expected result |
|---|---|---|
| `/healthz` | Public process liveness only | `200` while the HTTP process is alive |
| `/api/v1/healthz` | API liveness | `200` |
| `/api/v1/readyz` | SQLite, LanceDB, and model readiness | `200` only when dependencies are ready; `503` otherwise |

Team mode protects `/api/v1/readyz`; send a scoped API key. Container orchestration should use `/healthz` for liveness and authenticated `/api/v1/readyz` for readiness when supported. Application logs go to stdout/stderr; route them to the platform log collector.

## Reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name docs.company.com;

    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

Set `security.transport.proxy` to the exact reverse-proxy IP or CIDR. Forwarded headers from any other peer are ignored. Team mode accepts loopback HTTP for local administration but requires HTTPS for remote API, auth, and shared-link traffic by default.

## Team-mode security baseline

The `init` wizard now:

- creates a project-local data directory;
- enables PII redaction and local audit logging;
- creates an initial administrator API key and displays it once;
- blocks cloud processing unless the selected setup explicitly uses it;
- enables remote HTTPS enforcement.

Store the initial key in a password manager. Browser sign-in exchanges it for an HttpOnly, SameSite session cookie; the Web UI does not keep the key in local storage.

Connector tokens entered in the Web UI are used by the current runtime but are not written to connector JSON. For restart-safe credentials, set provider environment variables such as `GITHUB_TOKEN`, `NOTION_TOKEN`, `GDRIVE_ACCESS_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_TOKEN`.

`security.storage.encryptAtRest` is not a cosmetic flag: the server refuses to start when it is enabled because application-level database encryption is not implemented. Use an encrypted host disk or encrypted persistent volume.

## Backup and restore

Stop the instance before any snapshot:

```bash
opendocuments stop
opendocuments backup --output /secure-backups/opendocuments-2026-07-27
```

The backup includes SQLite (including WAL/SHM files), LanceDB vectors, installed-plugin state, a SHA-256 inventory, and current workspace state. Keep `opendocuments.config.ts` in private source control and `.env` in a secret manager; they are intentionally not copied into the data snapshot.

Restore validates every size and checksum before touching active data. `--force` first creates an automatic `pre-restore-*` safety backup, stages the incoming files, and rolls back the file swap if installation fails:

```bash
opendocuments restore /secure-backups/opendocuments-2026-07-27 --force
opendocuments doctor
opendocuments start
```

Test restore regularly on a separate host. A backup that has never been restored is not a verified recovery plan.

## Upgrades and rollback

```bash
opendocuments stop
opendocuments upgrade --version 0.3.1
opendocuments doctor
opendocuments start
```

`upgrade` creates a pre-upgrade data backup before changing the global CLI. If npm installation fails, it attempts to reinstall the previous CLI version and leaves instance data untouched.

To roll back after an application-level regression:

```bash
npm install -g opendocuments@<previous-version>
opendocuments restore ~/.opendocuments/backups/pre-upgrade-<timestamp> --force
opendocuments doctor
```

## Changing embedding models

Embedding dimensions are part of the persisted LanceDB schema. Startup now checks the configured dimension against the existing table and stops with an actionable error instead of failing during a user query.

To intentionally change dimensions:

```bash
opendocuments stop
opendocuments reset-index --yes
opendocuments start
opendocuments connector sync
opendocuments index ./docs --reindex
```

`reset-index` creates a full safety backup, archives the previous vector directory, clears stale full-text chunks, and marks document records for reindexing. Local sources still need their original paths; connector sources need valid credentials.

## Production checklist

- [ ] `opendocuments doctor` passes with no stub models
- [ ] `/api/v1/readyz` returns `200`
- [ ] Team mode has a non-default admin key stored securely
- [ ] HTTPS and the trusted proxy allowlist are configured
- [ ] Cloud processing is explicitly allowed or blocked
- [ ] Connector credentials are supplied through the runtime secret manager
- [ ] Backup and restore have been tested on a separate instance
- [ ] Embedding model and dimensions are pinned
- [ ] Ollama/container image versions are pinned
- [ ] Logs and readiness failures are collected by the hosting platform

## MCP server

```bash
opendocuments start --mcp-only
```

```json
{
  "mcpServers": {
    "opendocuments": {
      "command": "opendocuments",
      "args": ["start", "--mcp-only"]
    }
  }
}
```

MCP startup uses the same model, embedding-dimension, security-policy, and storage checks as the HTTP server.
