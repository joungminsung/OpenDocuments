import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { isRecordedServerProcess, readServerPid, resolveInstanceDataDir } from '../utils/instance.js'

export function stopCommand() {
  return new Command('stop')
    .description('Stop the OpenDocuments server')
    .action(async () => {
      const dataDir = resolveInstanceDataDir()
      const pidFile = join(dataDir, 'server.pid')
      if (!existsSync(pidFile)) {
        log.info('No running server found (no PID file at ' + pidFile + ')')
        return
      }
      const record = readServerPid(pidFile)
      if (!record) {
        log.fail(`Invalid PID record at ${pidFile}. Refusing to signal an unverified process.`)
        process.exitCode = 1
        return
      }
      if (record.dataDir !== dataDir) {
        log.fail('PID record belongs to a different data directory. Refusing to stop it.')
        process.exitCode = 1
        return
      }
      if (!isRecordedServerProcess(record)) {
        log.info(`Recorded server process (PID ${record.pid}) is not running. Cleaning up the stale PID file.`)
        try { unlinkSync(pidFile) } catch {}
        return
      }

      try {
        process.kill(record.pid, 'SIGTERM')
        log.ok(`Server (PID ${record.pid}) stop signal sent`)
      } catch (err) {
        log.fail(`Failed to stop server: ${(err as Error).message}`)
        process.exitCode = 1
      }
    })
}
