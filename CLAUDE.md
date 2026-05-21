# CLAUDE.md

## Project Overview

OpenDocuments는 자체 호스팅 RAG(Retrieval-Augmented Generation) 플랫폼이다. GitHub, Notion, Google Drive 등 다양한 소스의 문서를 인덱싱하고, 자연어로 질문하면 출처와 함께 답변을 제공한다.

- **Repository**: https://github.com/joungminsung/OpenDocuments
- **License**: MIT
- **Node.js**: >= 20.0.0
- **Package Manager**: npm@10.0.0
- **Build Orchestrator**: Turborepo v2.3.0
- **Language**: TypeScript 5.5+ (strict mode, ESM)

---

## Monorepo Structure

```
packages/          # 핵심 패키지 (5개)
  core/            # 비즈니스 로직 전체 (RAG, ingest, storage, auth, plugin system)
  server/          # HTTP API (Hono), MCP server, auth middleware, widget
  cli/             # CLI 17개 명령어 (Commander.js) - npm 글로벌 패키지 'opendocuments'
  web/             # React SPA (Vite + Tailwind) - private, npm 배포 안 함
  client/          # TypeScript SDK (@opendocuments/client)

plugins/           # 플러그인 (21개)
  model-*/         # 5개: ollama, openai, anthropic, google, grok
  parser-*/        # 9개: pdf, docx, xlsx, html, jupyter, email, code, pptx
  connector-*/     # 8개: github, notion, gdrive, s3, confluence, swagger, web-crawler, web-search

docs-site/         # VitePress 문서 사이트 (GitHub Pages 자동 배포)
```

---

## Common Commands

```bash
npm run setup          # install + build (처음 클론 시)
npm run build          # turbo build (전체)
npm run test           # turbo test (51 suites, ~300 tests)
npm run dev            # watch mode (전체)
npm run typecheck      # turbo typecheck

# 특정 패키지만
npx turbo build --filter=opendocuments-core
npx turbo test --filter=opendocuments-core
```

---

## Code Conventions

### TypeScript

- **strict mode** 필수 (`tsconfig.base.json`)
- **ESM**: 모든 import에 `.js` 확장자 필수
  ```typescript
  import { sha256 } from './utils/hash.js'    // O
  import { sha256 } from './utils/hash'        // X
  ```
- `any` 사용 금지 (web UI 제외). `unknown` 또는 명시적 타입 사용
- 공개 API에는 JSDoc 작성

### Naming

| 대상 | 규칙 | 예시 |
|------|------|------|
| 파일 | kebab-case | `document-store.ts` |
| 클래스 | PascalCase | `DocumentStore` |
| 함수/변수 | camelCase | `getDocumentBySourcePath` |
| 상수 | UPPER_SNAKE_CASE | `MAX_ALERTS` |
| DB 컬럼 | snake_case | `workspace_id` |
| 환경변수 | UPPER_SNAKE_CASE | `OPENDOCUMENTS_DATA_DIR` |
| CLI 명령어 | kebab-case | `auth create-key` |

### CLI Output

- **이모지 금지** - `log` 유틸리티의 ANSI 기호 사용:
  ```typescript
  import { log } from '@opendocuments/core'
  log.ok('Success')      // [ok]  green
  log.fail('Error')      // [!!]  red
  log.info('Info')        // [--]  blue
  log.arrow('Next step')  // [->]  cyan
  log.wait('Processing') // [..]  yellow
  ```

### Error Handling

- 중요 경로에서 에러를 삼키지 말 것 - 최소한 로깅
- 사용자 대상 에러는 actionable하게 (무엇이 잘못됐고 + 어떻게 고치는지)
- 프로덕션에서 내부 세부사항 노출 금지 (stack trace, 내부 경로 등)

### Security

- API 키/시크릿 하드코딩 금지 - 환경변수 사용
- SQL 쿼리는 parameterized statements (`?`)
- LanceDB 필터는 `buildWhereClause()` 사용 (raw string interpolation 금지)
- FTS5 쿼리는 `escapeFTS5Query()` 사용 (raw user input 금지)
- team mode에서 새 HTTP 엔드포인트는 auth middleware 보호 필수
- 에러 응답에 stack trace 포함 금지

---

## Testing

