import { randomBytes, createHash } from 'node:crypto'
import type { DB } from '../storage/db.js'

export type APIKeyScope = 'ask' | 'search' | 'document:read' | 'document:write' | 'connector:read' | 'connector:write' | 'admin' | '*'
export type UserRole = 'admin' | 'member' | 'viewer'

export interface APIKeyRecord {
  id: string
  name: string
  keyHash: string
  keyPrefix: string   // first 8 chars for display
  workspaceId: string
  userId: string
  role: UserRole
  scopes: APIKeyScope[]
  rateLimit?: number   // requests per minute
  allowedIps?: string[]
  expiresAt?: string
  lastUsedAt?: string
  createdAt: string
}

export interface CreateKeyInput {
  name: string
  workspaceId: string
  userId: string
  role: UserRole
  scopes?: APIKeyScope[]
  rateLimit?: number
  allowedIps?: string[]
  expiresAt?: string
}

export interface ValidatedKey {
  record: APIKeyRecord
  hasScope: (scope: APIKeyScope) => boolean
}

/**
 * Generate a new API key with od_live_ prefix.
 * Returns the raw key (shown once to user) and the hash (stored in DB).
 */
export function generateAPIKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const random = randomBytes(32).toString('hex')
  const rawKey = `od_live_${random}`
  const keyHash = hashKey(rawKey)
  const keyPrefix = rawKey.substring(0, 16)
  return { rawKey, keyHash, keyPrefix }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export class APIKeyManager {
  constructor(private db: DB) {}

  create(input: CreateKeyInput): { rawKey: string; record: APIKeyRecord } {
    const { rawKey, keyHash, keyPrefix } = generateAPIKey()
    const id = randomBytes(16).toString('hex')
    const now = new Date().toISOString()
    const scopes = input.scopes || (input.role === 'admin' ? ['*'] : input.role === 'member' ? ['ask', 'search', 'document:read', 'document:write', 'connector:read'] : ['ask', 'search', 'document:read'])

    this.db.run(
      `INSERT INTO api_keys (id, name, key_hash, key_prefix, workspace_id, user_id, role, scopes, rate_limit, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.name, keyHash, keyPrefix, input.workspaceId, input.userId, input.role, JSON.stringify(scopes), input.rateLimit || null, input.expiresAt || null, now]
    )

    return {
      rawKey,
      record: { id, name: input.name, keyHash, keyPrefix, workspaceId: input.workspaceId, userId: input.userId, role: input.role, scopes, rateLimit: input.rateLimit, expiresAt: input.expiresAt, createdAt: now },
    }
  }

  /**
   * Validate an API key. Uses hash-then-lookup pattern which eliminates
   * timing oracle attacks (attacker cannot incrementally guess the hash).
   * The SHA-256 pre-hash means database lookup time does not leak key material.
   */
  validate(rawKey: string): ValidatedKey | null {
    const keyHash = hashKey(rawKey)
    const row = this.db.get<any>(
      'SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL',
      [keyHash]
    )

    if (!row) return null

    // Check expiration
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return null
    }

    // Update last used
    this.db.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), row.id])

    const record: APIKeyRecord = {
      id: row.id,
      name: row.name,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      scopes: JSON.parse(row.scopes),
      rateLimit: row.rate_limit,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }

    return {
      record,
      hasScope: (scope: APIKeyScope) => {
        return record.scopes.includes('*') || record.scopes.includes(scope)
      },
    }
  }

  list(workspaceId?: string): Omit<APIKeyRecord, 'keyHash'>[] {
    const query = workspaceId
      ? 'SELECT * FROM api_keys WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC'
    const params = workspaceId ? [workspaceId] : []

    return this.db.all<any>(query, params).map(row => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.key_prefix,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      scopes: JSON.parse(row.scopes),
      rateLimit: row.rate_limit,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }))
  }

  revoke(id: string): void {
    this.db.run('UPDATE api_keys SET revoked_at = ? WHERE id = ?', [new Date().toISOString(), id])
  }
}
