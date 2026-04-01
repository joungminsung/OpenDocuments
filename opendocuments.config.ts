export default {
  model: {
    provider: 'ollama',
    llm: 'gemma3:4b',
    embedding: 'bge-m3',
  },
  rag: { profile: 'fast' },
  storage: {
    dataDir: '/tmp/opendocs-e2e-test/.opendocuments',
  },
}
