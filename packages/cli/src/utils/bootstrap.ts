import { bootstrap, type AppContext } from '@opendocuments/server'

// Module-level cache: single CLI invocation shares one context.
// This is intentional for CLI use. Tests should import from @opendocuments/server directly.
let cachedCtx: AppContext | null = null

export async function getContext(): Promise<AppContext> {
  if (cachedCtx) return cachedCtx
  cachedCtx = await bootstrap()
  return cachedCtx
}

export async function shutdownContext(): Promise<void> {
  if (cachedCtx) {
    await cachedCtx.shutdown()
    cachedCtx = null
  }
}
