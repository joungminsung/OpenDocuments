# Plan 1: Project Bootstrap + Core Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the OpenDocuments monorepo with a working plugin system, storage layer, event bus, and config system -- the foundation everything else builds on.

**Architecture:** Turborepo monorepo with `@opendocuments/core` as the central package. Core exposes a plugin registry where connectors, parsers, models, and middleware register via typed interfaces. Storage is abstracted behind interfaces (SQLite + ChromaDB for default mode). An event bus decouples components. `opendocuments.config.ts` is the single source of truth loaded via a typed config loader.

**Tech Stack:** TypeScript 5.5+, Turborepo, Vitest, Zod (config validation), better-sqlite3, chromadb, eventemitter3, chalk (logging)

**Spec Reference:** `docs/superpowers/specs/2026-03-26-opendocuments-design.md`

---

## File Structure

```
opendocuments/
├── package.json                     # root workspace config
├── turbo.json                       # turborepo pipeline config
├── tsconfig.base.json               # shared TS config
├── .changeset/
│   └── config.json                  # changesets config
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                   # lint + test + typecheck
│
└── packages/
    └── core/
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/
        │   ├── index.ts             # public API barrel export
        │   ├── config/
        │   │   ├── schema.ts        # Zod schema for opendocuments.config.ts
        │   │   ├── loader.ts        # load + validate config file
        │   │   └── defaults.ts      # default config values
        │   ├── plugin/
        │   │   ├── interfaces.ts    # all plugin type interfaces
        │   │   ├── registry.ts      # plugin registration + lookup
        │   │   ├── loader.ts        # resolve + require + validate plugins
        │   │   └── capability.ts    # version + dependency checking
        │   ├── storage/
        │   │   ├── db.ts            # DB interface + factory
        │   │   ├── sqlite.ts        # SQLite implementation
        │   │   ├── vector-db.ts     # Vector DB interface + factory
        │   │   ├── chroma.ts        # ChromaDB implementation
        │   │   └── migrations/
        │   │       ├── runner.ts     # migration runner
        │   │       └── 001_initial.sql
        │   ├── events/
        │   │   └── bus.ts           # typed event bus
        │   ├── workspace/
        │   │   └── manager.ts       # workspace CRUD
        │   └── utils/
        │       ├── logger.ts        # colored console logger
        │       └── hash.ts          # SHA-256 utility
        └── tests/
            ├── config/
            │   └── loader.test.ts
            ├── plugin/
            │   ├── registry.test.ts
            │   ├── loader.test.ts
            │   └── capability.test.ts
            ├── storage/
            │   ├── sqlite.test.ts
            │   ├── chroma.test.ts
            │   └── migrations.test.ts
            ├── events/
            │   └── bus.test.ts
            └── workspace/
                └── manager.test.ts
```

---

## Task 1: Monorepo Bootstrap

**Files:**
- Create: `package.json`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.changeset/config.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/dgsw36/Desktop/01_프로젝트-개발/AI/OpenDocuments
git init
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "opendocuments-monorepo",
  "private": true,
  "workspaces": ["packages/*", "plugins/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "dev": "turbo dev",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.0",
    "turbo": "^2.3.0",
    "typescript": "^5.5.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "npm@10.0.0"
}
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": false
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 5: Create .changeset/config.json**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.db
*.sqlite
.env
.env.local
.turbo/
coverage/
.DS_Store
```

- [ ] **Step 7: Create packages/core/package.json**

```json
{
  "name": "@opendocuments/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "chromadb": "^1.9.0",
    "eventemitter3": "^5.0.0",
    "zod": "^3.23.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 8: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 9: Create packages/core/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 10: Create packages/core/src/index.ts (empty barrel)**

```typescript
// @opendocuments/core - public API
// Will be populated as modules are implemented

export const VERSION = '0.1.0'
```

- [ ] **Step 11: Install dependencies and verify**

```bash
npm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 12: Verify build works**

```bash
npx turbo build
```

Expected: `packages/core/dist/index.js` created.

- [ ] **Step 13: Commit**

```bash
git add package.json turbo.json tsconfig.base.json .gitignore .changeset/ packages/core/ docs/
git commit -m "feat: bootstrap monorepo with turborepo and @opendocuments/core skeleton"
```

---

## Task 2: Utility Modules (logger + hash)

**Files:**
- Create: `packages/core/src/utils/logger.ts`
- Create: `packages/core/src/utils/hash.ts`

These are small, dependency-free modules used everywhere else. No tests needed -- they wrap standard APIs.

- [ ] **Step 1: Create logger**

```typescript
// packages/core/src/utils/logger.ts
import chalk from 'chalk'

const symbols = {
  ok: chalk.green('[ok]'),
  fail: chalk.red('[!!]'),
  info: chalk.blue('[--]'),
  arrow: chalk.cyan('[->]'),
  wait: chalk.yellow('[..]'),
  ask: chalk.magenta('[??]'),
  skip: chalk.dim('[skip]'),
} as const

export const log = {
  ok: (msg: string) => console.log(`  ${symbols.ok} ${msg}`),
  fail: (msg: string) => console.log(`  ${symbols.fail} ${chalk.red(msg)}`),
  info: (msg: string) => console.log(`  ${symbols.info} ${msg}`),
  arrow: (msg: string) => console.log(`  ${symbols.arrow} ${chalk.cyan(msg)}`),
  wait: (msg: string) => console.log(`  ${symbols.wait} ${chalk.yellow(msg)}`),
  heading: (msg: string) => console.log(`\n  ${chalk.bold.white(msg)}\n  ${chalk.dim('─'.repeat(40))}`),
  dim: (msg: string) => console.log(`  ${chalk.dim(msg)}`),
  blank: () => console.log(),
}
```

- [ ] **Step 2: Create hash utility**

```typescript
// packages/core/src/utils/hash.ts
import { createHash } from 'node:crypto'

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}
```

- [ ] **Step 3: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { log } from './utils/logger.js'
export { sha256 } from './utils/hash.js'
```

- [ ] **Step 4: Build and verify**

```bash
npx turbo build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/utils/ packages/core/src/index.ts
git commit -m "feat(core): add logger and hash utilities"
```

---

## Task 3: Event Bus

