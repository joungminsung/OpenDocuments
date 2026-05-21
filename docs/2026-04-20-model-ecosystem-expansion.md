# OpenDocuments 모델 지원 확장 작업 정리

**브랜치**: `feat/add-more-models`
**PR**: [#9 — feat: add DeepSeek/Mistral/OpenAI-compatible providers and model CLI](https://github.com/joungminsung/OpenDocuments/pull/9)
**작업일**: 2026-04-20
**커밋**: 4개

---

## 1. 작업 배경

사용자 요청:
1. Gemma 4 같은 신규 모델 지원 가능하게
2. 모델 설치/설정 UX 개선 ("서비스가 모델을 설치해주는가?")

조사 결과, OpenDocuments는 기존에 5개 provider(Ollama/OpenAI/Anthropic/Google/Grok)만 지원했고, 모델 설치·전환은 대부분 `opendocuments.config.ts` 수동 편집이 필요했음.

---

## 2. 최종 커밋 목록

| # | 커밋 | 내용 |
|---|------|------|
| 1 | `dc0181b` | DeepSeek / Mistral / OpenAI-compatible 플러그인 3종 추가 |
| 2 | `f8a7329` | `opendocuments model` CLI 명령(5종) + init 마법사 확장 + Ollama 자동설치 |
| 3 | `f64ec4f` | `model` 명령 확장(batch pull, install-ollama, set-key) + `doctor` provider별 진단 |
| 4 | `c4c71ad` | README 모델 관리 명령 문서화 |

---

## 3. 신규 모델 플러그인 (3종)

### `plugins/model-deepseek`
- **지원 모델**: `deepseek-chat` (V3.2, 기본) / `deepseek-reasoner` (R1) / `deepseek-v4` (예정)
- **API**: OpenAI 호환 (`https://api.deepseek.com/v1`)
- **특징**: 164K context, 저렴한 reasoning ($0.26/M tokens)
- **Embedding**: 미제공 → 보조 embedder 필요 (ollama BGE-M3 권장)

### `plugins/model-mistral`
- **지원 모델**:
  - `mistral-small-latest` (Small 4, MoE — reasoning+vision+code, 기본)
  - `mistral-large-latest` (Large 2.1)
  - `codestral-latest`
  - `pixtral-large-latest`
- **API**: `https://api.mistral.ai/v1`
- **Embedding**: `mistral-embed` (1024 dim)
- **Capabilities**: llm + embedding + vision

### `plugins/model-openai-compatible`
- **지원 endpoint**: 사용자 지정
  - vLLM (`http://localhost:8000/v1`)
  - LM Studio (`http://localhost:1234/v1`)
  - Together (`https://api.together.xyz/v1`)
  - Fireworks (`https://api.fireworks.ai/inference/v1`)
  - Groq (`https://api.groq.com/openai/v1`)
  - DeepInfra, SiliconFlow, OpenRouter
- **옵션**: `extraHeaders`, `disableEmbedding`
- **환경변수**: `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`

### Gemma 4 지원
기존 `model-ollama` 플러그인으로 동작:
```bash
ollama pull gemma3:27b
# config: model.llm = 'gemma3:27b'
```

---

## 4. 신규 CLI: `opendocuments model` (7 서브커맨드)

### `model list [--suggestions]`
- 현재 config(provider/llm/embedding/baseUrl) 출력
- 설치된 Ollama 모델 목록 (이름 + 용량 + 파라미터 수 + quantization)
- `--suggestions`: 엄선된 로컬/클라우드 모델 카탈로그

### `model pull <a> <b> <c>...` (batch)
- 여러 모델 순차 다운로드
- **사전 디스크 체크**: 모델별 용량 추정 합산 + 1.5GB 여유 확인
- **진행률**: `/api/pull` 스트림을 줄 갱신으로 표시
- **실패 요약**: 끝에 실패한 모델만 별도 출력

### `model install-ollama`
- macOS/Linux: 공식 설치 스크립트(`curl -fsSL https://ollama.com/install.sh | sh`) 실행
- 설치 후 15초 내 daemon 가동 확인
- 이미 실행 중이면 skip
- Windows: 다운로드 URL 안내

### `model set-key <provider>`
- password 모드 프롬프트 또는 `--key` 인라인
- `.env` 기존 라인 **갱신** (중복 방지)
- `.gitignore`에 `.env` 없으면 경고
- 지원: openai, anthropic, google, grok, deepseek, mistral, openai-compatible

### `model test [-p prompt]`
- 현재 LLM 왕복 테스트 (지연/chunk 수 출력)
- Embedder 왕복 테스트 (dim/지연 출력)
- degraded mode 문제 즉시 감지

### `model switch`
- 대화형 provider 전환
- `opendocuments.config.ts`의 `model:` 블록만 **정확히** 재작성
- 나머지 설정은 보존

### `model rm <name>`
- Ollama 로컬 모델 삭제

---

## 5. `init` 마법사 확장

### Provider 선택지 확대
```
? Model backend:
  Local (Ollama) -- data stays on your machine
  Cloud -- OpenAI, Anthropic, Google, Grok, DeepSeek, Mistral    ← 확장
  OpenAI-compatible endpoint -- vLLM / LM Studio / Groq / ...    ← 신규
```

### API key 검증
- 기존: openai / anthropic / google
- 추가: grok / deepseek / mistral

### 보조 embedding provider
- 기존: Anthropic 전용
- 일반화: embedding API 미제공 provider 전체 (deepseek 포함)

### Ollama 자동 설치
- 미감지 시 공식 스크립트 실행 제안
- Daemon 기동 폴링 (최대 15초)

### 디스크 사전 체크
- Pull 전 모델별 용량 추정 표시
- 부족 시 경고 + 진행 여부 확인

### 모델 추천 (2026년 4월 기준)
| RAM | 추천 |
|---|---|
| 32GB+ | Gemma 3 27B (기본), Qwen 3.5 27B, Llama 4 Scout, DeepSeek R1 14B |
| 16GB | Gemma 3 12B (기본), Qwen 3.5 9B |
| < 16GB | Gemma 3 4B, Gemma 3n |

---

## 6. `doctor` 진단 확장

### 기존
- Ollama 전용 진단만 존재

### 추가
- **8개 provider 별 API ping**:
  - openai / anthropic / google / grok / deepseek / mistral / openai-compatible
  - 각자의 `/models` endpoint 호출
- **에러 구분**:
  - 401/403 → "invalid API key"
  - 네트워크 오류 → 예외 메시지
  - 환경변수 미설정 → 키 발급 URL 안내
- **보조 embedder 독립 ping**
- **Ollama 모델 체크 개선**: Ollama가 실제로 담당하는 모델만 검사 (cloud LLM + Ollama embedder 조합 시 잘못된 fail 방지)

---

## 7. 공통 유틸리티

### `packages/cli/src/utils/ollama.ts` (신규)
| 함수 | 역할 |
|---|---|
| `isOllamaRunning(url)` | `/api/tags` ping |
| `listOllamaModels(url)` | 설치된 모델 (size, params, quantization) |
| `pullOllamaModel(name, url, onProgress)` | 스트리밍 진행률 콜백과 함께 pull |
| `deleteOllamaModel(name, url)` | `/api/delete` |
| `getAvailableDiskBytes(dir)` | `statfsSync` 기반 디스크 여유 |
| `estimateModelSize(tag)` | 큐레이트된 용량 힌트 테이블 (prefix fuzzy match) |
| `getOllamaInstallCommand()` | 플랫폼별 설치 명령어 |
| `formatBytes(bytes)` | human-readable 변환 |

---

## 8. 서버 Bootstrap 수정

### `packages/server/src/bootstrap.ts`
```typescript
const PROVIDER_MAP: Record<string, string> = {
  ollama, openai, anthropic, google, grok,
  deepseek: 'opendocuments-model-deepseek',              // 신규
  mistral: 'opendocuments-model-mistral',                // 신규
  'openai-compatible': 'opendocuments-model-openai-compatible',  // 신규
}

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  ollama: 1024, openai: 1536, google: 768, grok: 1536,
  mistral: 1024,   // 신규
  default: 384,
}
```

기존 설정 **브레이킹 체인지 없음**.

---

## 9. 문서 업데이트

### `README.md`
- "Cloud Providers" 테이블에 DeepSeek / Mistral / OpenAI-compatible 추가
- "Local Models" 테이블에 Gemma 4 추가
- 모델 플러그인 카운트 5 → 8
- 관리 명령 섹션에 `model` 7종 전체 예시

### `docs-site/guide/configuration.md`
- provider 문자열 주석 확장
- DeepSeek / Mistral / openai-compatible / vLLM 예시 블록 추가
- Gemma 3/4 Ollama pull 명령 예시
- `.env` 섹션에 신규 환경변수 6개 추가

---

## 10. 테스트 결과

| 항목 | 결과 |
|---|---|
| `npm run build` | 30/30 workspaces 통과 |
| `npm run typecheck` | 통과 |
| 신규 플러그인 테스트 | 14/14 (deepseek 5 + mistral 4 + openai-compatible 5) |
| `rewriteModelBlock` 유닛 테스트 | 4/4 (cloud swap, openai-compatible + baseUrl, round-trip ollama, missing-block error) |
| 기존 `ask.test.ts` RAG flake | 변경 전 bootstrap으로도 재현 → 이번 변경과 무관 |

---

## 11. 생성/수정 파일 통계

### 신규 파일 (20개)
```
plugins/model-deepseek/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/index.ts
└── tests/deepseek.test.ts

plugins/model-mistral/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/index.ts
└── tests/mistral.test.ts

plugins/model-openai-compatible/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/index.ts
└── tests/openai-compatible.test.ts

packages/cli/src/
├── commands/model.ts                   (369 라인)
└── utils/ollama.ts                     (196 라인)

packages/cli/tests/commands/model.test.ts
```

### 수정 파일 (5개)
```
packages/server/src/bootstrap.ts        (+ provider 매핑)
packages/cli/src/commands/init.ts       (+ 신규 provider, Ollama 자동설치, 디스크 체크)
packages/cli/src/commands/doctor.ts     (+ 8 provider 진단)
packages/cli/src/index.ts               (+ modelCommand 등록)
README.md                               (+ 신규 명령 문서화)
docs-site/guide/configuration.md        (+ 신규 provider 예시)
```

### 코드 라인 수 (합산)
- 추가: 약 **2,260 라인**
- 제거: 약 **90 라인**

---

## 12. 배포 전 체크리스트

- [x] 빌드 통과
- [x] 타입체크 통과
- [x] 신규 기능 단위 테스트 추가
- [x] README / docs-site 업데이트
- [x] PR 생성 완료
- [ ] **Changeset 엔트리 추가** (3개 신규 플러그인 + CLI 업데이트) — 릴리즈 시점에
- [ ] CI (Node 20 + 22) 통과 확인 — PR 머지 전
- [ ] 수동 테스트: `init` 신규 provider 플로우
- [ ] 수동 테스트: `doctor` 실제 cloud provider 키로 ping

---

## 13. 추후 개선 후보

1. **Web UI 모델 관리 페이지** — 현재 CLI 전용
2. **Ollama 외 로컬 러너 프리셋화** — vLLM/llama.cpp 전용 init 플로우 (현재는 openai-compatible로 가능하나 수동)
3. **model pull 병렬 다운로드** — 현재 순차
4. **changeset 자동 생성** — 신규 플러그인 릴리즈 편의성
