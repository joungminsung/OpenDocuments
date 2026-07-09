# OpenDocuments Interview Demo

This folder contains a Docker Compose demo profile for interviews.

## Google Gemini demo

Put your API key in the repository root `.env` file:

```bash
GOOGLE_API_KEY=your-google-api-key
```

Then start the demo:

```bash
docker compose -f docker-compose.demo.yml up --build
open http://localhost:3333
```

Default models:

- LLM: `gemini-3.5-flash`
- Embedding: `gemini-embedding-001`
- Thinking budget: `0`

The demo disables Gemini thinking by default so streamed RAG answers stay concise
and do not lose the beginning of the response while presenting.

The compose service indexes the bundled documents in `docker/demo/docs` on first start.

You can also use OpenDocuments' generic model key in `.env`:

```bash
OPENDOCUMENTS_MODEL_API_KEY=your-google-api-key
```

## Local Ollama demo

```bash
OPENDOCUMENTS_MODEL_PROVIDER=ollama \
OPENDOCUMENTS_MODEL_LLM=gemma4:12b \
OPENDOCUMENTS_MODEL_EMBEDDING=nomic-embed-text:latest \
OPENDOCUMENTS_MODEL_BASE_URL=http://host.docker.internal:11434 \
docker compose -f docker-compose.demo.yml up --build
open http://localhost:3333
```

This connects the app container to Ollama running on the Mac through
`http://host.docker.internal:11434`.

## Override Ollama models

```bash
OPENDOCUMENTS_MODEL_PROVIDER=ollama \
OPENDOCUMENTS_MODEL_LLM=qwen3.6:27b \
OPENDOCUMENTS_MODEL_EMBEDDING=nomic-embed-text:latest \
docker compose -f docker-compose.demo.yml up --build
```

## Internal Ollama container

If you want Compose to run its own Ollama container instead of using the Mac host:

```bash
OPENDOCUMENTS_MODEL_PROVIDER=ollama \
OPENDOCUMENTS_MODEL_LLM=gemma4:12b \
OPENDOCUMENTS_MODEL_EMBEDDING=nomic-embed-text:latest \
OPENDOCUMENTS_MODEL_BASE_URL=http://ollama:11434 \
docker compose -f docker-compose.demo.yml --profile ollama up --build
```

The first internal Ollama run can take several minutes because models must be pulled.

## Cloud-backed demo

```bash
OPENDOCUMENTS_MODEL_PROVIDER=openai \
OPENDOCUMENTS_MODEL_LLM=gpt-4o-mini \
OPENDOCUMENTS_MODEL_EMBEDDING=text-embedding-3-small \
OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS=1536 \
OPENAI_API_KEY=sk-... \
docker compose -f docker-compose.demo.yml up --build
```

## Useful reset

```bash
docker compose -f docker-compose.demo.yml down -v
```

Run the reset when you switch embedding models or dimensions. The demo entrypoint
also resets its demo volume automatically when those settings change.
