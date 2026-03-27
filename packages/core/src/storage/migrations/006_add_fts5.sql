CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id,
  content,
  tokenize='unicode61'
);
