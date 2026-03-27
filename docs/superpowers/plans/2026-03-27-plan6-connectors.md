# Plan 6: Connectors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add connector plugins for GitHub, Notion, Web Crawler, and real-time Web Search so users can index documents from external sources beyond local files.

**Architecture:** Each connector implements the `ConnectorPlugin` interface (discover, fetch, watch). The ingest pipeline's Discover/Fetch stages are activated. A new ConnectorManager orchestrates sync scheduling. MCP client connector allows connecting to external MCP servers.

**Tech Stack:** Octokit (GitHub API), Notion SDK, cheerio (web crawling), node-cron (scheduling)

**Depends on:** Plan 5 complete (168 tests passing)

---

## Task 1: Connector Orchestration Layer (Core)

Add Discover/Fetch stages to the ingest pipeline so connectors can feed documents into the existing Parse→Chunk→Embed→Store flow.

- Create `packages/core/src/connector/manager.ts` -- ConnectorManager that schedules sync for registered connectors
- Update IngestPipeline to accept RawDocument from connectors
- Wire connector events (connector:sync:started, connector:sync:completed)
- 4 tests

## Task 2: GitHub Connector Plugin

- Create `plugins/connector-github/` implementing ConnectorPlugin
- Uses GitHub REST API (no SDK dep -- just fetch) to crawl: README, markdown files in repo, Wiki, Issues
- discover(): list all .md files in repo via /repos/{owner}/{repo}/git/trees
- fetch(): download file content via /repos/{owner}/{repo}/contents/{path}
- watch(): poll-based (configurable interval)
- Config: { repo, token, branch, syncInterval }
- 6 tests (mocked fetch)

## Task 3: Notion Connector Plugin

- Create `plugins/connector-notion/` implementing ConnectorPlugin
- Uses Notion API via fetch (no SDK)
- discover(): list pages/databases via /search
- fetch(): retrieve page blocks via /blocks/{id}/children, convert to text
- Config: { token, rootPageId?, syncInterval }
- 5 tests (mocked fetch)

## Task 4: Web Crawler Connector Plugin

- Create `plugins/connector-web-crawler/` implementing ConnectorPlugin
- Crawls user-registered URLs, extracts text via cheerio
- discover(): return list of registered URLs
- fetch(): HTTP GET + cheerio text extraction
- Config: { urls: string[], depth?, syncInterval }
- 4 tests

## Task 5: Web Search Integration (Tavily)

- Create `plugins/connector-web-search/` -- not a full ConnectorPlugin but a search provider
- Integrates with Tavily API for real-time web search
- Used by RAG engine when profile.features.webSearch is enabled
- Create a WebSearchProvider interface in core
- 4 tests

## Task 6: Bootstrap + CLI + MCP Integration

- Update bootstrap to auto-register installed connector plugins
- Add `opendocuments connector` CLI subcommands (list, sync, status)
- Add MCP tools: opendocuments_connector_list, opendocuments_connector_sync
- Update Web UI with basic connector status display
- Run full test suite
