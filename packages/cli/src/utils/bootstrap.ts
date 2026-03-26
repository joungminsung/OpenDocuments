import { bootstrap, type AppContext } from '@opendocs/server'

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
