# opendocuments-core

## [Unreleased]

### Added
- Structure-preserving chunking: fenced code blocks, pipe tables, and heading+first-paragraph units stay atomic during chunking.
- Document-type-aware chunk dispatcher (markdown / code / table / data / prose / api) with per-strategy token budgets.
- Contextual Retrieval: LLM-authored 1-2 sentence situating prefix is prepended to each chunk before embedding (behind `features.contextualRetrieval` profile flag).
- HyDE: hypothetical passage generation for query-side retrieval (behind `features.hyde`).
- Multi-query paraphrase expansion (`features.multiQuery`, count via `features.multiQueryN`).
- Parent-document retrieval: chunks carry `parentSection` metadata; `attachParentContext()` swaps chunk content for the enclosing heading section (behind `features.parentDocRetrieval`).
- Proposition + hypothetical-question chunk augmentation added to the FTS5 index only for improved recall on question-style queries (behind `features.chunkAugmentation`).
- Cross-encoder LLM reranker — pairwise scoring of top-K (behind `features.crossEncoder`).
- RAG evaluation harness: `hitAtK`, `reciprocalRank`, `nDCG`, `evaluate(engine, cases)` plus a 10-case bilingual gold dataset.

### Changed
- `IngestPipeline.ingest()` now accepts an optional options arg: `{ contextualRetrieval?: boolean; chunkAugmentation?: boolean }`.
- `StoredChunk` and `SearchResult` gained optional `contextualPrefix` and `parentSection` fields.
- `chunkText()` now flushes chunks at heading boundaries so each chunk belongs to a single section.

### Fixed
- Pipeline now actually uses `semanticChunkText()` when an embedding model is registered; previously the function existed but was never invoked from the pipeline.
