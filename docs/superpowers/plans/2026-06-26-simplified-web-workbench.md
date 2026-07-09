# Simplified Web Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simpler, more trustworthy OpenDocuments web workbench and the backend API needed to support it.

**Architecture:** Add a server-side workbench route that aggregates workspace-scoped health, corpus, connector, quality, and recent query data. Update the React web app to consume that summary and present a focused ask/read/cite experience instead of a dense operational console.

**Tech Stack:** Hono, TypeScript, SQLite via existing DB wrapper, React 19, Zustand, Tailwind CSS, Vitest.

---

### Task 1: Backend Workbench API

**Files:**
- Create: `packages/server/src/http/routes/workbench.ts`
- Modify: `packages/server/src/http/app.ts`
- Test: `packages/server/tests/http/workbench.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that call `GET /api/v1/workbench`, assert response shape, and assert team mode auth still protects the endpoint.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run packages/server/tests/http/workbench.test.ts`
Expected: fail because the route does not exist.

- [ ] **Step 3: Implement route**

Create `workbenchRoutes(ctx)` with parameterized SQL for document, query, and recent query summaries. Register it from `createApp`.

- [ ] **Step 4: Run targeted tests**

Run: `npx vitest run packages/server/tests/http/workbench.test.ts`
Expected: pass.

### Task 2: Frontend API Types

**Files:**
- Modify: `packages/web/src/lib/types.ts`
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Add types**

Add `WorkbenchResponse` with `health`, `corpus`, `quality`, `connectors`, `recentQueries`, and `suggestedQuestions`.

- [ ] **Step 2: Add client function**

Add `getWorkbench()` that requests `/workbench`.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc -p packages/web/tsconfig.json --noEmit`
Expected: pass after UI usage is implemented.

### Task 3: Simplified Chat Workbench

**Files:**
- Modify: `packages/web/src/components/chat/ChatPage.tsx`
- Modify: `packages/web/src/components/chat/ChatInput.tsx`
- Modify: `packages/web/src/components/chat/ChatMessage.tsx`
- Modify: `packages/web/src/components/chat/SourceCard.tsx`

- [ ] **Step 1: Replace dense layout**

Remove the permanent right evidence rail and use a focused central layout with compact source chips.

- [ ] **Step 2: Add workbench summary**

Load `getWorkbench()` on mount. Show corpus count, health, average confidence, and suggested prompts in quiet UI.

- [ ] **Step 3: Improve answer details**

Render confidence and citations under assistant answers without overwhelming the page.

- [ ] **Step 4: Run web build**

Run: `npm run build --workspace=@opendocuments/web`
Expected: TypeScript and Vite build pass.

### Task 4: Dashboard Simplification

**Files:**
- Modify: `packages/web/src/components/dashboard/UnifiedDashboard.tsx`

- [ ] **Step 1: Reframe dashboard**

Keep operational details available but reduce visual noise, using clear sections for corpus, quality, connectors, and plugin health.

- [ ] **Step 2: Run web build**

Run: `npm run build --workspace=@opendocuments/web`
Expected: pass.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted server tests**

Run: `npx vitest run packages/server/tests/http/workbench.test.ts packages/server/tests/http/chat.test.ts`
Expected: pass.

- [ ] **Step 2: Run web build**

Run: `npm run build --workspace=@opendocuments/web`
Expected: pass.

- [ ] **Step 3: Start dev server**

Run: `npm run dev --workspace=@opendocuments/web -- --host 127.0.0.1`
Expected: Vite starts and prints a local URL.
