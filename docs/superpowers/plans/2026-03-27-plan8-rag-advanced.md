# Plan 8: RAG Advanced Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve RAG quality with intent classification, multi-query decomposition, cross-lingual search, reranking, hallucination guard, and L1/L2/L3 caching.

**Architecture:** All features integrate into the existing RAGEngine pipeline stages. Feature flags from RAG profiles control activation. New modules in `packages/core/src/rag/`.

**Depends on:** Plan 7 complete (218 tests passing)

---

## Task 1: Intent Classification

Classify queries into: code | concept | config | data | search | compare | general.
Uses simple keyword/pattern matching (no LLM call for classification).

- Create `packages/core/src/rag/intent.ts`
- Wire into RAGEngine to replace hardcoded 'general'
- Intent-specific prompts already exist in generator.ts
- 6 tests

## Task 2: Multi-Query Decomposition

Split complex queries into sub-queries, search each, merge results.
Only active when `profile.features.queryDecomposition` is true (precise profile).

- Create `packages/core/src/rag/decomposer.ts`
- Wire into RAGEngine between query parse and retrieve
- 4 tests

## Task 3: Cross-Lingual Query Expansion

Expand queries to include translations (ko↔en) for bilingual document search.
Active when `profile.features.crossLingual` is true.

- Create `packages/core/src/rag/cross-lingual.ts`
- Expand query → search with all variants → merge via RRF
- 4 tests

## Task 4: Reranker

Cross-encoder style reranking using the LLM to score relevance.
Active when `profile.features.reranker` is true.

- Create `packages/core/src/rag/reranker.ts`
- Uses ModelPlugin.rerank() if available, else LLM-based scoring
- 4 tests

## Task 5: Hallucination Guard

Verify each sentence in the answer is grounded in retrieved sources.
Active when `profile.features.hallucinationGuard` is true/'strict'.

- Create `packages/core/src/rag/grounding.ts`
- Post-generation check, adds warnings for ungrounded sentences
- 4 tests

## Task 6: Caching (L1/L2/L3)

- L1: Query cache (in-memory, 5min TTL) -- skip RAG for identical queries
- L2: Embedding cache (disk, 24h TTL) -- avoid re-embedding
- L3: Web search cache (disk, 1h TTL) -- avoid duplicate web searches

- Create `packages/core/src/rag/cache.ts`
- Wire into RAGEngine and IngestPipeline
- 5 tests

## Task 7: Integration + Profile Wiring

- Wire all features into RAGEngine with profile flag checks
- Verify fast/balanced/precise profiles activate correct features
- Full integration test
