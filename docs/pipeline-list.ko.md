# OpenDocuments 파이프라인 목록

## 0. 사전 준비 파이프라인

- Runtime config 로드
- Environment variable 로드
- API key 환경변수 확인
- Secret 하드코딩 여부 확인
- Workspace context 확인
- Team mode 여부 확인
- Auth middleware 적용
- Workspace isolation 확인
- Plugin registry 조회
- Plugin manifest 확인
- `coreVersion` 호환성 확인
- Connector plugin 등록
- Parser plugin 등록
- Model plugin 등록
- SQLite 연결
- LanceDB 연결

## 1. 문서 수집 파이프라인

- Source config 입력
- Credential 확인
- 문서 소스 선택
- Connector plugin 선택
- Connector 초기화
- Source별 API 호출
- 외부 문서 목록 탐색
- 문서 목록 수집
- 삭제 문서 감지
- 변경 문서 감지
- 원본 문서 가져오기
- 원본 metadata 수집
- Raw document 생성
- MIME type 확인

## 2. 문서 파싱 파이프라인

- Parser plugin 선택
- Parser 매칭
- Parser 실행
- 원본 콘텐츠 파싱
- 텍스트 추출
- 문서 구조 추출
- Title 추출
- Body text 추출
- Section 정보 추출
- Source path 연결
- External id 연결
- Modified time 연결
- Normalized document 생성
- 공통 document model로 정규화
- Content hash 계산
- 변경 여부 확인

## 3. Chunking 파이프라인

- Chunk boundary 결정
- 문서 본문 chunking
- Chunk 생성
- Chunk order 부여
- Chunk 위치 정보 연결
- Citation metadata 부여
- Chunk metadata 생성
- Embedding text 준비

## 4. Embedding 파이프라인

- Embedding provider 선택
- Model plugin 초기화
- Provider credential 주입
- Chunk embedding 요청
- Embedding API 호출
- Embedding vector 수신
- Embedding dimension 확인
- Embedding result 정규화

## 5. 저장 파이프라인

- SQLite transaction 시작
- Workspace table 조회
- Document row upsert
- Chunk row upsert
- Metadata payload 저장
- FTS5 row upsert
- SQLite FTS5 index 갱신
- LanceDB vector upsert
- Job table 갱신
- SQLite transaction commit
- Indexing result 기록
- Ingest event 발행
- Ingest job 상태 갱신
- Connection 정리

## 6. 질문 입력 파이프라인

- 사용자 질문 입력
- 진입점 확인
- API key 또는 session 확인
- 인증 확인
- Workspace context 확인
- 권한 범위 확인
- Source filter 확인
- 사용자 대상 error message 준비

## 7. Query 처리 파이프라인

- Query normalization 수행
- Keyword query 준비
- FTS5 `escapeFTS5Query()` 적용
- Embedding query 준비
- Question embedding 생성
- LanceDB `buildWhereClause()` 적용
- SQL parameterized statement 적용

## 8. Retrieval 파이프라인

- LanceDB dense search 실행
- SQLite FTS5 sparse search 실행
- Dense search 결과 수집
- Sparse search 결과 수집
- 검색 결과 병합
- 중복 chunk 제거
- Workspace filter 적용
- Permission filter 적용
- Source filter 적용
- Score 계산
- Rank 보정
- Parent context 확장
- Context candidate 선택

## 9. 답변 생성 파이프라인

- Context window 크기 확인
- Context fitting 수행
- Prompt 구성
- Model plugin 선택
- Answer generation 실행
- 답변 초안 생성
- Grounding 확인
- Citation mapping 수행
- Source reference 생성
- Stack trace 응답 노출 차단
- 내부 filesystem path 응답 노출 차단
- Answer payload 생성
- 사용자에게 답변 반환

## 10. 장애 확인 파이프라인

- 실패 단계 식별
- Connector 로그 확인
- Parser 로그 확인
- Chunk 저장 여부 확인
- FTS5 index 확인
- LanceDB vector 확인
- Embedding dimension 확인
- Workspace filter 확인
- Permission filter 확인
- Citation metadata 확인
- Model provider 응답 확인
- 사용자 응답 error message 확인
- 내부 로그 보존
- 민감 정보 노출 여부 확인

## 11. 릴리즈 파이프라인

- Feature branch 작업 완료
- `npm run build` 실행
- `npm run typecheck` 실행
- `npm run test` 실행
- 1차 기능 리뷰
- Edge case 확인
- Error handling 확인
- Test coverage 확인
- 2차 보안 리뷰
- SQL injection 확인
- Secret 노출 확인
- Raw query 사용 확인
- `any` 타입 사용 확인
- 성능 이슈 확인
- 3차 스타일 리뷰
- Naming convention 확인
- ESM `.js` import 확인
- CLI `log` 유틸리티 확인
- Public API JSDoc 확인
- Debug code 제거 확인
- `npx changeset` 실행
- 영향 package 선택
- Bump type 선택
- Changeset summary 작성
- `.changeset/*.md` 확인
- `npx changeset version` 실행
- Package version 확인
- Workspace dependency 확인
- `CHANGELOG.md` 확인
- `README.md` 확인
- `README.ko.md` 확인
- `docs-site` 관련 문서 확인
- `npm run build && npm run typecheck && npm run test` 실행
- Release commit 생성
- Branch push
- PR 생성
- GitHub Actions 확인
- PR review 승인
- Main branch merge
- `npx changeset publish` 실행
- npm package version 확인
- Global install 테스트
- Git tag 생성
- Git tag push
- GitHub Release 작성
- Docs site 배포 확인
