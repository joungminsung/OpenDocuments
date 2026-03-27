# Plan 11: Document Management Advanced Features

**Goal:** Add document versioning, tags, collections, and chunk relationships.
**Depends on:** Plan 10 complete

---

## Task 1: Document Versioning + Tags/Collections (Core)
- DocumentVersionManager: track versions with content_hash, rollback support
- TagManager: CRUD for tags, document-tag associations
- CollectionManager: CRUD for collections with auto-rules
- 8 tests

## Task 2: Chunk Relationships
- Track next/previous, parent, references between chunks
- Used by RAG context window manager for expanding context
- 3 tests

## Task 3: REST API + Web UI
- Version/tag/collection CRUD endpoints
- Web UI: tag filter in chat, collection management in documents page
- Integration test
