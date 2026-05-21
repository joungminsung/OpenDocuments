import type { SearchResult } from '../ingest/document-store.js'

/**
 * Replace each result's content with its `parentSection` (the enclosing heading
 * section text) when the parent is longer than the chunk, deduping multiple
 * chunks that collapse to the same parent within the same document.
 * Results are returned sorted by score descending.
 */
export function attachParentContext(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>()
  for (const r of results) {
    const useParent = r.parentSection && r.parentSection.length > r.content.length
    const text = useParent ? r.parentSection! : r.content
    const key = `${r.documentId}::${text}`
    const prev = seen.get(key)
    if (!prev || r.score > prev.score) {
      seen.set(key, { ...r, content: text })
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score)
}
