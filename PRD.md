# DocuMind — PRD (Product Requirements Document)

> **셀프호스팅 가능한 오픈소스 기술 문서 RAG 검색 엔진**
> 분산된 개발 문서를 하나로 통합하고, 자연어로 질의하면 코드 예시와 함께 정확한 답변을 제공합니다.

---

## 1. Project Overview

| 항목 | 내용 |
|------|------|
| **프로젝트명** | DocuMind |
| **한줄 요약** | 사내/개인 기술 문서를 통합 인덱싱하여 자연어 Q&A를 제공하는 셀프호스팅 RAG 플랫폼 |
| **목적** | 포트폴리오 강화 (풀스택 RAG 엔지니어링 역량 증명) |
| **타겟 사용자** | 개인 개발자, 소규모 팀, 오픈소스 프로젝트 메인테이너 |
| **라이선스** | MIT (오픈소스) |
| **프로젝트 기간** | 3개월+ (장기 프로젝트) |

---

## 2. Problem Statement

### 현재 문제
- 기술 문서가 GitHub Wiki, Notion, README, Swagger, 로컬 파일 등 **5곳 이상에 분산**
- 필요한 정보를 찾기 위해 **평균 3~5개 소스를 수동 탐색**
- 코드 예시가 문서에 있어도 **키워드 검색으로는 관련 코드를 찾기 어려움**
- 기존 도구 (Ctrl+F, grep, GitHub Search)는 **의미 기반 검색 불가**

### DocuMind가 해결하는 것
- 모든 문서 소스를 **단일 벡터 인덱스로 통합**
- **자연어 질의** → 관련 문서 청크 검색 → LLM이 코드 예시와 함께 답변 생성
- **코드-문서 하이브리드 청킹**으로 코드 블록의 맥락을 보존

---

## 3. Core Features

### Phase 1: MVP (Week 1~4)
- [ ] **F-001** 문서 수집 (Ingest) 파이프라인
  - 마크다운/MDX 파일 로컬 디렉토리 스캔
  - 단일 파일 업로드 (PDF, DOCX, HWP, XLSX, TXT)
  - 자동 청킹 + 벡터 임베딩 + Qdrant 저장
- [ ] **F-002** 자연어 Q&A 채팅
  - 질문 입력 → Hybrid Retrieval (sparse + dense) → Reranking → LLM 답변
  - 답변에 **출처 문서 링크 + 관련 코드 블록** 포함
  - 스트리밍 응답 (SSE/WebSocket)
- [ ] **F-003** 기본 웹 UI
  - 채팅 인터페이스 (React)
  - 문서 소스 관리 대시보드
  - 인덱싱 상태 모니터

### Phase 2: 커넥터 확장 (Week 5~8)
- [ ] **F-004** GitHub 커넥터
  - README, Wiki, Issues, Discussions 크롤링
  - GitHub API 연동 + Webhook 기반 실시간 동기화
  - `.md`, `.mdx`, `.rst` 자동 인식
- [ ] **F-005** Notion 커넥터
  - Notion API 연동
  - 페이지/데이터베이스 재귀 크롤링
  - 블록 타입별 파싱 (텍스트, 코드, 테이블, 토글)
- [ ] **F-006** Swagger/OpenAPI 파서
  - JSON/YAML OpenAPI spec 파싱
  - 엔드포인트별 청킹 (path + method + description + schema)
  - 요청/응답 예시 자동 추출
- [ ] **F-007** 고급 파일 업로드
  - 드래그 앤 드롭 멀티파일 업로드
  - ZIP 아카이브 자동 해제 + 재귀 인덱싱
  - 파일 타입별 아이콘 + 미리보기

### Phase 3: 고도화 (Week 9~12+)
- [ ] **F-008** 코드-인식 하이브리드 청킹 v2
  - AST 기반 코드 블록 분리 (Python, JS/TS, Java, Go)
  - 함수/클래스 단위 청킹 + 주변 문서 컨텍스트 결합
  - 코드 블록 내 import/dependency 추적
