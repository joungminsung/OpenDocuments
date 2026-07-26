import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { APIKeyManager } from '../../src/auth/api-key.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('APIKeyManager', () => {
  let db: DB
  let manager: APIKeyManager

  beforeEach(() => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")
    manager = new APIKeyManager(db)
  })

  afterEach(() => db.close())

  it('creates an API key with od_live_ prefix', () => {
    const { rawKey, record } = manager.create({
      name: 'test-key', workspaceId: 'ws-1', userId: 'user-1', role: 'member',
    })
    expect(rawKey).toMatch(/^od_live_[a-f0-9]{64}$/)
    expect(record.name).toBe('test-key')
    expect(record.role).toBe('member')
  })

  it('validates a correct key', () => {
    const { rawKey } = manager.create({
      name: 'test', workspaceId: 'ws-1', userId: 'user-1', role: 'admin',
    })
    const validated = manager.validate(rawKey)
    expect(validated).not.toBeNull()
    expect(validated!.record.role).toBe('admin')
    expect(validated!.hasScope('*')).toBe(true)
  })

  it('returns null for invalid key', () => {
    expect(manager.validate('od_live_invalid')).toBeNull()
  })

  it('respects expiration', () => {
    const { rawKey } = manager.create({
      name: 'expired', workspaceId: 'ws-1', userId: 'user-1', role: 'member',
      expiresAt: '2020-01-01T00:00:00Z',
    })
    expect(manager.validate(rawKey)).toBeNull()
  })

  it('assigns correct default scopes by role', () => {
    const admin = manager.create({ name: 'admin', workspaceId: 'ws-1', userId: 'u1', role: 'admin' })
    const member = manager.create({ name: 'member', workspaceId: 'ws-1', userId: 'u2', role: 'member' })
    const viewer = manager.create({ name: 'viewer', workspaceId: 'ws-1', userId: 'u3', role: 'viewer' })

    expect(admin.record.scopes).toContain('*')
    expect(member.record.scopes).toContain('document:write')
    expect(viewer.record.scopes).not.toContain('document:write')
  })

  it('rejects invalid per-key rate limits', () => {
    expect(() => manager.create({
      name: 'invalid-limit',
      workspaceId: 'ws-1',
      userId: 'u1',
      role: 'member',
      rateLimit: 0,
    })).toThrow('rateLimit must be a positive integer')
  })

  it('lists and revokes keys', () => {
    manager.create({ name: 'key1', workspaceId: 'ws-1', userId: 'u1', role: 'member' })
    const { record } = manager.create({ name: 'key2', workspaceId: 'ws-1', userId: 'u2', role: 'viewer' })

    expect(manager.list('ws-1')).toHaveLength(2)
    manager.revoke(record.id)
    expect(manager.list('ws-1')).toHaveLength(1)
  })
})
