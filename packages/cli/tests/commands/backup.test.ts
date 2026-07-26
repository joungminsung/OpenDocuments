import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createBackup, restoreBackup } from '../../src/commands/backup.js'

describe('backup helpers', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  function temp(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), `opendocuments-${name}-`))
    tempDirs.push(dir)
    return dir
  }

  it('round-trips database, vectors, plugin manifest, and workspace state', () => {
    const source = temp('source')
    const backup = temp('backup')
    const target = temp('target')
    const state = temp('state')
    mkdirSync(join(source, 'vectors'))
    writeFileSync(join(source, 'opendocuments.db'), 'database-v1')
    writeFileSync(join(source, 'opendocuments.db-wal'), 'wal-v1')
    writeFileSync(join(source, 'installed-plugins.json'), '["plugin-a"]')
    writeFileSync(join(source, 'vectors', 'index.bin'), 'vector-v1')
    writeFileSync(join(source, 'current-workspace'), 'team-a')

    createBackup(source, backup)
    writeFileSync(join(target, 'opendocuments.db'), 'stale-database')
    mkdirSync(join(target, 'vectors'))
    writeFileSync(join(target, 'vectors', 'stale.bin'), 'stale-vector')
    restoreBackup(target, backup, true, state)

    expect(readFileSync(join(target, 'opendocuments.db'), 'utf-8')).toBe('database-v1')
    expect(readFileSync(join(target, 'vectors', 'index.bin'), 'utf-8')).toBe('vector-v1')
    expect(existsSync(join(target, 'vectors', 'stale.bin'))).toBe(false)
    expect(readFileSync(join(target, 'current-workspace'), 'utf-8')).toBe('team-a')
  })

  it('refuses to replace existing data without force', () => {
    const source = temp('source')
    const backup = temp('backup')
    const target = temp('target')
    const state = temp('state')
    writeFileSync(join(source, 'opendocuments.db'), 'database')
    writeFileSync(join(target, 'opendocuments.db'), 'existing')
    createBackup(source, backup)

    expect(() => restoreBackup(target, backup, false, state)).toThrow('Use --force')
  })

  it('verifies backup integrity before replacing existing data', () => {
    const source = temp('source')
    const backup = temp('backup')
    const target = temp('target')
    const state = temp('state')
    writeFileSync(join(source, 'opendocuments.db'), 'database')
    writeFileSync(join(target, 'opendocuments.db'), 'existing')
    createBackup(source, backup)
    writeFileSync(join(backup, 'opendocuments.db'), 'tampered')

    expect(() => restoreBackup(target, backup, true, state)).toThrow('integrity check failed')
    expect(readFileSync(join(target, 'opendocuments.db'), 'utf-8')).toBe('existing')
  })

  it('rejects symbolic links and leaves no partial snapshot behind', () => {
    const source = temp('source')
    const backup = temp('backup')
    const external = temp('external')
    mkdirSync(join(source, 'vectors'))
    writeFileSync(join(source, 'opendocuments.db'), 'database')
    writeFileSync(join(external, 'secret.bin'), 'must-not-be-copied')
    symlinkSync(join(external, 'secret.bin'), join(source, 'vectors', 'linked.bin'))

    expect(() => createBackup(source, backup)).toThrow('symbolic link')
    expect(readdirSync(backup)).toEqual([])
  })

  it('fails closed when the server PID record is unreadable', () => {
    const source = temp('source')
    const backup = temp('backup')
    writeFileSync(join(source, 'opendocuments.db'), 'database')
    writeFileSync(join(source, 'server.pid'), '12345\n')

    expect(() => createBackup(source, backup)).toThrow('Invalid PID record')
    expect(readdirSync(backup)).toEqual([])
  })
})