- [ ] **F-009** 대화 히스토리 + 후속 질문
  - 멀티턴 대화 컨텍스트 유지
  - "이전 질문에서 말한 그 함수" 같은 참조 해소
- [ ] **F-010** 관리자 대시보드
  - 문서별 인덱싱 통계 (청크 수, 임베딩 수, 마지막 동기화)
  - 검색 품질 모니터링 (히트율, 관련성 점수 분포)
  - 사용자별 질의 로그
- [ ] **F-011** 권한 관리
  - Workspace 단위 문서 격리
  - API Key 기반 인증
  - 문서 소스별 접근 권한

---

## 4. System Architecture

### 4.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                     Data Sources                             │
│  GitHub │ Notion │ Local FS │ Swagger │ File Upload          │
└────┬────┴────┬───┴────┬─────┴────┬────┴────┬────────────────┘
     │         │        │          │         │
     ▼         ▼        ▼          ▼         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Ingest Pipeline                            │
│  Connector → Parser (LlamaIndex) → Chunker → Embedder       │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐
   │ PostgreSQL │ │   Redis    │ │   Qdrant   │
   │ (metadata) │ │  (cache)   │ │ (vectors)  │
   └──────┬─────┘ └─────┬──────┘ └─────┬──────┘
          │              │              │
          ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                     RAG Engine                               │
│  Query Parser → Hybrid Retriever → Reranker → Generator      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Ollama (Qwen 3.5) │
              │   + BGE-M3 Embedder │
              └─────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FastAPI Backend (REST + WS) │ Celery Worker │ React Frontend│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 컴포넌트별 상세

#### A. Connectors (문서 수집기)

| 커넥터 | 데이터 소스 | 동기화 방식 | 우선순위 |
|--------|------------|------------|---------|
| `LocalFSConnector` | 로컬 디렉토리 (MD, MDX, TXT) | 파일 워치 (watchdog) | P0 |
| `FileUploadConnector` | 업로드 파일 (PDF, DOCX, HWP, XLSX) | 즉시 처리 | P0 |
| `GitHubConnector` | README, Wiki, Issues, Discussions | Webhook + 폴링 | P1 |
| `NotionConnector` | 페이지, 데이터베이스 | Polling (5분 주기) | P1 |
| `SwaggerConnector` | OpenAPI JSON/YAML | 수동 트리거 | P1 |

#### B. Parser (문서 파서)

```python
# 파서 라우팅 로직
PARSER_MAP = {
    ".md":    MarkdownParser,       # 커스텀 (코드 펜스 인식)
    ".mdx":   MDXParser,            # 커스텀 (JSX 컴포넌트 분리)
    ".pdf":   LlamaIndexPDFParser,  # LlamaIndex SimpleDirectoryReader
    ".docx":  LlamaIndexDocxParser, # LlamaIndex DocxReader
    ".hwp":   HWPParser,            # pyhwp 기반 커스텀
    ".xlsx":  ExcelParser,          # openpyxl 기반 커스텀
    ".json":  SwaggerParser,        # OpenAPI spec 전용
    ".yaml":  SwaggerParser,
    ".txt":   PlainTextParser,
}
```

#### C. Chunker (핵심 차별화 포인트)

**하이브리드 청킹 전략:**

```
Document
├── Text Section
│   └── Semantic Chunking (512 tokens, 50 token overlap)
│       - 문단/섹션 경계 존중
│       - 헤딩 계층 구조 메타데이터 보존
│
├── Code Block (fenced ```...```)
│   └── Code-Aware Chunking
│       - AST 파싱 시도 → 함수/클래스 단위 분리
│       - AST 실패 시 → 줄바꿈 기반 분리 (max 256 tokens)
│       - 코드 블록 직전/직후 텍스트를 context로 부착
│
├── API Endpoint (Swagger)
│   └── Endpoint-Level Chunking
│       - 1 endpoint = 1 chunk
│       - path + method + summary + parameters + response schema
│
└── Table / Structured Data
    └── Row-Group Chunking
        - 헤더 + N rows (max 512 tokens)
        - 테이블 제목/캡션을 각 청크에 부착
```