**Files:**
- Create: `packages/core/src/events/bus.ts`
- Create: `packages/core/tests/events/bus.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/events/bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../src/events/bus.js'

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('document:indexed', handler)
    bus.emit('document:indexed', { documentId: 'doc-1', chunks: 5 })

    expect(handler).toHaveBeenCalledWith({ documentId: 'doc-1', chunks: 5 })
  })

  it('supports wildcard listeners', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.onAny(handler)
    bus.emit('document:indexed', { documentId: 'doc-1' })
    bus.emit('query:received', { query: 'test' })

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith('document:indexed', { documentId: 'doc-1' })
    expect(handler).toHaveBeenCalledWith('query:received', { query: 'test' })
  })

  it('removes listeners with off()', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('document:indexed', handler)
    bus.off('document:indexed', handler)
    bus.emit('document:indexed', { documentId: 'doc-1' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports once() for single-fire listeners', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.once('server:started', handler)
    bus.emit('server:started', { port: 3000 })
    bus.emit('server:started', { port: 3000 })

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/events/bus.test.ts
```

Expected: FAIL -- cannot resolve `../../src/events/bus.js`

- [ ] **Step 3: Implement EventBus**

```typescript
// packages/core/src/events/bus.ts
import EventEmitter from 'eventemitter3'

type EventHandler = (...args: any[]) => void
type WildcardHandler = (event: string, ...args: any[]) => void

export class EventBus {
  private emitter = new EventEmitter()
  private wildcardListeners = new Set<WildcardHandler>()

  on(event: string, handler: EventHandler): void {
    this.emitter.on(event, handler)
  }

  off(event: string, handler: EventHandler): void {
    this.emitter.off(event, handler)
  }

  once(event: string, handler: EventHandler): void {
    this.emitter.once(event, handler)
  }

  emit(event: string, ...args: any[]): void {
    this.emitter.emit(event, ...args)
    for (const handler of this.wildcardListeners) {
      handler(event, ...args)
    }
  }

  onAny(handler: WildcardHandler): void {
    this.wildcardListeners.add(handler)
  }

  offAny(handler: WildcardHandler): void {
    this.wildcardListeners.delete(handler)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
    this.wildcardListeners.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/events/bus.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { EventBus } from './events/bus.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/events/ packages/core/tests/events/ packages/core/src/index.ts
git commit -m "feat(core): add typed event bus with wildcard support"
```

---

## Task 4: Plugin Interfaces

**Files:**
- Create: `packages/core/src/plugin/interfaces.ts`

No tests -- these are pure type definitions.

- [ ] **Step 1: Define all plugin interfaces**

```typescript
// packages/core/src/plugin/interfaces.ts

// --- Plugin Types ---

export type PluginType = 'connector' | 'parser' | 'model' | 'middleware'

export type PipelineStage =
  | 'before:discover' | 'after:discover'
  | 'before:parse' | 'after:parse'
  | 'before:chunk' | 'after:chunk'
  | 'before:retrieve' | 'after:retrieve'
  | 'before:rerank' | 'after:rerank'
  | 'before:generate' | 'after:generate'
  | 'before:query' | 'after:query'

// --- Health & Metrics ---

export interface HealthStatus {
  healthy: boolean
  message?: string
  details?: Record<string, unknown>
}

export interface PluginMetrics {
  [key: string]: string | number | boolean
}

// --- Permissions ---

export interface PluginPermissions {
  network?: boolean | string[]
  filesystem?: boolean | string[]
  env?: string[]
  events?: string[]
}

// --- Plugin Context (passed to setup) ---

export interface PluginContext {
  config: Record<string, unknown>
  dataDir: string
  log: {
    ok: (msg: string) => void
    fail: (msg: string) => void
    info: (msg: string) => void
    wait: (msg: string) => void
  }
}

// --- Base Plugin ---

export interface OpenDocumentsPlugin {
  name: string
  type: PluginType
  version: string
  coreVersion: string
  dependencies?: string[]
  conflicts?: string[]
  configSchema?: Record<string, unknown>  // JSON Schema
  permissions?: PluginPermissions

  setup(ctx: PluginContext): Promise<void>
  teardown?(): Promise<void>
  healthCheck?(): Promise<HealthStatus>
  metrics?(): Promise<PluginMetrics>

  migrations?: {
    from: string
    migrate: (oldConfig: Record<string, unknown>) => Record<string, unknown>
  }[]
}

// --- Connector Plugin ---

export interface DiscoveredDocument {
  sourceId: string
  title: string
  sourcePath: string
  contentHash?: string
  metadata?: Record<string, unknown>
}

export interface DocumentRef {
  sourceId: string
  sourcePath: string
}

export interface RawDocument {
  sourceId: string
  title: string
  content: Buffer | string
  mimeType?: string
  metadata?: Record<string, unknown>
}

export interface ChangeEvent {
  type: 'created' | 'updated' | 'deleted'
  document: DiscoveredDocument
}

export interface Disposable {
  dispose(): Promise<void>
}

export interface AuthResult {
  success: boolean
  message?: string
}

export interface ConnectorPlugin extends OpenDocumentsPlugin {
  type: 'connector'
  discover(): AsyncIterable<DiscoveredDocument>
  fetch(docRef: DocumentRef): Promise<RawDocument>
  watch?(onChange: (event: ChangeEvent) => void): Promise<Disposable>
  auth?(): Promise<AuthResult>
}

// --- Parser Plugin ---

export interface ParsedChunk {
  content: string
  chunkType: 'semantic' | 'code-ast' | 'table' | 'api-endpoint' | 'slide' | 'multimedia'
  language?: string
  headingHierarchy?: string[]
  codeSymbols?: string[]
  codeImports?: string[]
  page?: number
  timestamp?: string
  metadata?: Record<string, unknown>
}

export interface ParserPlugin extends OpenDocumentsPlugin {
  type: 'parser'
  supportedTypes: string[]
  multimodal?: boolean
  parse(raw: RawDocument): AsyncIterable<ParsedChunk>
}

// --- Model Plugin ---

export interface GenerateOpts {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  stop?: string[]
}

export interface EmbeddingResult {
  dense: number[][]
  sparse?: { indices: number[]; values: number[] }[]
}

export interface RerankResult {
  scores: number[]
  indices: number[]
}

export interface ModelPlugin extends OpenDocumentsPlugin {
  type: 'model'
  capabilities: {
    llm?: boolean
    embedding?: boolean
    reranker?: boolean
    vision?: boolean
  }
  generate?(prompt: string, opts?: GenerateOpts): AsyncIterable<string>
  embed?(texts: string[]): Promise<EmbeddingResult>
  rerank?(query: string, docs: string[]): Promise<RerankResult>
  describeImage?(image: Buffer): Promise<string>
}

// --- Middleware Plugin ---

export interface MiddlewarePlugin extends OpenDocumentsPlugin {
  type: 'middleware'
  hooks: {
    stage: PipelineStage
    handler: (data: unknown) => Promise<unknown>
  }[]
}

// --- Union type ---

export type AnyPlugin = ConnectorPlugin | ParserPlugin | ModelPlugin | MiddlewarePlugin
```

