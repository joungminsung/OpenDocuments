import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface Conversation {
  id: string
  workspaceId: string
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  sources?: string  // JSON
  profileUsed?: string
  confidenceScore?: number
  responseTimeMs?: number
  createdAt: string
}

export class ConversationManager {
  constructor(private db: DB, private workspaceId: string) {}

  private hasConversation(conversationId: string): boolean {
    const row = this.db.get<{ id: string }>(
      'SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      [conversationId, this.workspaceId]
    )
    return Boolean(row)
  }

  create(title?: string): Conversation {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      'INSERT INTO conversations (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, this.workspaceId, title || null, now, now]
    )
    return { id, workspaceId: this.workspaceId, title: title || null, createdAt: now, updatedAt: now }
  }

  addMessage(conversationId: string, role: 'user' | 'assistant', content: string, meta?: {
    sources?: unknown
    profileUsed?: string
    confidenceScore?: number
    responseTimeMs?: number
  }): Message {
    if (!this.hasConversation(conversationId)) {
      throw new Error(`Conversation not found in workspace ${this.workspaceId}`)
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO messages (id, conversation_id, role, content, sources, profile_used, confidence_score, response_time_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, conversationId, role, content, meta?.sources ? JSON.stringify(meta.sources) : null,
       meta?.profileUsed || null, meta?.confidenceScore ?? null, meta?.responseTimeMs ?? null, now]
    )
    // Update conversation timestamp
    this.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId])
    return { id, conversationId, role, content, sources: meta?.sources ? JSON.stringify(meta.sources) : undefined, profileUsed: meta?.profileUsed, confidenceScore: meta?.confidenceScore, responseTimeMs: meta?.responseTimeMs, createdAt: now }
  }

  getMessages(conversationId: string): Message[] {
    return this.db.all<any>(
      `SELECT m.* FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ? AND c.workspace_id = ? AND c.deleted_at IS NULL
       ORDER BY m.created_at ASC`,
      [conversationId, this.workspaceId]
    ).map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      sources: row.sources,
      profileUsed: row.profile_used,
      confidenceScore: row.confidence_score,
      responseTimeMs: row.response_time_ms,
      createdAt: row.created_at,
    }))
  }

  list(): Conversation[] {
    return this.db.all<any>(
      'SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
      [this.workspaceId]
    ).map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  delete(id: string): void {
    this.db.run(
      'UPDATE conversations SET deleted_at = ? WHERE id = ? AND workspace_id = ?',
      [new Date().toISOString(), id, this.workspaceId]
    )
  }
}
