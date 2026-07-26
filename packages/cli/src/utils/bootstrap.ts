import { bootstrap, type AppContext } from 'opendocuments-server'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Module-level cache: single CLI invocation shares one context.
// This is intentional for CLI use. Tests should import from @opendocuments/server directly.
let cachedCtx: AppContext | null = null
const stateDir = join(homedir(), '.opendocuments')

export async function getContext(): Promise<AppContext> {
  if (cachedCtx) return cachedCtx
  const currentWorkspacePath = join(stateDir, 'current-workspace')
  const configuredWorkspace = existsSync(currentWorkspacePath)
    ? readFileSync(currentWorkspacePath, 'utf-8').trim()
    : undefined
  cachedCtx = await bootstrap({
    ...(configuredWorkspace ? { configOverrides: { workspace: configuredWorkspace } } : {}),
  })

  const authTokenPath = join(stateDir, 'auth-token')
  if (existsSync(authTokenPath)) {
    const token = readFileSync(authTokenPath, 'utf-8').trim()
    const validated = token ? cachedCtx.apiKeyManager.validate(token) : null
    if (validated) {
      const workspace = cachedCtx.workspaceManager.getById(validated.record.workspaceId)
      if (workspace) {
        const services = cachedCtx.forWorkspace(workspace.id)
        cachedCtx.config.workspace = workspace.name
        cachedCtx.store = services.store
        cachedCtx.pipeline = services.pipeline
        cachedCtx.ragEngine = services.ragEngine
        cachedCtx.conversationManager = services.conversationManager
        cachedCtx.connectorManager = services.connectorManager
      }
    }
  }
  return cachedCtx
}

export async function shutdownContext(): Promise<void> {
  if (cachedCtx) {
    await cachedCtx.shutdown()
    cachedCtx = null
  }
}