- [ ] **Step 2: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export type {
  PluginType,
  PipelineStage,
  HealthStatus,
  PluginMetrics,
  PluginPermissions,
  PluginContext,
  OpenDocumentsPlugin,
  ConnectorPlugin,
  ParserPlugin,
  ModelPlugin,
  MiddlewarePlugin,
  AnyPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  ChangeEvent,
  Disposable,
  AuthResult,
  ParsedChunk,
  GenerateOpts,
  EmbeddingResult,
  RerankResult,
} from './plugin/interfaces.js'
```

- [ ] **Step 3: Build and typecheck**

```bash
npx turbo build && npx turbo typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/plugin/interfaces.ts packages/core/src/index.ts
git commit -m "feat(core): define all plugin type interfaces"
```

---

## Task 5: Plugin Registry

**Files:**
- Create: `packages/core/src/plugin/registry.ts`
- Create: `packages/core/tests/plugin/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/plugin/registry.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import type { ParserPlugin, ConnectorPlugin, PluginContext } from '../../src/plugin/interfaces.js'

function createMockParser(overrides: Partial<ParserPlugin> = {}): ParserPlugin {
  return {
    name: '@opendocuments/parser-test',
    type: 'parser',
    version: '1.0.0',
    coreVersion: '^0.1.0',
    supportedTypes: ['.test'],
    setup: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    parse: vi.fn(),
    ...overrides,
  }
}

function createMockConnector(overrides: Partial<ConnectorPlugin> = {}): ConnectorPlugin {
  return {
    name: '@opendocuments/plugin-test',
    type: 'connector',
    version: '1.0.0',
    coreVersion: '^0.1.0',
    setup: vi.fn().mockResolvedValue(undefined),
    discover: vi.fn(),
    fetch: vi.fn(),
    ...overrides,
  }
}