**청크 메타데이터 스키마:**

```typescript
interface ChunkMetadata {
  chunk_id: string;           // UUID
  document_id: string;        // 원본 문서 참조
  source_type: SourceType;    // "github" | "notion" | "local" | "upload" | "swagger"
  source_path: string;        // 원본 경로/URL
  chunk_type: ChunkType;      // "text" | "code" | "api_endpoint" | "table"
  language?: string;          // 코드 청크인 경우 프로그래밍 언어
  heading_hierarchy: string[]; // ["# Setup", "## Installation"]
  position: number;           // 문서 내 청크 순서
  token_count: number;
  created_at: string;         // ISO 8601
  updated_at: string;
}
```

#### D. Embedding Model

| 항목 | 선택 | 이유 |
|------|------|------|
| **모델** | BGE-M3 (BAAI) | 한국어+영어 다국어 지원, 로컬 실행 가능, dense+sparse 동시 출력 |
| **서빙** | Ollama | Qwen과 동일 런타임, Docker 통합 용이 |
| **차원** | 1024 | BGE-M3 기본 차원 |
| **Sparse** | BGE-M3 lexical weights | BM25 대비 학습된 sparse 가중치 → 더 정확한 키워드 매칭 |

#### E. RAG Engine (검색 + 생성)

```
User Query
    │
    ▼
┌──────────────┐
│ Query Parser │ ── 의도 분류 (코드 질문 vs 개념 질문 vs 설정 질문)
│              │ ── 쿼리 재작성 (약어 확장, 오타 보정)
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Hybrid Retriever │
│ ┌──────────────┐ │
│ │ Dense Search │ │ ── Qdrant cosine similarity (BGE-M3 dense)
│ │ k=20         │ │
│ ├──────────────┤ │
│ │ Sparse Search│ │ ── Qdrant sparse vectors (BGE-M3 lexical)
│ │ k=20         │ │
│ └──────────────┘ │
│   Reciprocal Rank│ ── RRF로 두 결과 병합 → top-20
│   Fusion (RRF)   │
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│   Reranker   │ ── Cross-encoder 기반 재정렬 (bge-reranker-v2-m3)
│   top-20→top-5│ ── 20개 → 5개로 필터링
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Generator   │ ── 프롬프트 템플릿 + 컨텍스트 주입
│  (Qwen 3.5)  │ ── 스트리밍 응답 (SSE)
│              │ ── 출처 인용 포맷팅
└──────────────┘
```

**프롬프트 템플릿 (Generator):**

```
You are DocuMind, a technical documentation assistant.
Answer the user's question based ONLY on the provided context.
If the context doesn't contain enough information, say so honestly.

## Context
{retrieved_chunks}

## Source Metadata
{chunk_metadata_list}

## Rules
1. Always cite sources using [Source: filename#section] format
2. Include relevant code examples from the context when available
3. If multiple sources conflict, mention all versions
4. Respond in the same language as the user's question

## User Question
{query}
```

---

## 5. Tech Stack

### Backend
| 레이어 | 기술 | 버전 | 역할 |
|--------|------|------|------|
| **API Framework** | FastAPI | 0.115+ | REST API + WebSocket (SSE 스트리밍) |
| **Task Queue** | Celery + Redis | 5.4+ | 비동기 문서 인덱싱 작업 |
| **ORM** | SQLAlchemy | 2.0+ | PostgreSQL 메타데이터 관리 |
| **Doc Parsing** | LlamaIndex | 0.12+ | PDF, DOCX 등 범용 파서 |
| **HWP Parsing** | pyhwp | 0.1+ | 한글 문서 파싱 |
| **AST Parsing** | tree-sitter | 0.23+ | 코드 블록 AST 분석 |

### AI / ML
| 레이어 | 기술 | 역할 |
|--------|------|------|
| **LLM** | Qwen 3.5 via Ollama | 답변 생성 |
| **Embedding** | BGE-M3 via Ollama | Dense + Sparse 임베딩 |
| **Reranker** | bge-reranker-v2-m3 | Cross-encoder 재정렬 |
| **Vector DB** | Qdrant | 벡터 + sparse 벡터 저장/검색 |

