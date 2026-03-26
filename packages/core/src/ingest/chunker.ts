export interface ChunkOptions {
  maxTokens: number
  overlap: number
}

export interface TextChunk {
  content: string
  position: number
  tokenCount: number
  headingHierarchy: string[]
}

function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil(nonCjk / 4 + cjk / 2)
}

function extractHeadings(text: string): string[] {
  const headings: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      while (headings.length > 0) {
        const lastLevel = (headings[headings.length - 1].match(/^#+/) || [''])[0].length
        if (lastLevel >= level) headings.pop()
        else break
      }
      headings.push(line.trim())
    }
  }
  return headings
}

export function chunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 512, overlap: 50 }
): TextChunk[] {
  const { maxTokens, overlap } = options
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0)
  if (paragraphs.length === 0) return []

  const chunks: TextChunk[] = []
  let currentParagraphs: string[] = []
  let currentTokens = 0
  let headingsBeforeCurrent = ''

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    if (currentTokens + paraTokens > maxTokens && currentParagraphs.length > 0) {
      const content = currentParagraphs.join('\n\n')
      chunks.push({
        content,
        position: chunks.length,
        tokenCount: estimateTokens(content),
        headingHierarchy: extractHeadings(headingsBeforeCurrent + '\n' + content),
      })

      const overlapParagraphs: string[] = []
      let overlapTokens = 0
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const pTokens = estimateTokens(currentParagraphs[i])
        if (overlapTokens + pTokens > overlap) break
        overlapParagraphs.unshift(currentParagraphs[i])
        overlapTokens += pTokens
      }

      headingsBeforeCurrent = headingsBeforeCurrent + '\n' + currentParagraphs.join('\n\n')
      currentParagraphs = [...overlapParagraphs]
      currentTokens = overlapTokens
    }

    currentParagraphs.push(para)
    currentTokens += paraTokens
  }

  if (currentParagraphs.length > 0) {
    const content = currentParagraphs.join('\n\n')
    chunks.push({
      content,
      position: chunks.length,
      tokenCount: estimateTokens(content),
      headingHierarchy: extractHeadings(headingsBeforeCurrent + '\n' + content),
    })
  }

  return chunks
}