describe('PluginRegistry', () => {
  it('registers and retrieves a plugin by name', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()

    await registry.register(parser, { config: {}, dataDir: '/tmp', log: console as any })

    expect(registry.get('@opendocuments/parser-test')).toBe(parser)
    expect(parser.setup).toHaveBeenCalled()
  })

  it('lists plugins by type', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const connector = createMockConnector()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await registry.register(parser, ctx)
    await registry.register(connector, ctx)

    expect(registry.getByType('parser')).toEqual([parser])
    expect(registry.getByType('connector')).toEqual([connector])
  })

  it('rejects duplicate plugin names', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await registry.register(parser, ctx)

    await expect(registry.register(parser, ctx)).rejects.toThrow(
      'Plugin @opendocuments/parser-test is already registered'
    )
  })

  it('unregisters a plugin and calls teardown', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await registry.register(parser, ctx)
    await registry.unregister('@opendocuments/parser-test')

    expect(registry.get('@opendocuments/parser-test')).toBeUndefined()
    expect(parser.teardown).toHaveBeenCalled()
  })

  it('finds parsers by file extension', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser({ supportedTypes: ['.md', '.mdx'] })
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await registry.register(parser, ctx)

    expect(registry.findParserForType('.md')).toBe(parser)
    expect(registry.findParserForType('.pdf')).toBeUndefined()
  })

  it('returns all registered plugin names', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const connector = createMockConnector()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await registry.register(parser, ctx)
    await registry.register(connector, ctx)

    expect(registry.listAll()).toEqual([
      { name: '@opendocuments/parser-test', type: 'parser', version: '1.0.0' },
      { name: '@opendocuments/plugin-test', type: 'connector', version: '1.0.0' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/plugin/registry.test.ts
```

Expected: FAIL -- cannot resolve `../../src/plugin/registry.js`

- [ ] **Step 3: Implement PluginRegistry**

```typescript
// packages/core/src/plugin/registry.ts
import type {
  AnyPlugin,
  PluginType,
  PluginContext,
  ParserPlugin,
  ConnectorPlugin,
  ModelPlugin,
  MiddlewarePlugin,
} from './interfaces.js'

export class PluginRegistry {
  private plugins = new Map<string, AnyPlugin>()

  async register(plugin: AnyPlugin, ctx: PluginContext): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`)
    }

    await plugin.setup(ctx)
    this.plugins.set(plugin.name, plugin)
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) return

    if (plugin.teardown) {
      await plugin.teardown()
    }
    this.plugins.delete(name)
  }

  get(name: string): AnyPlugin | undefined {
    return this.plugins.get(name)
  }

  getByType<T extends PluginType>(type: T): AnyPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.type === type)
  }

  findParserForType(extension: string): ParserPlugin | undefined {
    const parsers = this.getByType('parser') as ParserPlugin[]
    return parsers.find(p => p.supportedTypes.includes(extension))
  }

  getConnectors(): ConnectorPlugin[] {
    return this.getByType('connector') as ConnectorPlugin[]
  }

  getModels(): ModelPlugin[] {
    return this.getByType('model') as ModelPlugin[]
  }

  getMiddleware(): MiddlewarePlugin[] {
    return this.getByType('middleware') as MiddlewarePlugin[]
  }

  listAll(): { name: string; type: PluginType; version: string }[] {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      type: p.type,
      version: p.version,
    }))
  }

  async teardownAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        await plugin.teardown()
      }
    }
    this.plugins.clear()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/plugin/registry.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { PluginRegistry } from './plugin/registry.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plugin/registry.ts packages/core/tests/plugin/registry.test.ts packages/core/src/index.ts
git commit -m "feat(core): add plugin registry with type-safe lookup"
```

---

## Task 6: Plugin Capability Checking

**Files:**
- Create: `packages/core/src/plugin/capability.ts`
- Create: `packages/core/tests/plugin/capability.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/plugin/capability.test.ts
import { describe, it, expect } from 'vitest'
import { checkCompatibility } from '../../src/plugin/capability.js'
import type { AnyPlugin } from '../../src/plugin/interfaces.js'

function fakePlugin(overrides: Partial<AnyPlugin>): AnyPlugin {
  return {
    name: 'test-plugin',
    type: 'parser',
    version: '1.0.0',
    coreVersion: '^0.1.0',
    supportedTypes: [],
    setup: async () => {},
    parse: async function* () {},
    ...overrides,
  } as AnyPlugin
}

describe('checkCompatibility', () => {
  it('passes when core version satisfies plugin requirement', () => {
    const result = checkCompatibility(
      fakePlugin({ coreVersion: '^0.1.0' }),
      '0.1.0',
      []
    )
    expect(result.compatible).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when core version does not satisfy', () => {
    const result = checkCompatibility(
      fakePlugin({ coreVersion: '^2.0.0' }),
      '0.1.0',
      []
    )
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('core version')
  })

  it('fails when a dependency is missing', () => {
    const result = checkCompatibility(
      fakePlugin({ dependencies: ['@opendocuments/parser-pdf'] }),
      '0.1.0',
      ['@opendocuments/parser-docx']
    )
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('@opendocuments/parser-pdf')
  })

  it('passes when all dependencies are present', () => {
    const result = checkCompatibility(
      fakePlugin({ dependencies: ['@opendocuments/parser-pdf'] }),
      '0.1.0',
      ['@opendocuments/parser-pdf']
    )
    expect(result.compatible).toBe(true)
  })

  it('fails when a conflicting plugin is installed', () => {
    const result = checkCompatibility(
      fakePlugin({ conflicts: ['old-parser'] }),
      '0.1.0',
      ['old-parser']
    )
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('old-parser')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/plugin/capability.test.ts
```

Expected: FAIL -- cannot resolve `../../src/plugin/capability.js`

- [ ] **Step 3: Implement checkCompatibility**

```typescript
// packages/core/src/plugin/capability.ts
import type { AnyPlugin } from './interfaces.js'

export interface CompatibilityResult {
  compatible: boolean
  errors: string[]
  warnings: string[]
}

export function checkCompatibility(
  plugin: AnyPlugin,
  coreVersion: string,
  installedPluginNames: string[]
): CompatibilityResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check core version compatibility (simple semver major.minor check)
  if (!satisfiesVersion(coreVersion, plugin.coreVersion)) {
    errors.push(
      `Requires core version ${plugin.coreVersion}, but current is ${coreVersion}`
    )
  }

  // Check dependencies
  if (plugin.dependencies) {
    for (const dep of plugin.dependencies) {
      if (!installedPluginNames.includes(dep)) {
        errors.push(`Missing required dependency: ${dep}`)
      }
    }
  }

  // Check conflicts
  if (plugin.conflicts) {
    for (const conflict of plugin.conflicts) {
      if (installedPluginNames.includes(conflict)) {
        errors.push(`Conflicts with installed plugin: ${conflict}`)
      }
    }
  }

  return {
    compatible: errors.length === 0,
    errors,
    warnings,
  }
}

function satisfiesVersion(current: string, requirement: string): boolean {
  // Parse requirement: ^X.Y.Z or >=X.Y.Z or X.Y.Z
  const req = requirement.replace(/^[\^~>=<]+/, '')
  const [reqMajor, reqMinor] = req.split('.').map(Number)
  const [curMajor, curMinor, curPatch] = current.split('.').map(Number)

  if (requirement.startsWith('^')) {
    // ^X.Y.Z: compatible with X.Y.Z, allows minor/patch upgrades
    if (reqMajor === 0) {
      // ^0.Y.Z: only allow patch upgrades
      return curMajor === reqMajor && curMinor === reqMinor && curPatch >= (Number(req.split('.')[2]) || 0)
    }
    return curMajor === reqMajor && (curMinor > reqMinor || (curMinor === reqMinor && curPatch >= (Number(req.split('.')[2]) || 0)))
  }

  // Exact match fallback
  return current === req
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/plugin/capability.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { checkCompatibility, type CompatibilityResult } from './plugin/capability.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plugin/capability.ts packages/core/tests/plugin/capability.test.ts packages/core/src/index.ts
git commit -m "feat(core): add plugin capability and dependency checking"
```

---

## Task 7: Config Schema + Loader

**Files:**
- Create: `packages/core/src/config/schema.ts`
- Create: `packages/core/src/config/defaults.ts`
- Create: `packages/core/src/config/loader.ts`
- Create: `packages/core/tests/config/loader.test.ts`

- [ ] **Step 1: Create config schema with Zod**

```typescript
// packages/core/src/config/schema.ts
import { z } from 'zod'

export const ragProfileSchema = z.enum(['fast', 'balanced', 'precise', 'custom'])

export const securitySchema = z.object({
  dataPolicy: z.object({
    allowCloudProcessing: z.boolean().default(true),
    autoRedact: z.object({
      enabled: z.boolean().default(false),
      patterns: z.array(z.union([z.string(), z.instanceof(RegExp)])).default([]),
      method: z.enum(['replace', 'hash', 'remove']).default('replace'),
      replacement: z.string().default('[REDACTED]'),
    }).default({}),
    sourceRestrictions: z.object({
      localOnly: z.array(z.string()).default([]),
      cloudAllowed: z.array(z.string()).default([]),
    }).default({}),
    workspaceOverrides: z.record(z.object({
      allowCloudProcessing: z.boolean().optional(),
    })).default({}),
  }).default({}),
  transport: z.object({
    enforceHTTPS: z.boolean().default(true),
    proxy: z.string().optional(),
    allowedEndpoints: z.array(z.string()).default([]),
  }).default({}),
  storage: z.object({
    encryptAtRest: z.boolean().default(false),
    encryptionKey: z.string().optional(),
    redactLogsContent: z.boolean().default(true),
  }).default({}),
  audit: z.object({
    enabled: z.boolean().default(false),
    events: z.array(z.string()).default([]),
    destination: z.enum(['local', 'syslog', 'webhook']).default('local'),
  }).default({}),
}).default({})

export const configSchema = z.object({
  workspace: z.string().default('default'),
  mode: z.enum(['personal', 'team']).default('personal'),

  model: z.object({
    provider: z.string().default('ollama'),
    llm: z.string().default('qwen2.5:14b'),
    embedding: z.string().default('bge-m3'),
  }).default({}),

  rag: z.object({
    profile: ragProfileSchema.default('balanced'),
    custom: z.object({
      retrieval: z.object({
        k: z.number().default(20),
        minScore: z.number().default(0.3),
        finalTopK: z.number().default(5),
      }).default({}),
      context: z.object({
        maxTokens: z.number().default(4096),
        historyMaxTokens: z.number().default(1024),
      }).default({}),
    }).optional(),
  }).default({}),

  connectors: z.array(z.object({
    type: z.string(),
    path: z.string().optional(),
    repo: z.string().optional(),
    watch: z.boolean().default(false),
  }).passthrough()).default([]),

  plugins: z.array(z.string()).default([]),

  parserFallbacks: z.record(z.array(z.string())).default({}),

  security: securitySchema,

  ui: z.object({
    locale: z.string().default('auto'),
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  }).default({}),

  telemetry: z.object({
    enabled: z.boolean().default(false),
  }).default({}),

  storage: z.object({
    db: z.enum(['sqlite', 'postgres']).default('sqlite'),
    dbUrl: z.string().optional(),
    vectorDb: z.enum(['chroma', 'qdrant']).default('chroma'),
    vectorDbUrl: z.string().optional(),
    dataDir: z.string().default('~/.opendocuments'),
  }).default({}),
})

export type OpenDocumentsConfig = z.infer<typeof configSchema>
```

- [ ] **Step 2: Create defaults**

```typescript
// packages/core/src/config/defaults.ts
import type { OpenDocumentsConfig } from './schema.js'

export const DEFAULT_CONFIG: OpenDocumentsConfig = {
  workspace: 'default',
  mode: 'personal',
  model: {
    provider: 'ollama',
    llm: 'qwen2.5:14b',
    embedding: 'bge-m3',
  },
  rag: {
    profile: 'balanced',
  },
  connectors: [],
  plugins: [],
  parserFallbacks: {},
  security: {
    dataPolicy: {
      allowCloudProcessing: true,
      autoRedact: { enabled: false, patterns: [], method: 'replace', replacement: '[REDACTED]' },
      sourceRestrictions: { localOnly: [], cloudAllowed: [] },
      workspaceOverrides: {},
    },
    transport: { enforceHTTPS: true, allowedEndpoints: [] },
    storage: { encryptAtRest: false, redactLogsContent: true },
    audit: { enabled: false, events: [], destination: 'local' },
  },
  ui: { locale: 'auto', theme: 'auto' },
  telemetry: { enabled: false },
  storage: { db: 'sqlite', vectorDb: 'chroma', dataDir: '~/.opendocuments' },
}
```

- [ ] **Step 3: Write the failing test for loader**

```typescript
// packages/core/tests/config/loader.test.ts
import { describe, it, expect } from 'vitest'
import { loadConfig, validateConfig } from '../../src/config/loader.js'
import { DEFAULT_CONFIG } from '../../src/config/defaults.js'

describe('validateConfig', () => {
  it('returns defaults for empty object', () => {
    const config = validateConfig({})
    expect(config.workspace).toBe('default')
    expect(config.mode).toBe('personal')
    expect(config.rag.profile).toBe('balanced')
    expect(config.storage.db).toBe('sqlite')
  })

  it('merges user overrides with defaults', () => {
    const config = validateConfig({
      workspace: 'my-team',
      mode: 'team',
      rag: { profile: 'precise' },
    })
    expect(config.workspace).toBe('my-team')
    expect(config.mode).toBe('team')
    expect(config.rag.profile).toBe('precise')
    expect(config.model.provider).toBe('ollama')  // default preserved
  })

  it('throws on invalid mode', () => {
    expect(() => validateConfig({ mode: 'invalid' })).toThrow()
  })

  it('throws on invalid rag profile', () => {
    expect(() => validateConfig({ rag: { profile: 'turbo' } })).toThrow()
  })
})

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path')
    expect(config).toEqual(DEFAULT_CONFIG)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/config/loader.test.ts
```

Expected: FAIL -- cannot resolve `../../src/config/loader.js`

- [ ] **Step 5: Implement config loader**

```typescript
// packages/core/src/config/loader.ts
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { configSchema, type OpenDocumentsConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

export function validateConfig(raw: unknown): OpenDocumentsConfig {
  return configSchema.parse(raw)
}

export function loadConfig(projectDir: string): OpenDocumentsConfig {
  const configPath = resolve(projectDir, 'opendocuments.config.ts')

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }

  // For now, return defaults. Dynamic TS config loading will be added
  // when the CLI package implements `opendocuments start` (Plan 3).
  // At that point, we'll use jiti or tsx to load the TS config at runtime.
  return DEFAULT_CONFIG
}

export function defineConfig(config: Partial<OpenDocumentsConfig>): OpenDocumentsConfig {
  return validateConfig(config)
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/config/loader.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { configSchema, type OpenDocumentsConfig } from './config/schema.js'
export { loadConfig, validateConfig, defineConfig } from './config/loader.js'
export { DEFAULT_CONFIG } from './config/defaults.js'
```

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/config/ packages/core/tests/config/ packages/core/src/index.ts
git commit -m "feat(core): add Zod config schema, loader, and defineConfig helper"
```

---

## Task 8: Storage Layer -- SQLite

**Files:**
- Create: `packages/core/src/storage/db.ts`
- Create: `packages/core/src/storage/sqlite.ts`
- Create: `packages/core/src/storage/migrations/runner.ts`
- Create: `packages/core/src/storage/migrations/001_initial.sql`
- Create: `packages/core/tests/storage/sqlite.test.ts`
- Create: `packages/core/tests/storage/migrations.test.ts`

- [ ] **Step 1: Define DB interface**

```typescript
// packages/core/src/storage/db.ts

export interface Row {
  [key: string]: unknown
}

export interface DB {
  run(sql: string, params?: unknown[]): void
  get<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined
  all<T extends Row = Row>(sql: string, params?: unknown[]): T[]
  exec(sql: string): void
  close(): void
  transaction<T>(fn: () => T): T
}

export type DBFactory = (path: string) => DB
```

- [ ] **Step 2: Implement SQLite adapter**

```typescript
// packages/core/src/storage/sqlite.ts
import Database from 'better-sqlite3'
import type { DB, Row } from './db.js'

export function createSQLiteDB(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return {
    run(sql: string, params: unknown[] = []): void {
      db.prepare(sql).run(...params)
    },

    get<T extends Row = Row>(sql: string, params: unknown[] = []): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined
    },

    all<T extends Row = Row>(sql: string, params: unknown[] = []): T[] {
      return db.prepare(sql).all(...params) as T[]
    },

    exec(sql: string): void {
      db.exec(sql)
    },

    close(): void {
      db.close()
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)()
    },
  }
}
```

- [ ] **Step 3: Create migration runner**

```typescript
// packages/core/src/storage/migrations/runner.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DB } from '../db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function runMigrations(db: DB): { applied: string[] } {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // Find SQL migration files
  const migrationDir = __dirname
  const files = readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied: string[] = []

  for (const file of files) {
    const already = db.get<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [file]
    )

    if (already) continue

    const sql = readFileSync(join(migrationDir, file), 'utf-8')

    db.transaction(() => {
      db.exec(sql)
      db.run('INSERT INTO schema_migrations (name) VALUES (?)', [file])
    })

    applied.push(file)
  }

  return { applied }
}
```

- [ ] **Step 4: Create initial migration SQL**

```sql
-- packages/core/src/storage/migrations/001_initial.sql

-- Workspaces
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    mode TEXT DEFAULT 'personal',
    settings TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Workspace members (team mode)
CREATE TABLE workspace_members (
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    api_key TEXT UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, user_id)
);

