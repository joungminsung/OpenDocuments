import { extname } from 'node:path'
import type { DocumentStore } from './document-store.js'
import type { PluginRegistry } from '../plugin/registry.js'
import type { EventBus } from '../events/bus.js'
import type { MiddlewareRunner } from './middleware.js'
import { dispatchChunk } from './chunk-strategies.js'
import { sha256 } from '../utils/hash.js'
import type { StoredChunk } from './document-store.js'
import type { ParsedChunk, RawDocument, ParserPlugin } from '../plugin/interfaces.js'
import type { OpenDocumentsConfig } from '../config/schema.js'
import type { PIIRedactor } from '../security/redactor.js'
import type { DocumentVersionManager } from '../document/version-manager.js'

export interface IngestInput {
  title: string
  content: string | Buffer
  sourceType: string
  sourcePath: string
  fileType?: string
  connectorId?: string
}

export interface IngestResult {
  documentId: string
  chunks: number
  status: 'indexed' | 'skipped' | 'error'
}

export interface IngestPipelineOptions {
  store: DocumentStore
  registry: PluginRegistry
  eventBus: EventBus
  middleware: MiddlewareRunner
  embeddingDimensions: number
  config?: OpenDocumentsConfig
  redactor?: PIIRedactor
  versionManager?: DocumentVersionManager
}

const BATCH_SIZE = 32

export class IngestPipeline {
  private redactor?: PIIRedactor

  constructor(private opts: IngestPipelineOptions) {
    this.redactor = opts.redactor
  }

