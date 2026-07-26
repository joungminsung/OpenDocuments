import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webDist = resolve(cliDir, '../web/dist')
const target = resolve(cliDir, 'web-dist')

if (!existsSync(webDist)) {
  throw new Error(`Web UI build not found at ${webDist}. Build @opendocuments/web before the CLI.`)
}

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
cpSync(webDist, target, { recursive: true })