### Frontend
| 레이어 | 기술 | 버전 | 역할 |
|--------|------|------|------|
| **Framework** | React | 19 | SPA |
| **Build** | Vite | 6+ | 번들링 |
| **Language** | TypeScript | 5.5+ | 타입 안전성 |
| **Styling** | Tailwind CSS | 4+ | 유틸리티 CSS |
| **State** | Zustand | 5+ | 클라이언트 상태 |
| **Markdown** | react-markdown + rehype | - | 답변 렌더링 |
| **Code Highlight** | Shiki | 1+ | 코드 블록 하이라이팅 |

### Infrastructure
| 레이어 | 기술 | 역할 |
|--------|------|------|
| **Container** | Docker Compose | 전체 스택 오케스트레이션 |
| **DB** | PostgreSQL 16 | 메타데이터, 사용자, 문서 이력 |
| **Cache** | Redis 7 | Celery 브로커 + 쿼리 캐시 |
| **Vector DB** | Qdrant (Docker) | 벡터 저장소 |
| **LLM Runtime** | Ollama (Docker/Native) | 모델 서빙 |

---

## 6. API Design

### 6.1 REST Endpoints

```yaml
# === Chat ===
POST   /api/v1/chat                    # 질문 + 스트리밍 응답
GET    /api/v1/chat/history             # 대화 히스토리 조회
DELETE /api/v1/chat/history/{id}        # 대화 삭제

# === Documents ===
POST   /api/v1/documents/upload         # 파일 업로드 (multipart)
GET    /api/v1/documents                # 인덱싱된 문서 목록
GET    /api/v1/documents/{id}           # 문서 상세 (청크 목록 포함)
DELETE /api/v1/documents/{id}           # 문서 + 관련 벡터 삭제
POST   /api/v1/documents/reindex/{id}   # 재인덱싱 트리거

# === Connectors ===
POST   /api/v1/connectors               # 커넥터 등록 (GitHub, Notion 등)
GET    /api/v1/connectors                # 등록된 커넥터 목록
PUT    /api/v1/connectors/{id}           # 커넥터 설정 수정
DELETE /api/v1/connectors/{id}           # 커넥터 삭제
POST   /api/v1/connectors/{id}/sync     # 수동 동기화 트리거
GET    /api/v1/connectors/{id}/status    # 동기화 상태 조회

# === Admin ===
GET    /api/v1/admin/stats               # 시스템 통계
GET    /api/v1/admin/search-quality      # 검색 품질 메트릭
GET    /api/v1/admin/query-logs          # 질의 로그
```

### 6.2 WebSocket

```typescript
// Chat streaming
ws://host/api/v1/ws/chat

// Client → Server
{
  type: "query",
  payload: {
    query: string,
    conversation_id?: string,
    filters?: {
      source_types?: SourceType[],
      languages?: string[],
      date_range?: { from: string, to: string }
    }
  }
}

// Server → Client (streaming)
{ type: "chunk",    payload: { text: string } }
{ type: "sources",  payload: { sources: SourceRef[] } }
{ type: "done",     payload: { conversation_id: string } }
{ type: "error",    payload: { code: string, message: string } }
```

---

## 7. Database Schema

### PostgreSQL

