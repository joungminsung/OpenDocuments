import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface Workspace {
  id: string
  name: string
  mode: 'personal' | 'team'
  settings: Record<string, unknown>
  createdAt: string
}

interface WorkspaceRow {
  [key: string]: unknown
  id: string
  name: string
  mode: string
  settings: string
  created_at: string
}

export class WorkspaceManager {
  constructor(private db: DB) {}

  private mapRow(row: WorkspaceRow): Workspace {
    return {
      id: row.id,
      name: row.name,
      mode: row.mode as 'personal' | 'team',
      settings: JSON.parse(row.settings),
      createdAt: row.created_at,
    }
  }

  create(name: string, mode: 'personal' | 'team' = 'personal'): Workspace {
    const existing = this.getByName(name)
    if (existing) {
      throw new Error(`Workspace "${name}" already exists`)
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      'INSERT INTO workspaces (id, name, mode, settings, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, mode, '{}', now]
    )
    return { id, name, mode, settings: {}, createdAt: now }
  }

  getByName(name: string): Workspace | undefined {
    const row = this.db.get<WorkspaceRow>('SELECT * FROM workspaces WHERE name = ?', [name])
    if (!row) return undefined
    return this.mapRow(row)
  }

  getById(id: string): Workspace | undefined {
    const row = this.db.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [id])
    if (!row) return undefined
    return this.mapRow(row)
  }

  list(): Workspace[] {
    const rows = this.db.all<WorkspaceRow>('SELECT * FROM workspaces ORDER BY name')
    return rows.map(row => this.mapRow(row))
  }

  delete(id: string): void {
    this.db.run('DELETE FROM workspaces WHERE id = ?', [id])
  }

  ensureDefault(): Workspace {
    return this.ensure('default', 'personal')
  }

  /**
   * Ensure a named workspace exists and reflects the configured operating mode.
   */
  ensure(name: string, mode: 'personal' | 'team' = 'personal'): Workspace {
    const existing = this.getByName(name)
    if (!existing) return this.create(name, mode)
    if (existing.mode !== mode) {
      this.db.run('UPDATE workspaces SET mode = ? WHERE id = ?', [mode, existing.id])
      return { ...existing, mode }
    }
    return existing
  }
}
