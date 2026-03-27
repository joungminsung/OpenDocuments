# OpenDocuments

> Self-hosted open-source RAG platform that unifies scattered organizational documents and answers natural language queries with accurate, source-cited responses.

## Quick Start

```bash
npm install -g @opendocuments/cli
opendocuments init
opendocuments start
```

Then open http://localhost:3000 in your browser.

## CLI Commands

```bash
opendocuments init              # Interactive setup wizard
opendocuments start             # Start server (Web UI + API + MCP)
opendocuments start --mcp-only  # MCP server for Claude Code / Cursor
opendocuments index ./docs      # Index local files
opendocuments ask "question"    # Ask from CLI
opendocuments doctor            # System health check
opendocuments config            # View configuration
opendocuments connector list    # List connectors
opendocuments connector sync    # Sync all connectors
opendocuments auth create-key   # Generate API key
opendocuments auth list-keys    # List API keys
opendocuments plugin list       # List installed plugins
opendocuments plugin create     # Scaffold a new plugin
opendocuments stop              # Stop the server
opendocuments search "keyword"  # Search without LLM
opendocuments document list     # List documents
opendocuments workspace list    # List workspaces
opendocuments export            # Export data backup
opendocuments import <path>     # Import from backup
opendocuments upgrade           # Upgrade to latest
opendocuments completion install # Install shell completions
```

## Supported File Formats

| Format | Extension |
|--------|-----------|
| Markdown | .md, .mdx |
| Plain Text | .txt |
| PDF | .pdf |
| Word | .docx |
| Excel/CSV | .xlsx, .xls, .csv |
| HTML | .html, .htm |
| Jupyter | .ipynb |

## Model Providers

- **Ollama** (local) -- default
- **OpenAI** (GPT-4o)
- **Anthropic** (Claude)
- **Google** (Gemini)
- **Grok** (xAI)

## Development

```bash
git clone https://github.com/opendocuments/opendocuments
cd opendocuments
npm run setup    # Install + build
npm run test     # Run all tests
```

## License

MIT