```sql
-- 문서 메타데이터
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    source_type VARCHAR(50) NOT NULL,  -- 'github', 'notion', 'local', 'upload', 'swagger'
    source_path TEXT NOT NULL,
    connector_id UUID REFERENCES connectors(id),
    file_type VARCHAR(20),
    file_size_bytes BIGINT,
    chunk_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'indexing', 'indexed', 'error'
    error_message TEXT,
    content_hash VARCHAR(64),  -- SHA-256 (변경 감지용)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    indexed_at TIMESTAMPTZ
);

-- 커넥터 설정
CREATE TABLE connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,  -- 'github', 'notion', 'local_fs', 'swagger'
    config JSONB NOT NULL,      -- 커넥터별 설정 (API key, repo URL 등)
    sync_interval_minutes INTEGER DEFAULT 30,
    last_synced_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 대화 히스토리
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- 'user', 'assistant'
    content TEXT NOT NULL,
    sources JSONB,              -- 답변에 사용된 출처 목록
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 질의 로그 (검색 품질 추적)
CREATE TABLE query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    retrieved_chunk_ids UUID[],
    reranked_chunk_ids UUID[],
    retrieval_score_avg FLOAT,
    rerank_score_avg FLOAT,
    response_time_ms INTEGER,
    feedback VARCHAR(10),  -- 'positive', 'negative', NULL
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Qdrant Collection

```python
# Collection 설정
{
    "collection_name": "documind_chunks",
    "vectors": {
        "dense": {
            "size": 1024,        # BGE-M3 dense dimension
            "distance": "Cosine"
        }
    },
    "sparse_vectors": {
        "sparse": {
            "modifier": "idf"    # BGE-M3 sparse (lexical weights)
        }
    },
    "payload_schema": {
        "document_id": "keyword",
        "source_type": "keyword",
        "chunk_type": "keyword",
        "language": "keyword",
        "heading_hierarchy": "keyword[]",
        "position": "integer",
        "created_at": "datetime"
    }
}
```

---

## 8. Frontend Spec

### 8.1 페이지 구조

```
/                       → 채팅 (메인)
/documents              → 문서 관리
/documents/:id          → 문서 상세 (청크 뷰어)
/connectors             → 커넥터 관리
/connectors/new         → 커넥터 추가
/admin                  → 관리자 대시보드
/settings               → 설정 (LLM, 임베딩 모델 등)
```

### 8.2 채팅 UI 요구사항

- 마크다운 렌더링 (헤딩, 리스트, 테이블)
- 코드 블록 구문 하이라이팅 (Shiki) + 복사 버튼
- 답변 내 **출처 인용 링크** (클릭 시 원본 문서로 이동)
- 스트리밍 타이핑 애니메이션
- 소스 필터링 UI (어떤 소스에서 검색할지 선택)
- 답변 피드백 (👍👎) → query_logs.feedback 저장

### 8.3 디자인 시스템

- 컬러: White/Blue 기본 팔레트, 다크 모드 지원
- 타이포: 시스템 폰트 + monospace (코드)
- 레이아웃: 사이드바 (문서/커넥터 네비게이션) + 메인 (채팅/콘텐츠)
- 컴포넌트: Tailwind CSS 유틸리티 기반, shadcn/ui 참고

---

## 9. Docker Compose 배포

```yaml
# docker-compose.yml (개략)
version: "3.9"

services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL=postgresql://documind:password@postgres:5432/documind
      - REDIS_URL=redis://redis:6379/0
      - QDRANT_URL=http://qdrant:6333
      - OLLAMA_URL=http://ollama:11434
    depends_on: [postgres, redis, qdrant, ollama]

  celery-worker:
    build: ./backend
    command: celery -A app.worker worker --loglevel=info
    depends_on: [redis, postgres, qdrant]

  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      - POSTGRES_DB=documind
      - POSTGRES_USER=documind
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]

  qdrant:
    image: qdrant/qdrant:v1.12.1
    ports: ["6333:6333"]
    volumes: ["qdrantdata:/qdrant/storage"]

  ollama:
    image: ollama/ollama:latest
    ports: ["11434:11434"]
    volumes: ["ollama_models:/root/.ollama"]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  pgdata:
  redisdata:
  qdrantdata:
  ollama_models:
