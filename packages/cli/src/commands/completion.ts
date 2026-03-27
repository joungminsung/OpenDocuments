import { Command } from 'commander'
import { log } from '@opendocs/core'
import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

export function completionCommand() {
  const cmd = new Command('completion')
    .description('Install shell completions')

  cmd.command('install')
    .description('Install completions for your shell')
    .option('--shell <shell>', 'Shell: zsh, bash, fish', detectShell())
    .action(async (opts) => {
      const shell = opts.shell

      if (shell === 'zsh') {
        const completionScript = generateZshCompletion()
        const zshDir = join(process.env.HOME || '~', '.zsh', 'completions')
        const { mkdirSync } = await import('node:fs')
        mkdirSync(zshDir, { recursive: true })
        writeFileSync(join(zshDir, '_opendocs'), completionScript)

        // Add to .zshrc if not already there
        const zshrc = join(process.env.HOME || '~', '.zshrc')
        const content = existsSync(zshrc) ? readFileSync(zshrc, 'utf-8') : ''
        if (!content.includes('fpath=(~/.zsh/completions')) {
          appendFileSync(zshrc, '\nfpath=(~/.zsh/completions $fpath)\nautoload -Uz compinit && compinit\n')
        }

        log.ok('Zsh completions installed')
        log.arrow('Restart your shell or run: source ~/.zshrc')
      } else if (shell === 'bash') {
        const script = generateBashCompletion()
        const bashDir = join(process.env.HOME || '~', '.bash_completions')
        const { mkdirSync } = await import('node:fs')
        mkdirSync(bashDir, { recursive: true })
        writeFileSync(join(bashDir, 'opendocs'), script)
        log.ok('Bash completions installed')
        log.arrow(`Add to .bashrc: source ~/.bash_completions/opendocs`)
      } else {
        log.fail(`Unsupported shell: ${shell}. Supported: zsh, bash`)
      }
    })

  return cmd
}

function detectShell(): string {
  const shell = process.env.SHELL || ''
  if (shell.includes('zsh')) return 'zsh'
  if (shell.includes('bash')) return 'bash'
  if (shell.includes('fish')) return 'fish'
  return 'zsh'
}

function generateZshCompletion(): string {
  return `#compdef opendocs
_opendocs() {
  local -a commands
  commands=(
    'init:Initialize OpenDocs project'
    'start:Start the server'
    'stop:Stop the server'
    'ask:Ask a question'
    'search:Search documents'
    'index:Index files'
    'document:Manage documents'
    'connector:Manage connectors'
    'auth:Manage authentication'
    'plugin:Manage plugins'
    'workspace:Manage workspaces'
    'doctor:Health diagnostics'
    'config:View configuration'
    'export:Export data'
    'import:Import data'
    'completion:Shell completions'
  )
  _describe 'command' commands
}
compdef _opendocs opendocs
`
}

function generateBashCompletion(): string {
  return `_opendocs_completions() {
  local commands="init start stop ask search index document connector auth plugin workspace doctor config export import completion"
  COMPREPLY=($(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _opendocs_completions opendocs
`
}
