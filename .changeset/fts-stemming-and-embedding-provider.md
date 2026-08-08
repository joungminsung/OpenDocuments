---
"opendocuments-core": patch
"opendocuments-server": patch
---

Fix two retrieval defects.

- FTS5 now uses Porter stemming. Under the previous `unicode61` tokenizer a query for `authenticate` scored zero hits against a chunk containing "authentication", as did `rotate`/`rotates`, `debug`/`debugging` and `fail`/`failed`. Because the lexical leg feeds one half of the hybrid RRF merge, those misses dropped candidates out of retrieval rather than merely reordering them. The migration rebuilds the index in place from the existing rows, so no re-embedding or reindex is required.

- `model.embeddingProvider` was consulted only when the main provider could not embed at all, so it was silently ignored for providers like Ollama and OpenAI that can. Embedding dimensions are resolved from that same setting, so a config pairing an Ollama LLM with a different embedder created the vector collection at the override's width and then filled it with the main provider's vectors. The ingest pipeline now also takes the embedder explicitly rather than scanning the plugin registry, which would otherwise pick whichever provider registered first and index through a different model than retrieval queries with.
