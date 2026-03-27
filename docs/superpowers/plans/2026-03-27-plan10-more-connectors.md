# Plan 10: Additional Connectors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Add connectors for Google Drive, S3/GCS, Confluence, and email (.eml/.msg) to expand document source coverage.

**Depends on:** Plan 9 complete

---

## Task 1: Google Drive Connector
- Uses Google Drive API v3 (fetch, list files)
- discover(): list docs/sheets/presentations in a folder
- fetch(): export as text/HTML
- Config: { serviceAccountKey or OAuth token, folderId }
- 5 tests

## Task 2: S3/GCS Connector
- Generic object storage connector
- discover(): list objects with supported extensions
- fetch(): download object content
- Config: { provider: 's3'|'gcs', bucket, prefix, credentials }
- 5 tests

## Task 3: Confluence Connector
- Uses Confluence REST API
- discover(): list pages in a space
- fetch(): get page content (storage format → text)
- Config: { baseUrl, token, spaceKey }
- 5 tests

## Task 4: Email Connector (.eml parser)
- Parser plugin for .eml files (not a connector)
- Extracts: from, to, subject, date, body text, attachment names
- Config: none needed
- 4 tests

## Task 5: Bootstrap + file discovery update
- Auto-register new connectors
- Add .eml to supported extensions
- Run full test suite
