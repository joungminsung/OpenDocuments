# Plugin System

OpenDocuments uses a modular plugin system with 4 plugin types:

| Type | Purpose | Example |
|------|---------|---------|
| [Parser](./parser-api.md) | Transform documents into chunks | PDF, DOCX, HTML, Code |
| [Connector](./connector-api.md) | Sync from external sources | GitHub, Notion, Google Drive |
| [Model](./model-api.md) | LLM generation & embeddings | Ollama, OpenAI, Anthropic |
| Middleware | Hook into processing pipeline | Custom filters, transforms |

## Quick Start

```bash
# Create a new plugin
opendocuments plugin create my-parser --type parser

# Develop
cd plugins/my-parser
npm run dev

# Test
npm run test

# Publish
opendocuments plugin publish
```

## Plugin Commands

| Command | Description |
|---------|-------------|
| `plugin create <name> --type <type>` | Scaffold a new plugin |
| `plugin list` | Show installed plugins with health status |
| `plugin test` | Run plugin tests |
| `plugin dev` | Watch mode for development |
| `plugin publish` | Publish to npm |

## Naming Convention

- Official: `@opendocuments/parser-*`, `@opendocuments/connector-*`
- Community: `opendocuments-parser-*`, `opendocuments-connector-*`

## Learning Path

1. Start with the [Parser API](./parser-api.md) - simplest plugin type
2. Study `parser-html` (150 lines) as a reference
3. Try the [Connector API](./connector-api.md) for external integrations
4. See [Model API](./model-api.md) for custom AI providers
