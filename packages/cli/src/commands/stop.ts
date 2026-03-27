import { Command } from 'commander'
import { log } from '@opendocs/core'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export function stopCommand() {
  return new Command('stop')
    .description('Stop the OpenDocs server')
    .action(async () => {
      const pidFile = join(process.env.HOME || '~', '.opendocs', 'server.pid')
      if (!existsSync(pidFile)) {
        log.info('No running server found')
        return
      }
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8').trim())
        process.kill(pid, 'SIGTERM')
        unlinkSync(pidFile)
        log.ok(`Server (PID ${pid}) stopped`)
      } catch (err) {
        log.fail(`Failed to stop server: ${(err as Error).message}`)
        try { unlinkSync(pidFile) } catch {}
      }
    })
}