-- Connectors
CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    sync_interval_seconds INTEGER DEFAULT 300,
    last_synced_at TEXT,
    status TEXT DEFAULT 'active',
    error_message TEXT,
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Documents
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id TEXT REFERENCES connectors(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes INTEGER,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    content_hash TEXT,
    parser_used TEXT,
    parse_duration_ms INTEGER,
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    indexed_at TEXT
);

-- Tags
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    UNIQUE(workspace_id, name)
);

CREATE TABLE document_tags (
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

-- Conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT,
    title TEXT,
    shared INTEGER DEFAULT 0,
    share_token TEXT UNIQUE,
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources TEXT,
    profile_used TEXT,
    confidence_score REAL,
    response_time_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Query logs
CREATE TABLE query_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    intent TEXT,
    profile TEXT,
    retrieved_chunk_ids TEXT,
    reranked_chunk_ids TEXT,
    retrieval_score_avg REAL,
    rerank_score_avg REAL,
    confidence_score REAL,
    response_time_ms INTEGER,
    web_search_used INTEGER DEFAULT 0,
    feedback TEXT,
    route TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Audit logs
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Plugins
CREATE TABLE plugins (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    version TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    permissions TEXT DEFAULT '{}',
    status TEXT DEFAULT 'active',
    installed_at TEXT DEFAULT (datetime('now'))
);

-- Schema migrations tracking (created by runner, but included for completeness)
-- CREATE TABLE schema_migrations is handled by the runner itself

-- Indexes
CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_documents_deleted ON documents(deleted_at);
CREATE INDEX idx_connectors_workspace ON connectors(workspace_id);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_query_logs_workspace ON query_logs(workspace_id, created_at);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type, created_at);
```

- [ ] **Step 5: Write failing tests for SQLite + migrations**

```typescript
// packages/core/tests/storage/sqlite.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import type { DB } from '../../src/storage/db.js'

