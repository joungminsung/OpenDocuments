# Search Quality And Accuracy

OpenDocuments is designed to improve answer accuracy by grounding each response in retrieved source chunks instead of relying only on the language model.

## 한국어 데모 요약

OpenDocuments의 정확도는 모델 자체의 기억이 아니라 인덱싱된 문서 검색 결과에 기반합니다. 질문이 들어오면 semantic vector search, keyword search, retrieval profile, reranking, source citation, confidence score를 통해 답변 근거를 구성합니다. 답변에는 출처가 붙기 때문에 사용자는 어떤 문서와 어떤 섹션을 근거로 답했는지 확인할 수 있습니다.

정확도를 높이려면 질문과 관련된 문서가 실제로 인덱싱되어 있어야 합니다. GitHub connector의 경우 README만 인덱싱하면 답변 근거가 README에 제한됩니다. GitHub connector 구현을 설명하려면 `plugins/connector-github/src/index.ts`와 `packages/core/src/connector/manager.ts` 같은 핵심 파일도 인덱싱해야 합니다.

면접에서 "정확도는 어떻게 보장하나요?", "검색 품질은 어떻게 높이나요?", "출처 기반 답변은 어떻게 동작하나요?"라고 물으면 이 문서를 근거로 답하면 됩니다.

Accuracy controls:

- Source-grounded generation: answers include citations from indexed documents.
- Hybrid retrieval: semantic vector search is combined with keyword search when the selected profile enables it.
- Reranking: retrieved chunks can be rescored before they are passed to the model.
- Parent-document recall: the system can recover broader context around a matched chunk.
- Retrieval profiles: `fast`, `balanced`, and `precise` trade latency for deeper recall.
- Confidence scoring: each answer receives a confidence level and reason.
- Hash-based re-indexing: unchanged GitHub files are skipped, while changed files are re-indexed.

Why citations matter:

The answer should be treated as useful only when the cited sources support it. In the web UI, sources show the document name, match score, heading, and source path. GitHub-backed documents use paths such as `github://owner/repo/path`, while bundled demo documents use `/demo-docs/...`.

How to improve retrieval during a demo:

- Ask specific questions such as "GitHub connector는 자동 수집을 어떻게 하나요?"
- Use the `fast` profile during the bundled interview demo because the corpus is small and the direct source match is easier to explain.
- Use the `precise` profile for larger corpora or harder architecture questions where broader recall matters more than latency.
- Connect narrower GitHub path filters first, such as `docs/` and key source folders, instead of indexing an entire repository.
- Add documents that explain the product's current implemented behavior, because RAG quality depends on what has been indexed.

Important limitation:

RAG accuracy is not magic. If the indexed corpus does not contain the detail, the model can only infer or answer weakly. For example, if GitHub indexing only includes `README.md`, then questions about connector internals will mostly cite README sections. Indexing `plugins/connector-github/src/`, `packages/core/src/connector/`, and server admin routes gives the system better evidence for GitHub implementation questions.

Interview positioning:

The strongest accuracy story is that OpenDocuments exposes the full chain: source connector, parser, chunking, embedding model, vector store, keyword search, retrieval profile, cited generation, and confidence score. This makes the system debuggable. When an answer is weak, you can inspect whether the missing piece is the corpus, retrieval, reranking, or generation.
