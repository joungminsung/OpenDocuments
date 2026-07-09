# Security And Operations

Security choices:

- API keys and secrets are read from environment variables, not hardcoded.
- SQL access uses parameterized statements.
- FTS5 user input is escaped before query execution.
- LanceDB filters are built through a helper instead of raw string interpolation.
- Team mode protects HTTP endpoints with auth middleware.
- Workspace isolation keeps documents, conversations, and admin data scoped to the active workspace.
- Error responses avoid exposing stack traces or internal paths in production-facing paths.

Operational choices:

- `opendocuments doctor` checks configuration, model connectivity, and Ollama availability.
- Backup and restore commands snapshot SQLite and LanceDB data.
- Health endpoints support container orchestration.
- The Docker image runs as a non-root user.
- The project supports local Ollama for private deployments and cloud providers when latency or quality is more important.

Interview point:

The project was designed as a product-shaped system rather than a script. It includes diagnostics, health checks, CLI workflows, persistent storage, plugin boundaries, and deployment paths.
