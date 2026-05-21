import type { Context } from 'hono'
import type { AppContext, WorkspaceServices } from '../bootstrap.js'

export function resolveRequestWorkspaceId(
  c: Context,
  ctx: AppContext,
  requestedWorkspaceId?: string
): string {
  const auth = c.get('auth') as { record?: { workspaceId?: string } } | null
  const authWorkspaceId = auth?.record?.workspaceId
  if (authWorkspaceId) return authWorkspaceId

  if (requestedWorkspaceId) {
    const requested =
      ctx.workspaceManager.getById(requestedWorkspaceId) ??
      ctx.workspaceManager.getByName(requestedWorkspaceId)
    if (requested) return requested.id
  }

  if (ctx.config.workspace) {
    const configured = ctx.workspaceManager.getByName(ctx.config.workspace)
    if (configured) return configured.id
  }

  return ctx.workspaceManager.ensureDefault().id
}

export function getWorkspaceServices(
  c: Context,
  ctx: AppContext,
  requestedWorkspaceId?: string
): WorkspaceServices {
  return ctx.forWorkspace(resolveRequestWorkspaceId(c, ctx, requestedWorkspaceId))
}
