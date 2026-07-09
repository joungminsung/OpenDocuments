# Simplified Web Workbench Design

## Goal

Make the OpenDocuments web app feel like a calm, credible AI document search product for daily office use, while adding a backend workbench summary API that supports the simplified first screen without several separate requests.

## Product Direction

OpenDocuments is a self-hosted RAG app. The web UI should emphasize asking documents, reading cited answers, and understanding whether the corpus is usable. It should not feel like a dense admin dashboard, a marketing landing page, or a technical demo.

The approved visual direction is minimal: a quiet left navigation, a large central ask/search surface, cited answers, compact source chips, and only essential status. Advanced operational details remain available on dashboard/admin pages but should not dominate the main chat surface.

## Design Thesis

This interface should feel like a focused document search desk because the product is for trust-sensitive internal knowledge work, so the UI should emphasize a single question path, visible citations, and low-noise system status.

## Scope

- Redesign the main chat screen around a single central work surface.
- Replace the always-visible evidence inspector with compact citations under the answer.
- Add simple, useful first-screen context: corpus count, health, recent prompts, and retrieval profile.
- Add a backend `GET /api/v1/workbench` endpoint that returns web-oriented overview data.
- Keep existing routes and pages working.
- Avoid backend changes to RAG retrieval behavior in this pass.

## Backend API

`GET /api/v1/workbench` returns:

- `health`: server status and version.
- `corpus`: document count, chunk count, source distribution, status distribution.
- `quality`: total query count, average confidence, average response time, feedback counts.
- `connectors`: connector count, active count, and recent connector summaries.
- `recentQueries`: recent query log rows trimmed for the home screen.
- `suggestedQuestions`: deterministic fallback prompts based on whether documents exist.

The endpoint is protected by the existing `/api/*` auth middleware. It uses the resolved request workspace and parameterized SQL.

## Frontend

The chat page becomes the primary product surface:

- Top area: small corpus/health strip.
- Empty state: large `Ask your documents` composer and concise suggested prompts.
- Answer state: readable message stream with compact citations and confidence.
- Session list: retained but simplified visually.
- Evidence: shown as source chips and expandable snippets rather than a permanent right rail.
- Dashboard: refreshed to a simpler overview using the same workbench summary API where useful.

## Error Handling

- Workbench API failures should not block chat.
- Missing admin-only workbench fields should show quiet fallback text instead of noisy errors.
- Offline health should disable sending and show a compact status.

## Testing

- Add server tests for `GET /api/v1/workbench`.
- Verify workspace scoping and response shape.
- Add frontend typecheck/build verification.
- Run targeted server tests and web build before completion.
