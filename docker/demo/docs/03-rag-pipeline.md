# RAG Pipeline

The RAG flow starts with ingestion.

## 한국어 데모 요약

OpenDocuments의 RAG 파이프라인은 문서 수집, 파싱, 청킹, 임베딩, 저장, 검색, 답변 생성 순서로 동작합니다. 커넥터나 로컬 파일에서 원본 문서를 가져오고, 파서가 문서를 청크로 변환한 뒤, 파일 유형에 맞는 청킹 전략을 적용합니다. 이후 모델 플러그인이 임베딩을 만들고, 메타데이터는 SQLite에, 벡터는 LanceDB에 저장합니다.

사용자가 질문하면 semantic vector search, FTS5 keyword search, reranking, HyDE, multi-query retrieval, cross-lingual query expansion, parent-document recall 같은 검색 기술을 선택한 프로필에 따라 조합합니다. 마지막으로 답변 생성기가 검색된 청크를 근거로 출처가 포함된 답변을 만듭니다.

1. A connector or local file provides raw content.
2. A parser turns the raw document into parsed chunks.
3. The chunking layer uses file-aware strategies for prose, code, tables, and structured data.
4. Optional contextual retrieval can add situating context to chunks before embedding.
5. Embeddings are created through a model plugin.
6. Metadata is written to SQLite and vectors are written to LanceDB.
7. Search combines semantic retrieval, FTS5 keyword search, reranking, HyDE, multi-query retrieval, cross-lingual query expansion, and parent-document recall depending on the selected profile.
8. The answer generator produces a grounded response with source citations.

Retrieval profiles:

- `fast`: lower latency, fewer retrieval features.
- `balanced`: default profile for good quality and reasonable speed.
- `precise`: deeper retrieval, reranking, and broader recall for harder questions.

The important engineering decision is that retrieval is not a single vector search call. The system uses multiple recall and ranking techniques so answers remain useful across code, documentation, spreadsheets, policies, and mixed-language content.
