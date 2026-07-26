import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, resolve } from 'node:path'
import { loadConfig } from 'opendocuments-core'

export interface ServerPidRecord {
  pid: number
  dataDir: string
  entrypoint: string
  startedAt: string
}

/** Resolve this project's storage directory using the same precedence as server bootstrap. */
export function resolveInstanceDataDir(projectDir = process.cwd()): string {
  const config = loadConfig(projectDir)
  const configured = process.env.OPENDOCUMENTS_DATA_DIR
    || config.storage.dataDir.replace(/^~/, homedir())
  return isAbsolute(configured) ? configured : resolve(projectDir, configured)
}

/** Keep mutable workspace selection scoped to the current instance. */
export function resolveWorkspaceStatePath(projectDir = process.cwd()): string {
  return resolve(resolveInstanceDataDir(projectDir), 'current-workspace')
}

export function readServerPid(pidFile: string): ServerPidRecord | null {
  if (!existsSync(pidFile)) return null
  try {
    const parsed = JSON.parse(readFileSync(pidFile, 'utf-8')) as Partial<ServerPidRecord>
    if (
      !Number.isInteger(parsed.pid)
      || Number(parsed.pid) <= 0
      || typeof parsed.dataDir !== 'string'
      || typeof parsed.entrypoint !== 'string'
      || typeof parsed.startedAt !== 'string'
    ) {
      return null
    }
    return parsed as ServerPidRecord
  } catch {
    return null
  }
}

/** Verify that a PID still belongs to the exact CLI entrypoint that created the record. */
export function isRecordedServerProcess(record: ServerPidRecord): boolean {
  try {
    process.kill(record.pid, 0)
  } catch {
    return false
  }

  try {
    const command = execFileSync(
      'ps',
      ['-p', String(record.pid), '-o', 'command='],
      { encoding: 'utf-8' }
    ).trim()
    return command.includes(record.entrypoint) || command.includes(basename(record.entrypoint))
  } catch {
    return false
  }
}