describe('SQLite DB', () => {
  let db: DB

  afterEach(() => {
    db?.close()
  })

  it('creates an in-memory database', () => {
    db = createSQLiteDB(':memory:')
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    db.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'hello'])

    const row = db.get<{ id: number; name: string }>('SELECT * FROM test WHERE id = ?', [1])
    expect(row).toEqual({ id: 1, name: 'hello' })
  })

  it('returns all rows', () => {
    db = createSQLiteDB(':memory:')
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
    db.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'a'])
    db.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'b'])

    const rows = db.all<{ id: number; name: string }>('SELECT * FROM test ORDER BY id')
    expect(rows).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
  })

  it('supports transactions', () => {
    db = createSQLiteDB(':memory:')
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')

    db.transaction(() => {
      db.run('INSERT INTO test (id, name) VALUES (?, ?)', [1, 'a'])
      db.run('INSERT INTO test (id, name) VALUES (?, ?)', [2, 'b'])
    })

    const rows = db.all('SELECT * FROM test')
    expect(rows).toHaveLength(2)
  })
})
```

```typescript
// packages/core/tests/storage/migrations.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('Migration Runner', () => {
  let db: DB

  afterEach(() => {
    db?.close()
  })

  it('applies initial migration and creates tables', () => {
    db = createSQLiteDB(':memory:')
    const result = runMigrations(db)

    expect(result.applied).toContain('001_initial.sql')

    // Verify key tables exist
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    const tableNames = tables.map(t => t.name)

    expect(tableNames).toContain('workspaces')
    expect(tableNames).toContain('documents')
    expect(tableNames).toContain('connectors')
    expect(tableNames).toContain('conversations')
    expect(tableNames).toContain('messages')
    expect(tableNames).toContain('query_logs')
    expect(tableNames).toContain('audit_logs')
    expect(tableNames).toContain('plugins')
    expect(tableNames).toContain('schema_migrations')
  })

  it('does not re-apply already applied migrations', () => {
    db = createSQLiteDB(':memory:')

    const first = runMigrations(db)
    expect(first.applied.length).toBeGreaterThan(0)

    const second = runMigrations(db)
    expect(second.applied).toEqual([])
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd packages/core && npx vitest run tests/storage/
```

Expected: FAIL -- cannot resolve source files.

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd packages/core && npx vitest run tests/storage/
```

Expected: 5 tests PASS.

- [ ] **Step 8: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export type { DB, Row, DBFactory } from './storage/db.js'
export { createSQLiteDB } from './storage/sqlite.js'
export { runMigrations } from './storage/migrations/runner.js'
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/storage/ packages/core/tests/storage/ packages/core/src/index.ts
git commit -m "feat(core): add SQLite storage layer with migration runner"
```

---

## Task 9: Storage Layer -- ChromaDB

**Files:**
- Create: `packages/core/src/storage/vector-db.ts`
- Create: `packages/core/src/storage/chroma.ts`
- Create: `packages/core/tests/storage/chroma.test.ts`

- [ ] **Step 1: Define VectorDB interface**

```typescript
// packages/core/src/storage/vector-db.ts

export interface VectorDocument {
  id: string
  content: string
  embedding: number[]
  metadata: Record<string, string | number | boolean>
}

export interface VectorSearchResult {
  id: string
  content: string
  score: number
  metadata: Record<string, string | number | boolean>
}

export interface VectorSearchOpts {
  embedding: number[]
  topK: number
  filter?: Record<string, string | number | boolean>
  minScore?: number
}

export interface VectorDB {
  ensureCollection(name: string, dimensions: number): Promise<void>
  upsert(collection: string, documents: VectorDocument[]): Promise<void>
  search(collection: string, opts: VectorSearchOpts): Promise<VectorSearchResult[]>
  delete(collection: string, ids: string[]): Promise<void>
  count(collection: string): Promise<number>
  close(): Promise<void>
}
```

- [ ] **Step 2: Implement ChromaDB adapter**

```typescript
// packages/core/src/storage/chroma.ts
import { ChromaClient } from 'chromadb'
import type { VectorDB, VectorDocument, VectorSearchOpts, VectorSearchResult } from './vector-db.js'

export function createChromaDB(url?: string): VectorDB {
  const client = new ChromaClient(url ? { path: url } : undefined)
  const collections = new Map<string, Awaited<ReturnType<ChromaClient['getOrCreateCollection']>>>()

  async function getCollection(name: string) {
    let col = collections.get(name)
    if (!col) {
      col = await client.getOrCreateCollection({ name })
      collections.set(name, col)
    }
    return col
  }

  return {
    async ensureCollection(name: string, _dimensions: number): Promise<void> {
      await getCollection(name)
    },

    async upsert(collectionName: string, documents: VectorDocument[]): Promise<void> {
      const col = await getCollection(collectionName)
      await col.upsert({
        ids: documents.map(d => d.id),
        documents: documents.map(d => d.content),
        embeddings: documents.map(d => d.embedding),
        metadatas: documents.map(d => d.metadata),
      })
    },

    async search(collectionName: string, opts: VectorSearchOpts): Promise<VectorSearchResult[]> {
      const col = await getCollection(collectionName)
      const results = await col.query({
        queryEmbeddings: [opts.embedding],
        nResults: opts.topK,
        where: opts.filter as any,
      })

      if (!results.ids[0]) return []

      return results.ids[0].map((id, i) => ({
        id,
        content: results.documents[0]?.[i] ?? '',
        score: results.distances?.[0]?.[i] != null ? 1 - results.distances[0][i] : 0,
        metadata: (results.metadatas?.[0]?.[i] ?? {}) as Record<string, string | number | boolean>,
      })).filter(r => !opts.minScore || r.score >= opts.minScore)
    },

    async delete(collectionName: string, ids: string[]): Promise<void> {
      const col = await getCollection(collectionName)
      await col.delete({ ids })
    },

    async count(collectionName: string): Promise<number> {
      const col = await getCollection(collectionName)
      return await col.count()
    },

    async close(): Promise<void> {
      collections.clear()
    },
  }
}
```

- [ ] **Step 3: Write test (integration-style, uses in-memory Chroma)**

```typescript
// packages/core/tests/storage/chroma.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createChromaDB } from '../../src/storage/chroma.js'
import type { VectorDB } from '../../src/storage/vector-db.js'

describe('ChromaDB VectorDB', () => {
  let vectorDb: VectorDB
  const COLLECTION = 'test_chunks'

  beforeEach(async () => {
    vectorDb = createChromaDB()
    await vectorDb.ensureCollection(COLLECTION, 3)
  })

  afterEach(async () => {
    await vectorDb.close()
  })

  it('upserts and counts documents', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello world', embedding: [1, 0, 0], metadata: { source: 'test' } },
      { id: 'chunk-2', content: 'foo bar', embedding: [0, 1, 0], metadata: { source: 'test' } },
    ])

    const count = await vectorDb.count(COLLECTION)
    expect(count).toBe(2)
  })

  it('searches by embedding similarity', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello world', embedding: [1, 0, 0], metadata: { source: 'a' } },
      { id: 'chunk-2', content: 'foo bar', embedding: [0, 1, 0], metadata: { source: 'b' } },
    ])

    const results = await vectorDb.search(COLLECTION, {
      embedding: [1, 0, 0],
      topK: 1,
    })

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('chunk-1')
  })

  it('deletes documents', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello', embedding: [1, 0, 0], metadata: { source: 'test' } },
    ])

    await vectorDb.delete(COLLECTION, ['chunk-1'])

    const count = await vectorDb.count(COLLECTION)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd packages/core && npx vitest run tests/storage/chroma.test.ts
