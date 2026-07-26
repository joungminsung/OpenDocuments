import { Command } from 'commander'
import { log } from 'opendocuments-core'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { isRecordedServerProcess, readServerPid, resolveInstanceDataDir } from '../utils/instance.js'

const STATE_DIR = join(homedir(), '.opendocuments')
const BACKUP_FILES = [
  'opendocuments.db',
  'opendocuments.db-wal',
  'opendocuments.db-shm',
  'installed-plugins.json',
] as const
const BACKUP_DIRS = ['vectors'] as const

interface BackupManifest {
  format: 'opendocuments-backup'
  version: 1
  createdAt: string
  files: Array<{
    path: string
    size: number
    sha256: string
  }>
}

function copyDirRecursive(src: string, dest: string): void {
  if (lstatSync(src).isSymbolicLink()) {
    throw new Error(`Refusing to back up symbolic link: ${src}`)
  }
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    const stat = lstatSync(srcPath)
    if (stat.isSymbolicLink()) throw new Error(`Refusing to back up symbolic link: ${srcPath}`)
    if (stat.isDirectory()) copyDirRecursive(srcPath, destPath)
    else if (stat.isFile()) copyFileSync(srcPath, destPath)
    else throw new Error(`Unsupported backup entry: ${srcPath}`)
  }
}

