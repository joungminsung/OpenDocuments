import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function stopCommand() {
  return new Command('stop')
    .description('Stop the OpenDocuments server')
    .action(async () => {
      const pidFile = join(homedir(), '.opendocuments', 'server.pid')
      if (!existsSync(pidFile)) {
        log.info('No running server found (no PID file at ' + pidFile + ')')
        return
      }
      let pid: number
      try {
        pid = parseInt(readFileSync(pidFile, 'utf-8').trim())
        if (isNaN(pid)) {
          log.fail('Invalid PID file content')
          unlinkSync(pidFile)
          return
        }
      } catch (err) {
        log.fail(`Failed to read PID file: ${(err as Error).message}`)
        return
      }

      try {
        // Check if process exists first
        process.kill(pid, 0)
      } catch {
        log.info(`Server process (PID ${pid}) is not running. Cleaning up PID file.`)
        try { unlinkSync(pidFile) } catch {}
        return
      }

      try {
        process.kill(pid, 'SIGTERM')
        log.ok(`Server (PID ${pid}) stopped`)
      } catch (err) {
        log.fail(`Failed to stop server: ${(err as Error).message}`)
      } finally {
        try { unlinkSync(pidFile) } catch {}
      }
    })
}