- **Framework**: Vitest (Jest-compatible)
- **파일 위치**: 각 패키지 내 `tests/` 디렉토리
- **파일명**: `*.test.ts`
- **globals 활성화**: `describe`, `it`, `expect`, `vi` import 불필요
- **DB 테스트**: 실제 SQLite (`:memory:`) + 실제 LanceDB (temp dir) 사용
- **외부 API**: `vi.stubGlobal('fetch', ...)` 로 mock
- 테스트 간 독립성 유지 (shared state 금지, `beforeEach`에서 초기화)
- happy path + error path 모두 테스트
- 리소스 정리 필수 (`afterEach`에서 DB close, temp dir 삭제)

---

## Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/) 사용:

```
<type>(<scope>): <description>
```

**Types**: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`

**Scopes**: `core`, `server`, `cli`, `web`, `client`, 또는 생략 (다중 패키지)

```
feat(core): add intent classification
fix(server): escape FTS5 query input
docs: update README with use cases
```

---

## Versioning & Release

[Changesets](https://github.com/changesets/changesets) 사용.

### Package Names & npm 배포

| 패키지 | npm 이름 | 현재 버전 |
|--------|----------|-----------|
| core | `opendocuments-core` | 0.2.0 |
| server | `opendocuments-server` | 0.2.0 |
| cli | `opendocuments` (글로벌 bin) | 0.2.1 |
| client | `@opendocuments/client` | 0.2.0 |
| web | `@opendocuments/web` | private (배포 안 함) |
| model-* | `opendocuments-model-{provider}` | 0.1.0~0.1.2 |
| parser-* | `opendocuments-parser-{format}` | 0.1.0 |
| connector-* | `@opendocuments/connector-{type}` | 0.1.0 |

### Version Bump 기준

| 범위 | 조건 | 예시 |
|------|------|------|
| patch (0.1.**x**) | 버그 수정, 문서 업데이트 | FTS5 쿼리 이스케이핑 수정 |
| minor (0.**x**.0) | 새 기능, 새 플러그인 | Google Drive connector 추가 |
| major (**x**.0.0) | 브레이킹 변경 | 플러그인 인터페이스 변경 |

### Plugin Compatibility

모든 플러그인은 `coreVersion: '^0.1.0'` 선언. core minor 업데이트 시 기존 플러그인과 하위 호환성 유지 필수.

---

## Version Release Checklist

버전을 올릴 때 아래 단계를 순서대로 수행한다.

### Phase 1: 코드 준비

- [ ] feature 브랜치의 모든 작업이 완료되었는지 확인
- [ ] `npm run build` 성공 확인
- [ ] `npm run typecheck` 성공 확인
- [ ] `npm run test` 전체 통과 확인 (51 suites, ~300 tests)

### Phase 2: 코드 리뷰 (3회 반복)

최종 품질 보장을 위해 전체 변경 사항에 대해 코드 리뷰를 3회 반복한다.

**1차 리뷰 - 기능 및 정확성:**
- [ ] 변경된 모든 파일의 로직이 정확한지 확인
- [ ] 엣지 케이스 처리 확인
- [ ] 에러 핸들링이 적절한지 확인
- [ ] 새 기능에 테스트가 있는지 확인
- [ ] 발견된 이슈 수정

**2차 리뷰 - 보안 및 성능:**
- [ ] SQL injection, XSS 등 보안 취약점 점검
- [ ] parameterized query 사용 여부 확인
- [ ] API 키/시크릿 하드코딩 여부 점검
- [ ] 불필요한 `any` 타입 사용 여부 점검
- [ ] N+1 쿼리, 불필요한 루프 등 성능 이슈 점검
- [ ] 발견된 이슈 수정

**3차 리뷰 - 코드 스타일 및 일관성:**
- [ ] naming convention 준수 확인
- [ ] import 경로에 `.js` 확장자 포함 확인
- [ ] CLI output에 이모지 대신 `log` 유틸리티 사용 확인
- [ ] JSDoc이 공개 API에 작성되었는지 확인
- [ ] 불필요한 console.log, TODO, 디버깅 코드 제거 확인
- [ ] 발견된 이슈 수정

### Phase 3: Changeset 생성

```bash
npx changeset
# 1. 영향 받는 패키지 선택 (spacebar로 토글)
# 2. bump 타입 선택: patch / minor / major
# 3. 변경 요약 작성
```

생성된 `.changeset/*.md` 파일을 커밋에 포함한다.

### Phase 4: 버전 범프

```bash
npx changeset version
```

이 명령은:
- 선택된 패키지의 `package.json` 버전을 범프
- `CHANGELOG.md`에 엔트리를 자동 생성/업데이트
- workspace 내 의존성 버전도 업데이트

### Phase 5: CHANGELOG 검토 및 보완

- [ ] `CHANGELOG.md`에 자동 생성된 내용이 정확한지 확인
- [ ] 필요 시 수동으로 보완 (Added / Fixed / Changed 섹션 정리)
- [ ] 날짜 형식이 `[version] - YYYY-MM-DD`인지 확인

### Phase 6: README 업데이트

- [ ] 새 기능이 README의 해당 섹션에 반영되었는지 확인
- [ ] "Recent Improvements" 섹션 업데이트
- [ ] 새 플러그인 추가 시 지원 포맷/소스 테이블 업데이트
- [ ] 모델 목록 변경 시 Model Providers 테이블 업데이트
- [ ] 새 CLI 명령어 추가 시 CLI 섹션 업데이트
- [ ] MCP 도구 수 변경 시 MCP 섹션 업데이트
- [ ] 테스트 수 변경 시 Architecture 테이블 업데이트
- [ ] docs-site의 관련 문서도 함께 업데이트

### Phase 7: 최종 빌드 & 테스트

```bash
npm run build && npm run typecheck && npm run test
```

- [ ] 빌드 성공
- [ ] 타입체크 성공
- [ ] 전체 테스트 통과

### Phase 8: 커밋 & PR

```bash
git add -A
git commit -m "chore: release v{VERSION}"
git push origin {branch}
# GitHub에서 PR 생성 -> main으로 머지
```

- [ ] CI (GitHub Actions) 통과 확인 (Node 20 + 22)
- [ ] PR 리뷰 및 승인
- [ ] squash merge into main

### Phase 9: npm 배포

```bash
npx changeset publish
```

이 명령은 변경된 모든 public 패키지를 npm에 배포한다.

배포 후 확인:
- [ ] `npm info opendocuments` 로 CLI 패키지 버전 확인
- [ ] `npm info opendocuments-core` 로 core 패키지 버전 확인
- [ ] 변경된 플러그인 패키지들의 버전 확인
- [ ] `npm install -g opendocuments@latest` 로 설치 테스트

### Phase 10: GitHub Release

- [ ] main 브랜치에서 새 버전 태그 생성: `git tag v{VERSION}`
- [ ] 태그 푸시: `git push origin v{VERSION}`
- [ ] GitHub Releases에서 릴리즈 노트 작성 (CHANGELOG 내용 기반)

### Phase 11: docs-site 확인

- [ ] docs-site 변경 사항이 있으면 GitHub Pages 자동 배포 확인
- [ ] 배포된 문서 사이트에서 내용 확인

---

## Architecture Notes

- **모든 비즈니스 로직은 core에** - server는 프로토콜 변환 레이어일 뿐
- **모든 것이 플러그인** - parser, connector, model, middleware 모두 동일한 인터페이스
- **Config as Code** - `opendocuments.config.ts`가 유일한 설정 소스 (jiti로 런타임 로드)
- **Event-driven** - 컴포넌트 간 TypedEventBus (18개 이벤트 타입) 통신
- **Storage 추상화** - SQLite + LanceDB (인터페이스 뒤에 있어 교체 가능)

---

## CI/CD

- **CI**: `.github/workflows/ci.yml` - push to main, PR to main 시 실행
  - Node.js 20, 22 매트릭스 테스트
  - build -> typecheck -> lint -> test
- **Docs**: `.github/workflows/docs.yml` - docs-site 변경 시 GitHub Pages 자동 배포
- **자동 npm 배포 워크플로우 없음** - 수동으로 `npx changeset publish` 실행

---

## Developing Without Ollama

Ollama 없이도 개발 가능. 모델 프로바이더 미설치 시 bootstrap이 자동으로 stub models로 폴백.
실제 모델 출력에 의존하는 기능(답변 품질 테스트 등)에만 실제 LLM 필요.
