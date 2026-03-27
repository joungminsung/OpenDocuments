import { Command } from 'commander'
import { log, loadConfig } from '@opendocuments/core'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export function configCommand() {
  const cmd = new Command('config')
    .description('View or modify configuration')

  cmd.command('show')
    .description('Show full config')
    .argument('[key]', 'Config key to view')
    .action(async (key) => {
      const config = loadConfig(process.cwd())
      if (!key) {
        log.heading('Configuration')
        console.log(JSON.stringify(config, null, 2))
        return
      }
      const keys = key.split('.')
      let current: any = config
      for (const k of keys) { current = current?.[k] }
      if (current === undefined) log.fail(`Config key not found: ${key}`)
      else console.log(JSON.stringify(current, null, 2))
    })

  cmd.command('edit')
    .description('Open config file in editor')
    .action(async () => {
      const editor = process.env.EDITOR || 'vi'
      const configPath = join(process.cwd(), 'opendocuments.config.ts')
      if (!existsSync(configPath)) { log.fail('No config file found. Run: opendocuments init'); return }
      const { execSync } = await import('node:child_process')
      execSync(`${editor} ${configPath}`, { stdio: 'inherit' })
    })

  cmd.command('reset')
    .description('Reset config to defaults')
    .action(async () => {
      const configPath = join(process.cwd(), 'opendocuments.config.ts')
      if (existsSync(configPath)) {
        const { confirm } = await import('@inquirer/prompts')
        const yes = await confirm({ message: 'Reset configuration to defaults?' })
        if (!yes) return
        unlinkSync(configPath)
      }
      log.ok('Configuration reset. Run: opendocuments init')
    })

  // Default action (no subcommand) -- show config
  cmd.action(async () => {
    const config = loadConfig(process.cwd())
    log.heading('Configuration')
    console.log(JSON.stringify(config, null, 2))
  })

  return cmd
}
