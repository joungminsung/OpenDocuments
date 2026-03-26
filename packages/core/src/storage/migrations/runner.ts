// packages/core/src/storage/migrations/runner.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DB } from '../db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function runMigrations(db: DB): { applied: string[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)

  const migrationDir = __dirname
  const files = readdirSync(migrationDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied: string[] = []

  for (const file of files) {
    const already = db.get<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE name = ?',
      [file]
    )
    if (already) continue

    const sql = readFileSync(join(migrationDir, file), 'utf-8')
    db.transaction(() => {
      try {
        db.exec(sql)
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`)
      }
      db.run('INSERT INTO schema_migrations (name) VALUES (?)', [file])
    })
    applied.push(file)
  }

  return { applied }
}
