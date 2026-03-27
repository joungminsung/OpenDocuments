import { Command } from 'commander'
import { log } from '@opendocuments/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const CURRENT_WS_FILE = join(process.env.HOME || '~', '.opendocuments', 'current-workspace')

function getCurrentWorkspace(): string {
  try { return existsSync(CURRENT_WS_FILE) ? readFileSync(CURRENT_WS_FILE, 'utf-8').trim() : 'default' } catch { return 'default' }
}

function setCurrentWorkspace(name: string): void {
  const dir = join(process.env.HOME || '~', '.opendocuments')
  const { mkdirSync } = require('node:fs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(CURRENT_WS_FILE, name)
}

export function workspaceCommand() {
  const cmd = new Command('workspace').description('Manage workspaces')

  cmd.command('list').description('List workspaces').action(async () => {
    const ctx = await getContext()
    try {
      const current = getCurrentWorkspace()
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
      ctx.workspaceManager.delete(ws.id)
      log.ok(`Workspace "${name}" deleted`)
    } finally { await shutdownContext() }
  })

  return cmd
}
