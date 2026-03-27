import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DocumentVersionManager } from '../../src/document/version-manager.js'
import { TagManager } from '../../src/document/tag-manager.js'
import { CollectionManager } from '../../src/document/collection-manager.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('Document Managers', () => {
  let db: DB

  beforeEach(() => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")
    db.run("INSERT INTO documents (id, workspace_id, title, source_type, source_path) VALUES ('doc-1', 'ws-1', 'test.md', 'local', '/test.md')")
  })

  afterEach(() => db.close())

  describe('DocumentVersionManager', () => {
    it('records and lists versions', () => {
      const mgr = new DocumentVersionManager(db)
      mgr.recordVersion('doc-1', 'hash1', 10)
      mgr.recordVersion('doc-1', 'hash2', 12, { added: 2 })
      const versions = mgr.listVersions('doc-1')
      expect(versions).toHaveLength(2)
      expect(versions[0].version).toBe(2)
      expect(versions[1].version).toBe(1)
    })

    it('gets specific version', () => {
      const mgr = new DocumentVersionManager(db)
      mgr.recordVersion('doc-1', 'hash1', 10)
      const v = mgr.getVersion('doc-1', 1)
      expect(v?.contentHash).toBe('hash1')
    })
  })

  describe('TagManager', () => {
    it('creates and lists tags', () => {
      const mgr = new TagManager(db, 'ws-1')
      mgr.create('backend', '#3b82f6')
      mgr.create('frontend')
      expect(mgr.list()).toHaveLength(2)
    })

    it('tags and untags documents', () => {
      const mgr = new TagManager(db, 'ws-1')
      const tag = mgr.create('important')
      mgr.tagDocument('doc-1', tag.id)
      expect(mgr.getDocumentTags('doc-1')).toHaveLength(1)
      mgr.untagDocument('doc-1', tag.id)
      expect(mgr.getDocumentTags('doc-1')).toHaveLength(0)
    })

    it('deletes tags', () => {
      const mgr = new TagManager(db, 'ws-1')
      const tag = mgr.create('temp')
      mgr.delete(tag.id)
      expect(mgr.list()).toHaveLength(0)
    })
  })

  describe('CollectionManager', () => {
    it('creates and lists collections', () => {
      const mgr = new CollectionManager(db, 'ws-1')
      mgr.create('Backend Docs', 'All backend documentation')
      expect(mgr.list()).toHaveLength(1)
    })

    it('adds and removes documents', () => {
      const mgr = new CollectionManager(db, 'ws-1')
      const col = mgr.create('Test Collection')
      mgr.addDocument(col.id, 'doc-1')
      expect(mgr.getDocuments(col.id)).toEqual(['doc-1'])
      mgr.removeDocument(col.id, 'doc-1')
      expect(mgr.getDocuments(col.id)).toEqual([])
    })

    it('supports auto-rules', () => {
      const mgr = new CollectionManager(db, 'ws-1')
      const col = mgr.create('Auto', undefined, { source_type: 'github', tags: ['backend'] })
      const retrieved = mgr.list()
      expect(retrieved[0].autoRules).toEqual({ source_type: 'github', tags: ['backend'] })
    })
  })
})