```

Expected: 3 tests PASS. (ChromaDB runs in-memory by default when no server URL is given.)

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export type { VectorDB, VectorDocument, VectorSearchResult, VectorSearchOpts } from './storage/vector-db.js'
export { createChromaDB } from './storage/chroma.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/storage/vector-db.ts packages/core/src/storage/chroma.ts packages/core/tests/storage/chroma.test.ts packages/core/src/index.ts
git commit -m "feat(core): add ChromaDB vector storage with abstract VectorDB interface"
```

---

## Task 10: Workspace Manager

**Files:**
- Create: `packages/core/src/workspace/manager.ts`
- Create: `packages/core/tests/workspace/manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/workspace/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WorkspaceManager } from '../../src/workspace/manager.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('WorkspaceManager', () => {
  let db: DB
  let manager: WorkspaceManager

  beforeEach(() => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    manager = new WorkspaceManager(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates a workspace', () => {
    const ws = manager.create('engineering', 'team')

    expect(ws.name).toBe('engineering')
    expect(ws.mode).toBe('team')
    expect(ws.id).toBeDefined()
  })

  it('rejects duplicate workspace names', () => {
    manager.create('engineering', 'personal')

    expect(() => manager.create('engineering', 'personal')).toThrow('already exists')
  })

  it('lists all workspaces', () => {
    manager.create('eng', 'team')
    manager.create('hr', 'team')

    const list = manager.list()
    expect(list).toHaveLength(2)
    expect(list.map(w => w.name)).toEqual(['eng', 'hr'])
  })

  it('gets a workspace by name', () => {
    manager.create('eng', 'personal')

    const ws = manager.getByName('eng')
    expect(ws).toBeDefined()
    expect(ws!.name).toBe('eng')
  })

  it('returns undefined for nonexistent workspace', () => {
    expect(manager.getByName('nope')).toBeUndefined()
  })

  it('deletes a workspace', () => {
    const ws = manager.create('temp', 'personal')
    manager.delete(ws.id)

    expect(manager.getByName('temp')).toBeUndefined()
  })

  it('ensures default workspace exists', () => {
    manager.ensureDefault()

    const ws = manager.getByName('default')
    expect(ws).toBeDefined()
    expect(ws!.mode).toBe('personal')
  })

  it('does not duplicate default workspace', () => {
    manager.ensureDefault()
    manager.ensureDefault()

    const list = manager.list()
    expect(list.filter(w => w.name === 'default')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/workspace/manager.test.ts
```