```

---

## 10. 디렉토리 구조

```
documind/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py                 # FastAPI entry
│   │   ├── config.py               # 환경변수 + 설정
│   │   ├── worker.py               # Celery worker
│   │   │
│   │   ├── api/
│   │   │   ├── router.py           # API 라우터 등록
│   │   │   ├── chat.py             # /chat 엔드포인트
│   │   │   ├── documents.py        # /documents 엔드포인트
│   │   │   ├── connectors.py       # /connectors 엔드포인트
│   │   │   └── admin.py            # /admin 엔드포인트
│   │   │
│   │   ├── connectors/
│   │   │   ├── base.py             # BaseConnector ABC
│   │   │   ├── github.py           # GitHubConnector
│   │   │   ├── notion.py           # NotionConnector
│   │   │   ├── local_fs.py         # LocalFSConnector
│   │   │   ├── file_upload.py      # FileUploadConnector
│   │   │   └── swagger.py          # SwaggerConnector
│   │   │
│   │   ├── ingest/
│   │   │   ├── pipeline.py         # 인제스트 파이프라인 오케스트레이터
│   │   │   ├── parser.py           # 파서 라우터 + 커스텀 파서
│   │   │   ├── chunker.py          # 하이브리드 청커 (핵심)
│   │   │   └── embedder.py         # BGE-M3 임베딩 래퍼
│   │   │
│   │   ├── rag/
│   │   │   ├── engine.py           # RAG 엔진 메인 클래스
│   │   │   ├── query_parser.py     # 쿼리 의도 분류 + 재작성
│   │   │   ├── retriever.py        # Hybrid Retriever (dense + sparse + RRF)
│   │   │   ├── reranker.py         # Cross-encoder reranker
│   │   │   └── generator.py        # 프롬프트 조립 + LLM 호출
│   │   │
│   │   ├── db/
│   │   │   ├── models.py           # SQLAlchemy 모델
│   │   │   ├── session.py          # DB 세션 관리
│   │   │   └── migrations/         # Alembic 마이그레이션
│   │   │
│   │   └── services/
│   │       ├── qdrant.py           # Qdrant 클라이언트 래퍼
│   │       ├── ollama.py           # Ollama API 래퍼
│   │       └── redis.py            # Redis 캐시/큐 래퍼
│   │
│   └── tests/
│       ├── test_chunker.py
│       ├── test_retriever.py
│       └── test_pipeline.py
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/
│   │   │   ├── ChatPage.tsx
│   │   │   ├── DocumentsPage.tsx
│   │   │   ├── ConnectorsPage.tsx
│   │   │   └── AdminPage.tsx
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   ├── SourceCard.tsx
│   │   │   │   └── StreamingText.tsx
│   │   │   ├── documents/
│   │   │   │   ├── DocumentList.tsx
│   │   │   │   ├── UploadZone.tsx
│   │   │   │   └── ChunkViewer.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       └── Header.tsx
│   │   ├── stores/
│   │   │   ├── chatStore.ts
│   │   │   └── documentStore.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # API 클라이언트
│   │   │   ├── ws.ts               # WebSocket 관리
│   │   │   └── types.ts            # 공용 타입
│   │   └── styles/
│   │       └── globals.css
│   └── public/
│
└── docs/
    ├── ARCHITECTURE.md
    ├── DEVELOPMENT.md
    └── DEPLOYMENT.md
