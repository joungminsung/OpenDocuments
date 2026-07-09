# Platform Hardening and Web Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenDocuments behave like a working self-hosted RAG platform across web, CLI, SDK, and server security contracts.

**Architecture:** Keep the server as the API contract owner, align the SDK and web client to those contracts, and make the web app's first screen a chat workbench with conversation state instead of an admin dashboard. Fix CLI reliability and shell execution risks without changing its local-first architecture.

**Tech Stack:** TypeScript, Hono, React, Zustand, Vitest, Turborepo, Commander.js.

---

### Task 1: Server Contract and Security Scope

**Files:**
- Modify: `packages/server/src/http/routes/documents.ts`
- Modify: `packages/server/src/http/routes/conversations.ts`
- Test: `packages/server/tests/http/documents.test.ts`
- Test: `packages/server/tests/http/conversations.test.ts`

- [ ] Add failing tests that verify read-only team API keys cannot upload, delete, restore, or share conversations.
- [ ] Apply `requireScope('document:write')` to write document routes.
- [ ] Apply `requireScope('ask')` to conversation sharing.
- [ ] Run `npm run test --workspace opendocuments-server`.

### Task 2: SDK Contract Alignment

**Files:**
- Modify: `packages/client/src/index.ts`
- Modify: `packages/client/tests/client.test.ts`
- Modify: `docs-site/sdk/guide.md`

- [ ] Add failing tests for `ask(query, { profile })`, confidence object typing, upload response shape, and conversation APIs.
- [ ] Update SDK types and methods to match server responses.
- [ ] Update docs to use `@opendocuments/client`.
- [ ] Run `npm run test --workspace @opendocuments/client`.

### Task 3: CLI Reliability and Command Safety

**Files:**
- Modify: `packages/cli/tests/commands/ask.test.ts`
- Modify: `packages/cli/tests/commands/doctor.test.ts`
- Modify: `packages/cli/src/commands/plugin.ts`
- Modify: `packages/cli/src/commands/start.ts`
- Modify: `packages/cli/src/commands/doctor.ts`

- [ ] Make CLI tests bootstrap with stub models and clean up safely.
- [ ] Replace shell-interpolated npm commands with `execFileSync`.
- [ ] Handle `SIGTERM` with the same graceful shutdown path as `SIGINT`.
- [ ] Report the package version in `doctor`.
- [ ] Run `npm run test --workspace opendocuments`.

### Task 4: Web Conversation Workbench

**Files:**
- Modify: `packages/web/src/lib/types.ts`
- Modify: `packages/web/src/lib/api.ts`
- Modify: `packages/web/src/stores/chatStore.ts`
- Modify: `packages/web/src/components/chat/ChatPage.tsx`
- Modify: `packages/web/src/components/layout/Layout.tsx`
- Modify: `packages/web/src/components/layout/Sidebar.tsx`
- Modify: `packages/web/src/App.tsx`

- [ ] Add conversation list/message/share API client methods.
- [ ] Add Zustand actions for loading, selecting, creating, deleting, renaming, and sharing sessions.
- [ ] Redesign `ChatPage` as a three-region RAG workbench: sessions, message stream, evidence/health rail.
- [ ] Hide admin-first navigation from the primary path and make the header show product state instead.
- [ ] Prevent streaming failures from leaving the app stuck.
- [ ] Run `npm run build --workspace @opendocuments/web`.

### Task 5: Deployment and Final Verification

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

- [ ] Point container healthchecks at `/api/v1/health`.
- [ ] Run `npm run build`, `npm run typecheck`, and targeted tests.