function listFilesRecursive(root: string, relativeDir = ''): string[] {
  const directory = join(root, relativeDir)
  if (!existsSync(directory)) return []
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const relativePath = join(relativeDir, entry)
    const absolutePath = join(root, relativePath)
    const stat = lstatSync(absolutePath)
    if (stat.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in backups: ${relativePath}`)
    if (stat.isDirectory()) {
      files.push(...listFilesRecursive(root, relativePath))
    } else if (stat.isFile()) {
      files.push(relativePath.split(sep).join('/'))
    } else {
      throw new Error(`Unsupported backup entry: ${relativePath}`)
    }
  }
  return files.sort()
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function validateBackupFiles(backupDir: string, manifest: BackupManifest): void {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Invalid backup: file inventory is missing')
  }
  const backupRoot = resolve(backupDir)
  const seen = new Set<string>()
  const inventoryPaths = new Set<string>()
  for (const file of manifest.files) {
    if (
      typeof file?.path !== 'string'
      || !Number.isSafeInteger(file.size)
      || file.size < 0
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || isAbsolute(file.path)
      || file.path.includes('\\')
      || (
        !BACKUP_FILES.includes(file.path as typeof BACKUP_FILES[number])
        && file.path !== 'current-workspace'
        && !file.path.startsWith('vectors/')
      )
    ) {
      throw new Error('Invalid backup: malformed file inventory')
    }
    const source = resolve(backupDir, ...file.path.split('/'))
    if (
      (source !== backupRoot && !source.startsWith(backupRoot + sep))
      || seen.has(source)
      || !existsSync(source)
      || lstatSync(source).isSymbolicLink()
      || !lstatSync(source).isFile()
    ) {
      throw new Error(`Invalid backup file: ${file.path}`)
    }
    seen.add(source)
    inventoryPaths.add(file.path)
    const stat = statSync(source)
    if (stat.size !== file.size || sha256File(source) !== file.sha256) {
      throw new Error(`Backup integrity check failed: ${file.path}`)
    }
  }
  if (!manifest.files.some((file) => file.path === 'opendocuments.db')) {
    throw new Error('Invalid backup: opendocuments.db is missing')
  }
  const actualPaths = listFilesRecursive(backupDir)
    .filter((path) => path !== 'backup-manifest.json')
  if (
    actualPaths.length !== inventoryPaths.size
    || actualPaths.some((path) => !inventoryPaths.has(path))
  ) {
    throw new Error('Invalid backup: file inventory does not match snapshot contents')
  }
}

function assertServerStopped(dataDir: string): void {
  const pidFile = join(dataDir, 'server.pid')
  if (!existsSync(pidFile)) return
  const record = readServerPid(pidFile)
  if (!record || !isRecordedServerProcess(record)) return
  throw new Error('OpenDocuments server is running. Run "opendocuments stop" before backup or restore.')
}

/** Resolve the active storage directory using the same precedence as server bootstrap. */
export function resolveDataDir(projectDir = process.cwd()): string {
  return resolveInstanceDataDir(projectDir)
}

/** Create a consistent, restorable snapshot of SQLite, LanceDB, and CLI workspace state. */
export function createBackup(
  dataDir: string,
  backupDir: string,
  stateDir = STATE_DIR
): { copied: number; skipped: number } {
  assertServerStopped(dataDir)
  if (!existsSync(dataDir)) throw new Error(`Data directory not found: ${dataDir}`)
  if (!existsSync(join(dataDir, 'opendocuments.db'))) {
    throw new Error(`Database not found in data directory: ${dataDir}`)
  }
  const resolvedDataDir = resolve(dataDir)
  const resolvedBackupDir = resolve(backupDir)
  if (
    resolvedDataDir === resolvedBackupDir
    || resolvedBackupDir.startsWith(resolvedDataDir + sep)
  ) {
    throw new Error('Backup target must be outside the active data directory')
  }
  if (existsSync(backupDir)) {
    const targetStat = lstatSync(backupDir)
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error(`Backup target must be a real directory path: ${backupDir}`)
    }
    if (readdirSync(backupDir).length > 0) {
      throw new Error(`Backup target is not empty: ${backupDir}`)
    }
  }

  const backupParent = dirname(resolvedBackupDir)
  mkdirSync(backupParent, { recursive: true })
  const snapshotDir = mkdtempSync(join(backupParent, '.opendocuments-backup-'))
  let copied = 0
  let skipped = 0

  try {
    for (const file of BACKUP_FILES) {
      const src = join(dataDir, file)
      if (existsSync(src)) {
        if (lstatSync(src).isSymbolicLink()) throw new Error(`Refusing to back up symbolic link: ${src}`)
        copyFileSync(src, join(snapshotDir, file))
        copied++
      } else {
        skipped++
      }
    }
    for (const dir of BACKUP_DIRS) {
      const src = join(dataDir, dir)
      if (existsSync(src)) {
        copyDirRecursive(src, join(snapshotDir, dir))
        copied++
      } else {
        skipped++
      }
    }

    const workspaceState = join(stateDir, 'current-workspace')
    if (existsSync(workspaceState)) {
      if (lstatSync(workspaceState).isSymbolicLink()) {
        throw new Error(`Refusing to back up symbolic link: ${workspaceState}`)
      }
      copyFileSync(workspaceState, join(snapshotDir, 'current-workspace'))
      copied++
    } else {
      skipped++
    }

    const manifestFiles = listFilesRecursive(snapshotDir).map((relativePath) => {
      const absolutePath = join(snapshotDir, ...relativePath.split('/'))
      return {
        path: relativePath,
        size: statSync(absolutePath).size,
        sha256: sha256File(absolutePath),
      }
    })
    const manifest: BackupManifest = {
      format: 'opendocuments-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      files: manifestFiles,
    }
    writeFileSync(join(snapshotDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

    if (existsSync(resolvedBackupDir)) rmSync(resolvedBackupDir, { recursive: true })
    renameSync(snapshotDir, resolvedBackupDir)
    return { copied, skipped }
  } catch (error) {
    rmSync(snapshotDir, { recursive: true, force: true })
    throw error
  }
}

/** Replace the active data with a previously created snapshot. */
export function restoreBackup(
  dataDir: string,
  backupDir: string,
  force: boolean,
  stateDir = STATE_DIR
): { restored: number; skipped: number; safetyBackup?: string } {
  assertServerStopped(dataDir)
  if (!existsSync(backupDir)) throw new Error(`Backup directory not found: ${backupDir}`)
  const manifestPath = join(backupDir, 'backup-manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error('Invalid backup: backup-manifest.json is missing')
  }
  let manifest: Partial<BackupManifest>
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Partial<BackupManifest>
  } catch {
    throw new Error('Invalid backup: backup-manifest.json is malformed')
  }
  if (manifest.format !== 'opendocuments-backup' || manifest.version !== 1) {
    throw new Error('Unsupported OpenDocuments backup format')
  }
  validateBackupFiles(backupDir, manifest as BackupManifest)

  const existing = [
    ...BACKUP_FILES.filter((file) => existsSync(join(dataDir, file))),
    ...BACKUP_DIRS.filter((dir) => existsSync(join(dataDir, dir))).map((dir) => `${dir}/`),
  ]
  if (existing.length > 0 && !force) {
    throw new Error(`Existing data detected (${existing.join(', ')}). Use --force to replace it.`)
  }

  let safetyBackup: string | undefined
  if (force && existsSync(join(dataDir, 'opendocuments.db'))) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    safetyBackup = join(stateDir, 'backups', `pre-restore-${timestamp}`)
    createBackup(dataDir, safetyBackup, stateDir)
  }

  const dataDirParent = dirname(resolve(dataDir))
  mkdirSync(dataDirParent, { recursive: true })
  const stagingDir = mkdtempSync(join(dataDirParent, '.opendocuments-restore-'))
  const rollbackDir = mkdtempSync(join(dataDirParent, '.opendocuments-rollback-'))
  let restored = 0
  let skipped = 0
  const installed: string[] = []
  const displaced: string[] = []
  let workspaceInstalled = false
  let workspaceDisplaced = false

  try {
    for (const file of BACKUP_FILES) {
      const source = join(backupDir, file)
      if (existsSync(source)) {
        copyFileSync(source, join(stagingDir, file))
        restored++
      } else {
        skipped++
      }
    }
    for (const dir of BACKUP_DIRS) {
      const source = join(backupDir, dir)
      if (existsSync(source)) {
        copyDirRecursive(source, join(stagingDir, dir))
        restored++
      } else {
        skipped++
      }
    }

    const workspaceSource = join(backupDir, 'current-workspace')
    if (existsSync(workspaceSource)) {
      copyFileSync(workspaceSource, join(stagingDir, 'current-workspace'))
      restored++
    } else {
      skipped++
    }

    mkdirSync(dataDir, { recursive: true })
    for (const item of [...BACKUP_FILES, ...BACKUP_DIRS]) {
      const destination = join(dataDir, item)
      if (existsSync(destination)) {
        renameSync(destination, join(rollbackDir, item))
        displaced.push(item)
      }
      const staged = join(stagingDir, item)
      if (existsSync(staged)) {
        renameSync(staged, destination)
        installed.push(item)
      }
    }

    const workspaceDestination = join(stateDir, 'current-workspace')
    const stagedWorkspace = join(stagingDir, 'current-workspace')
    mkdirSync(stateDir, { recursive: true })
    if (existsSync(workspaceDestination)) {
      renameSync(workspaceDestination, join(rollbackDir, 'current-workspace'))
      workspaceDisplaced = true
    }
    if (existsSync(stagedWorkspace)) {
      renameSync(stagedWorkspace, workspaceDestination)
      workspaceInstalled = true
    }
  } catch (error) {
    for (const item of installed) {
      rmSync(join(dataDir, item), { recursive: true, force: true })
    }
    for (const item of displaced) {
      const rollbackItem = join(rollbackDir, item)
      if (existsSync(rollbackItem)) renameSync(rollbackItem, join(dataDir, item))
    }
    const workspaceDestination = join(stateDir, 'current-workspace')
    if (workspaceInstalled) rmSync(workspaceDestination, { force: true })
    if (workspaceDisplaced) {
      renameSync(join(rollbackDir, 'current-workspace'), workspaceDestination)
    }
    throw error
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
    rmSync(rollbackDir, { recursive: true, force: true })
  }
  return { restored, skipped, safetyBackup }
}

export function backupCommand() {
  return new Command('backup')
    .description('Back up SQLite database and LanceDB vector data')
    .option('-o, --output <path>', 'Output directory for the backup', '')
    .action(async (opts: { output: string }) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
      const dataDir = resolveDataDir()
      const backupDir = opts.output || join(STATE_DIR, 'backups', `backup-${timestamp}`)

      log.heading('Backup')
      log.info(`Source : ${dataDir}`)
      log.info(`Target : ${backupDir}`)
      try {
        const result = createBackup(dataDir, backupDir)
        log.ok(`Backup complete — ${result.copied} item(s) copied, ${result.skipped} skipped`)
      } catch (error) {
        log.fail(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}

export function restoreCommand() {
  return new Command('restore')
    .description('Restore SQLite database and LanceDB vector data from a backup')
    .argument('<backup-path>', 'Path to the backup directory')
    .option('--force', 'Replace existing data')
    .action(async (backupPath: string, opts: { force?: boolean }) => {
      const dataDir = resolveDataDir()
      const resolvedBackup = resolve(backupPath)
      if (resolve(dataDir) === resolvedBackup || basename(resolvedBackup) === '') {
        log.fail('Backup source and data directory must be different')
        process.exitCode = 1
        return
      }

      log.heading('Restore')
      log.info(`Source : ${resolvedBackup}`)
      log.info(`Target : ${dataDir}`)
      try {
        const result = restoreBackup(dataDir, resolvedBackup, opts.force === true)
        log.ok(`Restore complete — ${result.restored} item(s) restored, ${result.skipped} skipped`)
        if (result.safetyBackup) {
          log.info(`Previous data preserved at ${result.safetyBackup}`)
        }
        log.arrow('Restart the OpenDocuments server for changes to take effect')
      } catch (error) {
        log.fail(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}
