# Remove Unsupported Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove connector packages that exist in the workspace but are not supported by the product bootstrap, CLI presets, or official docs.

**Architecture:** Keep the supported connector surface aligned with `packages/server/src/bootstrap.ts`, CLI presets, and documented connectors. Remove unsupported workspace packages completely so they are not built, tested, published, or importable.

**Tech Stack:** TypeScript, npm workspaces, Turborepo, Vitest.

---

### Task 1: Add Removal Guard Test

**Files:**
- Create: `packages/server/tests/unsupported-connectors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
const unsupportedConnectorPackages = [
  '@opendocuments/connector-discord',
  '@opendocuments/connector-jira',
  '@opendocuments/connector-linear',
  '@opendocuments/connector-slack',
]

describe('unsupported connector packages', () => {
  it('are not importable from the workspace', async () => {
    for (const packageName of unsupportedConnectorPackages) {
      await expect(import(packageName)).rejects.toThrow()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/server/tests/unsupported-connectors.test.ts`
Expected: FAIL because the packages still exist and import successfully.

### Task 2: Remove Unsupported Connector Packages

**Files:**
- Delete directory: `plugins/connector-discord`
- Delete directory: `plugins/connector-jira`
- Delete directory: `plugins/connector-linear`
- Delete directory: `plugins/connector-slack`

- [ ] **Step 1: Remove the four plugin package directories**

Run: `rm -rf plugins/connector-discord plugins/connector-jira plugins/connector-linear plugins/connector-slack`

- [ ] **Step 2: Confirm directories are gone**

Run: `test ! -d plugins/connector-discord && test ! -d plugins/connector-jira && test ! -d plugins/connector-linear && test ! -d plugins/connector-slack`
Expected: exit code 0.

### Task 3: Refresh Workspace Metadata

**Files:**
- Modify: `package-lock.json`

- [ ] **Step 1: Regenerate package lock without installing package code changes**

Run: `npm install --package-lock-only`
Expected: package lock no longer contains the four removed workspace packages.

- [ ] **Step 2: Search for stale references**

Run: `rg "connector-(discord|jira|linear|slack)|@opendocuments/connector-(discord|jira|linear|slack)" . -g '!node_modules'`
Expected: only historical references in changelogs or no references. If product docs/code references remain, remove them.

### Task 4: Verify

**Files:**
- Test: `packages/server/tests/unsupported-connectors.test.ts`

- [ ] **Step 1: Run the guard test**

Run: `npx vitest run packages/server/tests/unsupported-connectors.test.ts`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.
