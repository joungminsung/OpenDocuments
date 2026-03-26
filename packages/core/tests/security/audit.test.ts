import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AuditLogger } from '../../src/security/audit.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('AuditLogger', () => {
  let db: DB
  let logger: AuditLogger

  beforeEach(() => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    logger = new AuditLogger(db, { enabled: true })
  })

  afterEach(() => db.close())

  it('logs audit events', () => {
    logger.log({ eventType: 'auth:login', userId: 'user-1', details: { method: 'api-key' } })
    const entries = logger.query()
    expect(entries).toHaveLength(1)
    expect(entries[0].eventType).toBe('auth:login')
    expect(entries[0].details).toEqual({ method: 'api-key' })
  })

  it('does nothing when disabled', () => {
    const disabled = new AuditLogger(db, { enabled: false })
    disabled.log({ eventType: 'auth:login' })
    expect(disabled.query()).toHaveLength(0)
  })

  it('filters by event type', () => {
    logger.log({ eventType: 'auth:login' })
    logger.log({ eventType: 'document:accessed' })
    logger.log({ eventType: 'auth:login' })
    expect(logger.query({ eventType: 'auth:login' })).toHaveLength(2)
    expect(logger.query({ eventType: 'document:accessed' })).toHaveLength(1)
  })
})
