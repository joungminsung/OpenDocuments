import { Command } from 'commander'
import { log } from '@opendocs/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function authCommand() {
  const cmd = new Command('auth')
    .description('Manage authentication')

  cmd.command('create-key')
    .description('Create a new API key')
    .requiredOption('--name <name>', 'Key name')
    .option('--role <role>', 'Role: admin, member, viewer', 'member')
    .action(async (opts) => {
      const ctx = await getContext()
      try {
        const ws = ctx.workspaceManager.list()[0]
        if (!ws) { log.fail('No workspace found'); return }

        const { rawKey, record } = ctx.apiKeyManager.create({
          name: opts.name,
          workspaceId: ws.id,
          userId: 'cli-user',
          role: opts.role,
        })

        log.heading('API Key Created')
        log.ok(`Name:  ${record.name}`)
        log.ok(`Role:  ${record.role}`)
        log.ok(`Key:   ${chalk.cyan(rawKey)}`)
        log.blank()
        log.fail('This key will not be shown again. Save it securely.')
      } finally {
        await shutdownContext()
      }
    })

  cmd.command('list-keys')
    .description('List API keys')
    .action(async () => {
      const ctx = await getContext()
      try {
        const keys = ctx.apiKeyManager.list()
        if (keys.length === 0) { log.info('No API keys'); return }

        log.heading('API Keys')
        for (const key of keys) {
          const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'never'
          log.ok(`${key.name.padEnd(20)} ${key.role.padEnd(8)} ${key.keyPrefix}... ${chalk.dim(`last used: ${lastUsed}`)}`)
        }
      } finally {
        await shutdownContext()
      }
    })

  cmd.command('revoke-key <nameOrId>')
    .description('Revoke an API key by name or ID')
    .action(async (nameOrId) => {
      const ctx = await getContext()
      try {
        const keys = ctx.apiKeyManager.list()
        const key = keys.find(k => k.name === nameOrId || k.id === nameOrId)
        if (!key) { log.fail(`Key "${nameOrId}" not found`); return }

        ctx.apiKeyManager.revoke(key.id)
        log.ok(`Key "${nameOrId}" revoked`)
      } finally {
        await shutdownContext()
      }
    })

  cmd.command('login').description('Login with API key').action(async () => {
    const { input } = await import('@inquirer/prompts')
    const key = await input({ message: 'Enter API key:' })

    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const dir = join(process.env.HOME || '~', '.opendocs')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'auth-token'), key)
    log.ok('Logged in. API key saved to ~/.opendocs/auth-token')
  })

  return cmd
}
