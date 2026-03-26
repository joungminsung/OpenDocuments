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


function updateHeadingStack(stack: string[], para: string): string[] {
  const lines = para.split('\n')
  const updated = [...stack]
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      while (updated.length > 0) {
        const lastLevel = (updated[updated.length - 1].match(/^#+/) || [''])[0].length
        if (lastLevel >= level) updated.pop()
        else break
      }
      updated.push(line.trim())
    }
  }
  return updated
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
  // Heading stack carries forward between chunks instead of accumulating full text history
  let currentHeadings: string[] = []

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    if (currentTokens + paraTokens > maxTokens && currentParagraphs.length > 0) {
      const content = currentParagraphs.join('\n\n')
      chunks.push({
        content,
        position: chunks.length,
        tokenCount: estimateTokens(content),
        headingHierarchy: [...currentHeadings],
      })

      const overlapParagraphs: string[] = []
      let overlapTokens = 0
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const pTokens = estimateTokens(currentParagraphs[i])
        if (overlapTokens + pTokens > overlap) break
        overlapParagraphs.unshift(currentParagraphs[i])
        overlapTokens += pTokens
      }

      // Update heading stack by scanning all flushed paragraphs
      for (const flushed of currentParagraphs) {
        currentHeadings = updateHeadingStack(currentHeadings, flushed)
      }

      currentParagraphs = [...overlapParagraphs]
      currentTokens = overlapTokens
    }

    currentParagraphs.push(para)
    currentTokens += paraTokens
  }

  if (currentParagraphs.length > 0) {
    const content = currentParagraphs.join('\n\n')
    // Build final heading state from remaining paragraphs
    const finalHeadings = currentParagraphs.reduce(
      (stack, para) => updateHeadingStack(stack, para),
      [...currentHeadings]
    )
    chunks.push({
      content,
      position: chunks.length,
      tokenCount: estimateTokens(content),
      headingHierarchy: finalHeadings,
    })
  }

  return chunks
}
