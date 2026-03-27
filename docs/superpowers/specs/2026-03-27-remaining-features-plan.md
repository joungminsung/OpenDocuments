# OpenDocuments 잔여 기능 상세 기획

> Phase 1-3 완료 후 최종 리뷰 기반. 미구현/부분 구현 기능의 상세 기획.

---

## 현재 상태: 스펙 대비 ~65% 구현 완료

### 완료된 핵심 흐름
- init → index → ask → answer (CLI + Web UI + MCP)
- 5개 LLM 프로바이더 (Ollama, OpenAI, Anthropic, Google, Grok)
- 8개 파서 (MD, TXT, PDF, DOCX, XLSX, HTML, Jupyter, Email)
- 7개 커넥터 (GitHub, Notion, GDrive, S3, Confluence, Web Crawler, Web Search)
- 보안 (API Key, RBAC, PII 마스킹, 감사 로그, Rate Limiting)
- RAG 고도화 (의도분류, 질의분해, 다국어, 리랭킹, 할루시네이션가드, 캐시)
- 문서관리 (버전관리, 태그, 컬렉션, 청크 관계, Soft Delete)

---

## 버그 수정 (즉시)

### CRITICAL (3건)

| # | 이슈 | 수정 방법 |
|---|------|----------|
| C1 | SecurityAlertManager가 audit_logs 쿼리하지만 감사 로깅이 비활성화되면 항상 0 | alerts.ts에서 자체 이벤트 카운터를 유지하거나, audit 비활성화 시에도 카운트만 별도 추적 |
| C2 | handleDirect 반환 타입이 동기인데 향후 비동기 변경 시 문제 | `async` 키워드 추가하여 `Promise<QueryResult>` 반환으로 통일 |
| C3 | 위젯이 apiKey/workspace 파라미터 무시 | iframe src에 query params로 전달, 또는 postMessage API 사용 |

### IMPORTANT (8건)

| # | 이슈 | 수정 방법 |
|---|------|----------|
| I1 | deleteByFilter raw string 인터페이스 | 구조화된 filter 객체로 인터페이스 변경 |
| I2 | 웹 검색이 RAG 엔진에 미연결 | engine.ts에서 WebSearchProvider 로드 + 결과 병합 |
| I3 | tagRoutes/collectionRoutes가 매 요청 새 인스턴스 생성 | AppContext에 인스턴스 추가 |
| I4 | connector-web-search 네이밍 혼란 | 디렉토리를 `plugins/search-tavily/`로 이동하거나 JSDoc 강화 |
| I5 | RAGCache.size getter 부작용 | `cleanup()` 메서드 분리 |
| I6 | MCP Resources 미구현 | Resources 핸들러 추가 |
| I7 | config set 미구현 | jiti로 TS 파일 수정 또는 JSON override 파일 생성 |
| I8 | Dockerfile 플러그인 미복사 | COPY 명령어에 plugins/ 추가 |

---

## 미구현 기능 상세 기획

### P-1. 웹 검색 RAG 통합 (HIGH Priority)

**현재 상태:** WebSearchProvider 플러그인 존재, RAG 엔진에 TODO

**구현 계획:**
1. `RAGEngineOptions`에 `webSearchProvider?: WebSearchProvider` 추가
2. bootstrap에서 Tavily API key 설정 시 자동 로드
3. engine.ts `retrieveWithFeatures()`에서:
   - `profile.features.webSearch === true` → 항상 웹 검색 병합
   - `profile.features.webSearch === 'fallback'` → RAG 결과 < 3개일 때만 웹 검색
4. 웹 검색 결과를 SearchResult 형태로 변환 후 RRF 병합
5. L3 웹 검색 캐시 적용
6. 테스트: 3건 (항상 병합, fallback 조건, 캐시 히트)

### P-2. Sparse/Lexical 검색 (HIGH Priority)

**현재 상태:** Dense 벡터 검색만 구현

**구현 계획:**
1. SQLite FTS5 가상 테이블 생성 (migration 006):
   ```sql
   CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
     chunk_id, content, tokenize='unicode61'
   );
   ```
2. 인제스트 시 FTS5 테이블에도 삽입
3. Retriever에서:
   - Dense 검색 (LanceDB, k=20)
   - Sparse 검색 (FTS5 MATCH, k=20)
   - RRF 병합 → top-20
4. 기존 `reciprocalRankFusion` 활용
5. 테스트: 4건

### P-3. 코드 파서 플러그인 (HIGH Priority)

**현재 상태:** 미구현

**구현 계획:**
1. `plugins/parser-code/` 생성
2. tree-sitter Node.js 바인딩 사용 (또는 regex 기반 경량 파서)
3. 지원 언어: JavaScript/TypeScript, Python, Java, Go, Rust
4. 청킹 전략:
   - 함수/클래스 단위 분리 (정규식: `function`, `class`, `def`, `func`)
   - 각 코드 블록에 import/dependency 추출
   - 주변 주석을 context로 부착
5. supportedTypes: `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.java`, `.go`, `.rs`
6. 테스트: 6건

### P-4. CLI Document 서브커맨드 (MEDIUM Priority)