```

---

## 11. 3-Month Roadmap

### Phase 1: Foundation (Week 1~4)
| Week | 마일스톤 | 주요 작업 |
|------|---------|----------|
| W1 | 프로젝트 셋업 | Docker Compose, DB 스키마, FastAPI 보일러플레이트, React 프로젝트 초기화 |
| W2 | 인제스트 파이프라인 v1 | LocalFS 커넥터, MD 파서, 기본 시맨틱 청킹, BGE-M3 임베딩, Qdrant 저장 |
| W3 | RAG 엔진 v1 | Dense 검색, 기본 프롬프트 템플릿, Ollama Qwen 연동, 스트리밍 응답 |
| W4 | 채팅 UI v1 | 채팅 인터페이스, 마크다운 렌더링, 코드 하이라이팅, 출처 표시 |

**✅ Phase 1 완료 기준:** 로컬 MD 파일을 인덱싱하고 자연어로 질문 → 답변 + 출처를 받을 수 있음

### Phase 2: Connectors (Week 5~8)
| Week | 마일스톤 | 주요 작업 |
|------|---------|----------|
| W5 | 파일 업로드 + 파서 확장 | PDF/DOCX/HWP/XLSX 업로드, LlamaIndex 파서 통합, 업로드 UI |
| W6 | GitHub 커넥터 | GitHub API 연동, Webhook 설정, README/Wiki/Issues 크롤링 |
| W7 | Notion + Swagger | Notion API 연동, Swagger/OpenAPI 파싱, 커넥터 관리 UI |
| W8 | Hybrid Retrieval | Sparse 검색 추가, RRF 병합, Reranker 통합, 검색 품질 A/B 테스트 |

**✅ Phase 2 완료 기준:** 5개 소스 모두 연동, Hybrid Retrieval + Reranking 동작

### Phase 3: Polish (Week 9~12+)
| Week | 마일스톤 | 주요 작업 |
|------|---------|----------|
| W9 | 코드-인식 청킹 v2 | tree-sitter AST 기반 코드 청킹, 함수/클래스 단위 분리 |
| W10 | 멀티턴 대화 | 대화 히스토리 컨텍스트, 후속 질문, 대화 관리 UI |
| W11 | 관리자 대시보드 | 인덱싱 통계, 검색 품질 메트릭, 질의 로그 뷰어 |
| W12 | 배포 + 문서화 | README 정비, CONTRIBUTING.md, GitHub Actions CI, 데모 영상 |

**✅ Phase 3 완료 기준:** 프로덕션 수준의 셀프호스팅 가능한 오픈소스 도구

---

## 12. Success Metrics

| 메트릭 | 목표 | 측정 방법 |
|--------|------|----------|
| **Retrieval Hit Rate** | ≥ 85% | 질의에 대해 관련 문서가 top-5에 포함되는 비율 |
| **Answer Relevance** | ≥ 4.0 / 5.0 | 사용자 피드백 (👍👎) 기반 |
| **Indexing Throughput** | ≥ 100 docs/min | 배치 인덱싱 속도 |
| **Query Latency (P95)** | ≤ 5초 | 쿼리 → 첫 토큰 응답까지 (로컬 LLM 기준) |
| **GitHub Stars** | ≥ 100 (6개월) | 오픈소스 트랙션 |

---

## 13. Risks & Mitigations

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| Qwen 3.5 한국어 품질 이슈 | 답변 품질 저하 | 프롬프트 최적화 + 대안 모델 (EXAONE, Solar) 핫스왑 지원 |
| HWP 파싱 불안정 | 한글 문서 인덱싱 실패 | pyhwp 실패 시 LibreOffice CLI 변환 fallback |
| 로컬 GPU 메모리 부족 | LLM + Embedding 동시 실행 불가 | Quantization (Q4_K_M) + 임베딩은 CPU fallback |
| Qdrant 대용량 성능 | 100만+ 청크에서 지연 | HNSW 파라미터 튜닝 + 페이로드 인덱스 최적화 |

---

## 14. Claude Code Handoff Notes

### 개발 시작 순서 (권장)

```bash
# 1. 프로젝트 초기화
mkdir documind && cd documind
# Docker Compose + .env 설정

# 2. 백엔드 보일러플레이트
# FastAPI + SQLAlchemy + Alembic + Celery

# 3. Qdrant 컬렉션 생성 스크립트

# 4. 인제스트 파이프라인 (chunker.py가 핵심)

# 5. RAG 엔진 (retriever.py → reranker.py → generator.py)

# 6. API 엔드포인트

# 7. 프론트엔드
```

### 핵심 구현 포인트
1. `chunker.py` — 코드-문서 하이브리드 청킹이 이 프로젝트의 **기술적 차별점**. 가장 먼저, 가장 신중하게 구현
2. `retriever.py` — BGE-M3의 dense + sparse 출력을 모두 활용하는 RRF 병합 로직
3. `generator.py` — 프롬프트 템플릿 + 출처 인용 포맷이 사용자 경험의 핵심

### 테스트 데이터
- Phase 1 테스트: 이 PRD 자체를 마크다운으로 인덱싱해서 질의 테스트
- Phase 2 테스트: 오픈소스 프로젝트 (예: FastAPI 공식 문서) GitHub 연동