Expected: FAIL -- cannot resolve source.

- [ ] **Step 3: Implement WorkspaceManager**

```typescript
// packages/core/src/workspace/manager.ts
import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface Workspace {
  id: string
  name: string
  mode: 'personal' | 'team'
  settings: Record<string, unknown>
  createdAt: string
}

export class WorkspaceManager {
  constructor(private db: DB) {}

  create(name: string, mode: 'personal' | 'team' = 'personal'): Workspace {
    const existing = this.getByName(name)
    if (existing) {
      throw new Error(`Workspace "${name}" already exists`)
    }

    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.run(
      'INSERT INTO workspaces (id, name, mode, settings, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, mode, '{}', now]
    )

    return { id, name, mode, settings: {}, createdAt: now }
  }

  getByName(name: string): Workspace | undefined {
    const row = this.db.get<{
      id: string
      name: string
      mode: string
      settings: string
      created_at: string
    }>('SELECT * FROM workspaces WHERE name = ?', [name])

    if (!row) return undefined

    return {
      id: row.id,
      name: row.name,
      mode: row.mode as 'personal' | 'team',
      settings: JSON.parse(row.settings),
      createdAt: row.created_at,
    }
  }

  getById(id: string): Workspace | undefined {
    const row = this.db.get<{
      id: string
      name: string
      mode: string
      settings: string
      created_at: string
    }>('SELECT * FROM workspaces WHERE id = ?', [id])

    if (!row) return undefined

    return {
      id: row.id,
      name: row.name,
      mode: row.mode as 'personal' | 'team',
      settings: JSON.parse(row.settings),
      createdAt: row.created_at,
    }
  }

  list(): Workspace[] {
    const rows = this.db.all<{
      id: string
      name: string
      mode: string
      settings: string
      created_at: string
    }>('SELECT * FROM workspaces ORDER BY name')

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      mode: row.mode as 'personal' | 'team',
      settings: JSON.parse(row.settings),
      createdAt: row.created_at,
    }))
  }

  delete(id: string): void {
    this.db.run('DELETE FROM workspaces WHERE id = ?', [id])
  }

  ensureDefault(): Workspace {
    const existing = this.getByName('default')
    if (existing) return existing
    return this.create('default', 'personal')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/workspace/manager.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { WorkspaceManager, type Workspace } from './workspace/manager.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/workspace/ packages/core/tests/workspace/ packages/core/src/index.ts
git commit -m "feat(core): add workspace manager with CRUD and default workspace"
```

---

## Task 11: CI Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - run: npm ci
      - run: npx turbo build
      - run: npx turbo typecheck
      - run: npx turbo test
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for build, typecheck, and test"
```

---

## Task 12: Final Integration Verification

- [ ] **Step 1: Run full test suite**

```bash
npx turbo test
```

Expected: All tests pass (SQLite: 5, ChromaDB: 3, EventBus: 4, Registry: 6, Capability: 5, Config: 4, Workspace: 8 = **35 tests total**).

- [ ] **Step 2: Run full build**

```bash
npx turbo build
```

Expected: `packages/core/dist/` contains all compiled JS + type declarations.

- [ ] **Step 3: Verify exports work**

```bash
cd packages/core && node -e "
import('./dist/index.js').then(m => {
  console.log('VERSION:', m.VERSION)
  console.log('Exports:', Object.keys(m).join(', '))
})
"
```

Expected: prints VERSION and all exported names.

- [ ] **Step 4: Commit any fixes, then tag**

```bash
git add -A
git commit -m "chore: integration verification pass"
```

---

## Summary

| Task | What it builds | Tests |
|------|---------------|-------|
| 1 | Monorepo bootstrap (Turborepo, TS, Changesets) | build verification |
| 2 | Logger + hash utilities | -- (simple wrappers) |
| 3 | Event Bus | 4 tests |
| 4 | Plugin interfaces (types only) | typecheck |
| 5 | Plugin Registry | 6 tests |
| 6 | Plugin Capability Checking | 5 tests |
| 7 | Config Schema + Loader | 4 tests |
| 8 | SQLite Storage + Migrations | 5 tests |
| 9 | ChromaDB Vector Storage | 3 tests |
| 10 | Workspace Manager | 8 tests |
| 11 | CI Pipeline | -- |
| 12 | Integration Verification | full suite |

**Total: 12 tasks, ~35 tests, all foundation infrastructure for Plans 2-4.**

After this plan is complete, Plan 2 (Ingest Pipeline + RAG Engine) can be written against the actual code structure.
