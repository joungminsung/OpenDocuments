import { extname } from 'node:path'
import type { DocumentStore } from './document-store.js'
import type { PluginRegistry } from '../plugin/registry.js'
import type { EventBus } from '../events/bus.js'
import type { MiddlewareRunner } from './middleware.js'
import { chunkText } from './chunker.js'
import { sha256 } from '../utils/hash.js'
import type { StoredChunk } from './document-store.js'
import type { ParsedChunk, RawDocument } from '../plugin/interfaces.js'

export interface IngestInput {
  title: string
  content: string
  sourceType: string
  sourcePath: string
  fileType?: string
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
}

const BATCH_SIZE = 32

export class IngestPipeline {
  constructor(private opts: IngestPipelineOptions) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const { store, registry, eventBus, middleware } = this.opts
    const contentHash = sha256(input.content)

    // Check for existing document by sourcePath
    const existing = store.listDocuments().find(d => d.source_path === input.sourcePath)
    if (existing) {
      if (!store.hasContentChanged(existing.id, contentHash)) {
        return { documentId: existing.id, chunks: existing.chunk_count ?? 0, status: 'skipped' }
      }
      // Content changed -- delete old document first
      await store.deleteDocument(existing.id)
    }

    // Create new document record
    const fileType = input.fileType ?? extname(input.sourcePath)
    const { id: documentId } = store.createDocument({
      title: input.title,
      sourceType: input.sourceType,
      sourcePath: input.sourcePath,
      fileType,
    })

    try {
      // Find parser by file extension
      const parser = registry.findParserForType(fileType)
      if (!parser) {
        store.updateStatus(documentId, 'error', `No parser found for file type: ${fileType}`)
        return { documentId, chunks: 0, status: 'error' }
      }

      // Build RawDocument for parser
      const rawDoc: RawDocument = {
        sourceId: documentId,
        title: input.title,
        content: input.content,
        mimeType: undefined,
        metadata: { sourcePath: input.sourcePath, sourceType: input.sourceType },
      }

      // Apply before:parse middleware
      await middleware.run('before:parse', rawDoc)

      // Parse document
      const parsedChunks: ParsedChunk[] = []
      for await (const chunk of parser.parse(rawDoc)) {
        parsedChunks.push(chunk)
      }

      // Apply after:parse middleware
      await middleware.run('after:parse', parsedChunks)

      eventBus.emit('document:parsed', { documentId, chunks: parsedChunks.length })

      // Apply before:chunk middleware
      await middleware.run('before:chunk', parsedChunks)

      // Chunk: semantic chunks go through chunkText, code chunks pass through
      const finalChunks: StoredChunk[] = []
      for (const parsed of parsedChunks) {
        if (parsed.chunkType === 'semantic') {
          const textChunks = chunkText(parsed.content)
          for (const tc of textChunks) {
            finalChunks.push({
              content: tc.content,
              embedding: [],
              chunkType: 'semantic',
              position: finalChunks.length,
              tokenCount: tc.tokenCount,
              headingHierarchy: tc.headingHierarchy.length > 0 ? tc.headingHierarchy : (parsed.headingHierarchy ?? []),
            })
          }
        } else {
          // code-ast, table, api-endpoint, etc. -- pass through directly
          finalChunks.push({
            content: parsed.content,
            embedding: [],
            chunkType: parsed.chunkType,
            position: finalChunks.length,
            tokenCount: Math.ceil(parsed.content.length / 4),
            headingHierarchy: parsed.headingHierarchy ?? [],
            language: parsed.language,
            codeSymbols: parsed.codeSymbols,
          })
        }
      }

      // Apply after:chunk middleware
      await middleware.run('after:chunk', finalChunks)

      eventBus.emit('document:chunked', { documentId, chunks: finalChunks.length })

      // Embed all chunks in batches of BATCH_SIZE
      const models = registry.getModels()
      const embeddingModel = models.find(m => m.capabilities.embedding && m.embed)
      if (!embeddingModel || !embeddingModel.embed) {
        store.updateStatus(documentId, 'error', 'No embedding model available')
        return { documentId, chunks: 0, status: 'error' }
      }

      const texts = finalChunks.map(c => c.content)
      const allEmbeddings: number[][] = []

      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE)
        const result = await embeddingModel.embed(batch)
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
