# GitHub Connector

The GitHub connector lets OpenDocuments ingest repository documentation and selected source files into the same RAG index as local files.

## 한국어 데모 요약

GitHub 자동 수집 기능은 연결된 저장소를 주기적으로 읽어 변경된 문서를 다시 인덱싱하는 기능입니다. OpenDocuments는 GitHub 저장소의 파일 목록을 읽고, path filter에 맞는 파일만 가져와 chunking, embedding, indexing을 수행합니다. 자동 수집은 `syncInterval` 값에 따라 polling 방식으로 실행되며, 변경되지 않은 파일은 content hash 비교로 skip합니다.

면접에서 "GitHub 검색이 어떻게 되나요?", "GitHub 자동 수집이 되나요?", "GitHub 문서는 어떻게 인덱싱되나요?"라고 물으면 이 문서를 근거로 답하면 됩니다.

Current demo configuration:

- Repository: `joungminsung/OpenDocuments`
- Branch: `main`
- Sync mode: automatic polling plus manual sync
- Default polling interval: 60 seconds in the running demo
- Authentication: public repositories work without a token; private repositories require a GitHub Personal Access Token
- Path filters can restrict ingestion to specific files or folders such as `README.md`, `docs/`, `packages/core/src/rag/`, or `plugins/connector-github/src/`

GitHub ingestion flow:

1. The admin UI sends repository, branch, token, path filters, and sync interval to the server.
2. The server creates the `@opendocuments/connector-github` plugin and stores the connector config in SQLite.
3. The connector checks GitHub connectivity with the repository API.
4. During sync, it reads the recursive Git tree for the selected branch.
5. It filters files by path prefix and supported extension.
6. It fetches matching file contents through the GitHub contents API.
7. The ingest pipeline parses, chunks, embeds, and stores the documents.
8. The connector compares content hashes on later syncs, so unchanged files are skipped.

Automatic collection:

When a GitHub connector is registered, the server starts a background timer using the saved `syncInterval`. On every interval, OpenDocuments reads GitHub again and updates `lastSyncedAt`. If GitHub reports the same content hash, the document is not re-embedded. If the hash changes, the document is re-fetched and re-indexed.

What this proves in a demo:

- OpenDocuments is not only answering from bundled sample text.
- It can connect to a live GitHub repository.
- It can use repository content as cited answer sources.
- It can keep GitHub-backed documents fresh without pressing the sync button every time.
- The same RAG pipeline handles local documents and GitHub documents.

Known next step:

The current automatic collection uses polling. A production-grade GitHub integration could add GitHub webhooks or a GitHub App so pushes trigger sync immediately instead of waiting for the next interval.
