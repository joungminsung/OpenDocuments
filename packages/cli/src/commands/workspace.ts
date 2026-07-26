import { Command } from 'commander'
import { log } from 'opendocuments-core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveWorkspaceStatePath } from '../utils/instance.js'

function getCurrentWorkspace(fallback = 'default'): string {
  const workspaceFile = resolveWorkspaceStatePath()
  try { return existsSync(workspaceFile) ? readFileSync(workspaceFile, 'utf-8').trim() || fallback : fallback } catch { return fallback }
}

function setCurrentWorkspace(name: string): void {
  const workspaceFile = resolveWorkspaceStatePath()
  mkdirSync(dirname(workspaceFile), { recursive: true })
  writeFileSync(workspaceFile, name, { mode: 0o600 })
}

export function workspaceCommand() {
  const cmd = new Command('workspace').description('Manage workspaces')

  cmd.command('list').description('List workspaces').action(async () => {
    const ctx = await getContext()
    try {
      const current = getCurrentWorkspace(ctx.config.workspace)
      const workspaces = ctx.workspaceManager.list()
      log.heading('Workspaces')
      for (const ws of workspaces) {
        const marker = ws.name === current ? chalk.cyan(' (current)') : ''
        log.ok(`${ws.name.padEnd(20)} ${ws.mode}${marker}`)
      }
    } finally { await shutdownContext() }
  })

  cmd.command('create <name>').description('Create workspace').option('--mode <mode>', 'personal or team', 'personal').action(async (name, opts) => {
    const ctx = await getContext()
    try {
      if (opts.mode !== 'personal' && opts.mode !== 'team') {
        log.fail('Workspace mode must be personal or team')
        return
      }
      ctx.workspaceManager.create(name, opts.mode)
      log.ok(`Workspace "${name}" created`)
    } finally { await shutdownContext() }
  })

  cmd.command('switch <name>').description('Switch active workspace').action(async (name) => {
    const ctx = await getContext()
    try {
      const ws = ctx.workspaceManager.getByName(name)
      if (!ws) { log.fail(`Workspace "${name}" not found`); return }
      setCurrentWorkspace(name)
      log.ok(`Switched to workspace "${name}"`)
    } finally { await shutdownContext() }
  })

  cmd.command('delete <name>').description('Delete workspace').action(async (name) => {
    const ctx = await getContext()
    try {
      if (name === 'default') { log.fail('Cannot delete default workspace'); return }
      const ws = ctx.workspaceManager.getByName(name)
      if (!ws) { log.fail(`Workspace "${name}" not found`); return }
      if (name === getCurrentWorkspace(ctx.config.workspace)) {
        log.fail(`Cannot delete the active workspace "${name}". Switch to another workspace first.`)
        return
      }
      const services = ctx.forWorkspace(ws.id)
      for (const document of services.store.listDocuments()) {
        await services.store.hardDeleteDocument(document.id)
      }
      ctx.workspaceManager.delete(ws.id)
      log.ok(`Workspace "${name}" deleted`)
    } finally { await shutdownContext() }
  })

  return cmd
}
