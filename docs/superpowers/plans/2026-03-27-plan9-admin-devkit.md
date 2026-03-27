# Plan 9: Admin Dashboard + Plugin Dev Kit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin dashboard (Web UI + API) with indexing stats, search quality metrics, query logs, and plugin metrics. Create Plugin Dev Kit for community plugin development.

**Architecture:** Admin API endpoints serve aggregated data. Web UI adds an Admin page with charts/tables. Plugin Dev Kit is a set of CLI commands for scaffolding and testing plugins.

**Depends on:** Plan 8 complete

---

## Task 1: Admin API Endpoints

Extend server routes for admin data:
- GET /api/v1/admin/stats (indexing stats: doc count, chunk count, source distribution)
- GET /api/v1/admin/search-quality (hit rate, avg confidence, intent distribution)
- GET /api/v1/admin/query-logs (paginated query log viewer with filters)
- GET /api/v1/admin/plugins (plugin metrics from healthCheck/metrics)
- 5 tests

## Task 2: Admin Dashboard Web UI

Add Admin page to Web UI:
- Stats cards (documents, chunks, workspaces, plugins)
- Query log table with search/filter
- Search quality metrics (confidence distribution)
- Plugin health status
- Connector sync status

## Task 3: Plugin Dev Kit CLI Commands

Add CLI subcommands:
- `opendocuments plugin create <name>` -- scaffold plugin boilerplate
- `opendocuments plugin test` -- run plugin interface compliance tests
- `opendocuments plugin list` -- list installed plugins with health status
- 3 tests

## Task 4: Integration + Final Verification

- Wire admin routes with auth (admin-only)
- Update Web UI sidebar with Admin link
- Run full test suite
- Verify CLI commands work end-to-end
