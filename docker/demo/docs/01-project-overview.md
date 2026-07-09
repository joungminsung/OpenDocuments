# OpenDocuments Project Overview

OpenDocuments is a self-hosted RAG platform for private document search. It connects to document sources, parses files, chunks content, creates embeddings, stores metadata in SQLite, stores vectors in LanceDB, and answers natural-language questions with source citations.

The project is useful when an organization has knowledge spread across GitHub, Notion, Google Drive, Confluence, S3, API documents, spreadsheets, PDFs, and local files.

Core product surfaces:

- Web UI for chat, document management, plugins, connectors, settings, health, and admin views.
- CLI named `opendocuments` for init, start, index, ask, doctor, backup, restore, plugin, connector, auth, workspace, and document commands.
- HTTP API from the server package.
- TypeScript SDK from `@opendocuments/client`.
- MCP server so AI coding assistants can search the same internal knowledge base.

Interview positioning:

OpenDocuments is not just a chatbot UI. It is an application layer around RAG that includes ingestion, parsing, retrieval, answer generation, source citations, storage, security, operations tooling, and plugin extensibility.
