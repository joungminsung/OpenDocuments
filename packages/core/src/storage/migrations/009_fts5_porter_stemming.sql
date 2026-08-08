-- Switch the FTS5 index to Porter stemming.
--
-- The original `unicode61` tokenizer matches surface forms only, so a query for
-- "authenticate" scored zero hits against a chunk containing "authentication",
-- as did "rotate"/"rotates", "debug"/"debugging" and "fail"/"failed". Since the
-- lexical leg feeds one half of the hybrid RRF merge, those misses removed
-- candidates from retrieval entirely rather than merely reordering them.
--
-- `porter unicode61` layers the Porter stemmer over the same character-class
-- tokenizer, so tokenization is unchanged and only the stem folding is added.
--
-- An FTS5 table's tokenizer is fixed at creation, so the index is rebuilt.
-- chunks_fts is a standalone (non-external-content) table holding both chunk_id
-- and content, so the existing rows are copied across without touching LanceDB
-- or re-embedding anything.
CREATE VIRTUAL TABLE chunks_fts_porter USING fts5(
  chunk_id,
  content,
  tokenize='porter unicode61'
);

INSERT INTO chunks_fts_porter (chunk_id, content)
  SELECT chunk_id, content FROM chunks_fts;

DROP TABLE chunks_fts;

ALTER TABLE chunks_fts_porter RENAME TO chunks_fts;