  private async parseWithFallback(
    raw: RawDocument,
    fileExt: string,
    config?: OpenDocumentsConfig
  ): Promise<ParsedChunk[]> {
    const { registry } = this.opts

    // Try primary parser first
    const primaryParser = registry.findParserForType(fileExt)
    if (primaryParser) {
      try {
        const chunks: ParsedChunk[] = []
        for await (const chunk of primaryParser.parse(raw)) {
          chunks.push(chunk)
        }
        if (chunks.length > 0) return chunks
      } catch (err) {
        console.warn(`[parse] Primary parser failed for ${fileExt}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Try fallback chain
    const fallbacks = config?.parserFallbacks?.[fileExt] || []
    for (const fallbackName of fallbacks) {
      const fallbackParser = registry.get(fallbackName)
      if (!fallbackParser || fallbackParser.type !== 'parser') continue
      try {
        const chunks: ParsedChunk[] = []
        for await (const chunk of (fallbackParser as ParserPlugin).parse(raw)) {
          chunks.push(chunk)
        }
        if (chunks.length > 0) return chunks
      } catch (err) {
        console.warn(`[parse] Fallback parser '${fallbackName}' failed for ${fileExt}: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
    }

    throw new Error(`No parser found for ${fileExt}`)
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const { store, registry, eventBus, middleware } = this.opts
    const contentHash = sha256(input.content)

    // Check for existing document by sourcePath
    const existing = store.getDocumentBySourcePath(input.sourcePath)
    if (existing) {
      if (!store.hasContentChanged(existing.id, contentHash)) {
        return { documentId: existing.id, chunks: existing.chunk_count ?? 0, status: 'skipped' }
      }
      // Content changed -- delete old document first
      await store.hardDeleteDocument(existing.id)
    }

    // Create new document record
    const fileType = input.fileType ?? extname(input.sourcePath)
    const { id: documentId } = store.createDocument({
      title: input.title,
      sourceType: input.sourceType,
      sourcePath: input.sourcePath,
      fileType,
      connectorId: input.connectorId,
    })

    try {
      // Build RawDocument for parser
      const rawDoc: RawDocument = {
        sourceId: documentId,
        title: input.title,
        content: input.content,
        mimeType: undefined,
        metadata: { sourcePath: input.sourcePath, sourceType: input.sourceType },
      }

      eventBus.emit('document:fetched', { documentId })

      // Apply before:parse middleware
      await middleware.run('before:parse', rawDoc)

      // Parse document with fallback chain
      const parsedChunks = await this.parseWithFallback(rawDoc, fileType, this.opts.config)

      // Apply after:parse middleware
      await middleware.run('after:parse', parsedChunks)

      // PII redaction: scrub parsed chunk content before chunking/embedding
      if (this.redactor?.isEnabled()) {
        for (const chunk of parsedChunks) {
          chunk.content = this.redactor.redact(chunk.content)
        }
      }

      eventBus.emit('document:parsed', { documentId, chunks: parsedChunks.length })

      // Apply before:chunk middleware
      await middleware.run('before:chunk', parsedChunks)

      // Resolve embedder early -- semantic chunking needs it
      const models = registry.getModels()
      const embeddingModel = models.find(m => m.capabilities.embedding && m.embed)
      const embedFn = embeddingModel?.embed?.bind(embeddingModel) ?? null

      // Embedder is required to index; bail early if missing
      if (!embeddingModel || !embedFn) {
        store.updateStatus(documentId, 'error', 'No embedding model available')
        return { documentId, chunks: 0, status: 'error' }
      }

      // Chunk: dispatch based on file type + parser-reported chunkType.
      // Markdown/prose use semantic sentence-level splitting; code/table/api pass through;
      // data files (JSON/YAML) use paragraph chunking.
      const finalChunks: StoredChunk[] = []
      for (const parsed of parsedChunks) {
        const textChunks = await dispatchChunk(parsed.content, {
          fileType,
          chunkType: parsed.chunkType,
          embed: embedFn,
        })
        for (const tc of textChunks) {
          finalChunks.push({
            content: tc.content,
            embedding: [],
            chunkType: parsed.chunkType,
            position: finalChunks.length,
            tokenCount: tc.tokenCount,
            headingHierarchy: tc.headingHierarchy.length > 0
              ? tc.headingHierarchy
              : (parsed.headingHierarchy ?? []),
            language: parsed.language,
            codeSymbols: parsed.codeSymbols,
          })
        }
      }

      // Apply after:chunk middleware
      await middleware.run('after:chunk', finalChunks)

      eventBus.emit('document:chunked', { documentId, chunks: finalChunks.length })

      // Embed all chunks in batches of BATCH_SIZE
      const texts = finalChunks.map(c => c.content)
      const allEmbeddings: number[][] = []

      let expectedDim: number | null = null
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE)
        const result = await embedFn(batch)
        if (result.dense.length !== batch.length) {
          throw new Error(
            `Embedding count mismatch: sent ${batch.length} texts, got ${result.dense.length} embeddings`
          )
        }
        // Validate consistent dimensions across batches
        for (const vec of result.dense) {
          if (expectedDim === null) {
            expectedDim = vec.length
          } else if (vec.length !== expectedDim) {
            throw new Error(
              `Embedding dimension mismatch: expected ${expectedDim}D, got ${vec.length}D`
            )
          }
        }
        allEmbeddings.push(...result.dense)
      }

      // Assign embeddings to chunks
      const chunksWithEmbeddings: StoredChunk[] = finalChunks.map((chunk, i) => ({
        ...chunk,
        embedding: allEmbeddings[i] ?? [],
      }))

      eventBus.emit('document:embedded', { documentId, chunks: chunksWithEmbeddings.length })

      // Store chunks in DocumentStore
      await store.storeChunks(documentId, chunksWithEmbeddings)

      // Update content hash
      store.updateContentHash(documentId, contentHash)

      // Record version if version manager is configured
      if (this.opts.versionManager) {
        this.opts.versionManager.recordVersion(documentId, contentHash, chunksWithEmbeddings.length)
      }

      eventBus.emit('document:indexed', { documentId, chunks: chunksWithEmbeddings.length })

      return { documentId, chunks: chunksWithEmbeddings.length, status: 'indexed' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      store.updateStatus(documentId, 'error', message)
      eventBus.emit('document:error', { documentId, error: message })
      return { documentId, chunks: 0, status: 'error' }
    }
  }
}