**구현 계획:**
```
opendocuments document list              # 인덱싱된 문서 목록
opendocuments document get <id>          # 문서 상세 (청크 포함)
opendocuments document delete <id>       # 소프트 삭제
opendocuments document restore <id>      # 복원
opendocuments document reindex <id>      # 재인덱싱
```

### P-5. CLI Workspace 서브커맨드 (MEDIUM Priority)

**구현 계획:**
```
opendocuments workspace create <name> [--mode personal|team]
opendocuments workspace list
opendocuments workspace switch <name>
opendocuments workspace delete <name>
```
- 현재 워크스페이스를 `.opendocuments/current-workspace` 파일로 추적
- 모든 CLI 커맨드가 현재 워크스페이스 컨텍스트에서 동작

### P-6. OAuth 라우트 연결 (MEDIUM Priority)

**현재 상태:** OAuthProvider 클래스 존재, 서버 라우트 없음

**구현 계획:**
1. `packages/server/src/http/routes/auth.ts` 생성
2. `GET /auth/login/:provider` → 리다이렉트
3. `GET /auth/callback/:provider` → 토큰 교환 → API Key 자동 생성 → 세션 쿠키
4. Web UI 로그인 페이지에 Google/GitHub 버튼 추가

### P-7. WebSocket 채팅 엔드포인트 (MEDIUM Priority)

**구현 계획:**
1. `@hono/node-ws` 설치
2. `packages/server/src/http/ws.ts` 구현
3. `ws://host/api/v1/ws/chat` 엔드포인트
4. 프로토콜:
   ```
   Client → Server: { type: "query", payload: { query, profile, conversationId, filters? } }
   Server → Client: { type: "chunk", payload: { text } }
   Server → Client: { type: "sources", payload: { sources } }
   Server → Client: { type: "done", payload: { conversationId } }
   Server → Client: { type: "error", payload: { code, message } }
   ```

### P-8. Web UI 추가 페이지 (MEDIUM Priority)

**필요한 페이지:**
1. **Document Detail** (`/documents/:id`) -- 청크 뷰어, 버전 히스토리, 태그 관리
2. **Connectors** (`/connectors`) -- 커넥터 목록, 동기화 상태, 추가 위저드
3. **Plugins** (`/plugins`) -- 설치된 플러그인, 마켓플레이스 브라우저
4. **Workspaces** (`/workspaces`) -- 워크스페이스 목록, 멤버 관리
5. **Login** (`/login`) -- 팀 모드 로그인 (API Key 또는 OAuth)

### P-9. MCP 확장 (LOW Priority)

**추가 도구:**
- `opendocuments_document_get`, `opendocuments_document_upload`, `opendocuments_document_delete`
- `opendocuments_config_get`, `opendocuments_config_set`
- `opendocuments_workspace_list`, `opendocuments_workspace_switch`

**MCP Resources:**
- `opendocuments://documents` → 문서 목록
- `opendocuments://documents/{id}` → 문서 상세
- `opendocuments://stats` → 시스템 통계

### P-10. 추가 파서 (LOW Priority)

| 파서 | 라이브러리 | 우선순위 |
|------|-----------|---------|
| .json/.yaml/.toml | 빌트인 JSON + yaml/toml 패키지 | HIGH (스펙 MVP) |
| .zip | 빌트인 zlib + 재귀 파싱 | MEDIUM |
| .pptx | officegen 또는 XML 파싱 | MEDIUM |
| .hwp/.hwpx | LibreOffice CLI 변환 | LOW (한국 전용) |

### P-11. 파일 워치 (LOW Priority)

**구현 계획:**
1. `chokidar` 패키지 설치
2. `opendocuments index --watch ./docs` 시 파일 변경 감지
3. 변경/추가된 파일 자동 재인덱싱
4. 삭제된 파일 자동 소프트 삭제
5. ConnectorPlugin.watch() 인터페이스와 통합

### P-12. 오픈소스 릴리즈 인프라 (HIGH Priority)

| 항목 | 설명 |
|------|------|
| LICENSE | MIT (이미 존재 확인 필요) |
| CHANGELOG.md | Changesets 기반 자동 생성 |
| CONTRIBUTING.md | 기여 가이드 |
| CODE_OF_CONDUCT.md | Contributor Covenant |
| .github/workflows/ci.yml | lint + typecheck + test |
| .github/workflows/release.yml | Changesets → npm publish |
| .github/ISSUE_TEMPLATE/ | 버그 리포트, 기능 요청 |
| .github/PULL_REQUEST_TEMPLATE.md | PR 체크리스트 |

---

## 실행 우선순위 (권장)

### 즉시 수정 (1일)
1. 버그 수정 C1-C3, I1-I8
2. Dockerfile 플러그인 복사

### 릴리즈 준비 (2-3일)
3. P-12: 오픈소스 릴리즈 인프라
4. P-10 (json/yaml/toml 파서) -- 스펙 MVP 누락분
5. P-1: 웹 검색 RAG 통합

### 핵심 기능 보완 (1주)
6. P-2: Sparse/Lexical 검색
7. P-3: 코드 파서 플러그인
8. P-4: CLI document 서브커맨드
9. P-5: CLI workspace 서브커맨드

### 완성도 향상 (2주)
10. P-6: OAuth 라우트
11. P-7: WebSocket
12. P-8: Web UI 추가 페이지
13. P-9: MCP 확장
14. P-11: 파일 워치
