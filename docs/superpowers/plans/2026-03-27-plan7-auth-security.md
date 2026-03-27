# Plan 7: Authentication & Security

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add team mode with API key authentication, role-based access control, workspace isolation enforcement, PII auto-redaction, audit logging, and rate limiting.

**Architecture:** Auth middleware in Hono checks API keys and session tokens. WorkspaceManager gains member/role management. A SecurityManager enforces data policies. AuditLogger records security events.

**Tech Stack:** Built on existing core. No new external deps (crypto for API key generation, built-in rate tracking).

**Depends on:** Plan 6 complete (195 tests passing)

---

## Task 1: API Key Management (Core)

Create auth infrastructure in core:
- API key generation (od_live_ prefix + random hex)
- API key validation and lookup
- Scoped permissions per key
- Rate tracking per key
- 6 tests

## Task 2: Auth Middleware (Server)

Create Hono middleware:
- Skip auth in personal mode
- Require API key or session in team mode
- Extract user/workspace from key
- Rate limiting per key
- 5 tests

## Task 3: Role-Based Access Control

Add RBAC enforcement:
- admin: all operations
- member: query + upload + connectors
- viewer: query only (read-only)
- Protect routes by role
- 4 tests

## Task 4: PII Auto-Redaction

Implement PII masking before cloud API calls:
- Pattern matching (email, phone, credit card, etc.)
- Configurable via security.dataPolicy.autoRedact
- Applied in model plugin calls
- 4 tests

## Task 5: Audit Logging

Record security events to audit_logs table:
- cloud:data-sent, document:accessed, auth:login, config:changed, plugin:installed
- Queryable via admin API
- 3 tests

## Task 6: Integration (CLI auth commands + MCP + Web UI login)

- CLI: `opendocuments auth create-key`, `opendocuments auth list-keys`, `opendocuments auth revoke-key`
- MCP: tools respect auth when in team mode
- Web UI: basic login page for team mode
- Server: workspace switching based on auth
- Full integration test
