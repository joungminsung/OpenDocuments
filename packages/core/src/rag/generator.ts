import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import { estimateTokens } from '../utils/tokenizer.js'

export interface GenerateInput {
  query: string
  context: SearchResult[]
  intent: string
  systemPrompt?: string
  conversationHistory?: string
  maxHistoryTokens?: number
}

const INTENT_PROMPTS: Record<string, string> = {
  code: 'You are a coding assistant. Provide clear code examples and explanations based on the documentation context. Use code blocks with appropriate language tags.',
  concept: 'You are a documentation expert. Explain concepts clearly and concisely based on the provided context. Use analogies when helpful.',
  config: 'You are a configuration specialist. Provide precise configuration instructions based on the documentation context. Include all required fields and explain each option.',
  data: 'You are a data specialist. Provide accurate data-related answers based on the documentation context. Include schemas, types, and validation rules when relevant.',
  search: 'You are a search assistant. Summarize the most relevant results from the documentation context. Highlight key matches and rank by relevance.',
  compare: 'You are an analysis assistant. Compare and contrast the items mentioned in the query using the documentation context. Present differences in a structured format.',
  general: 'You are a helpful documentation assistant. Answer questions accurately based on the provided context. If the context does not contain enough information, say so clearly.',
}

export function getSystemPrompt(input: Pick<GenerateInput, 'intent' | 'systemPrompt'>): string {
  return input.systemPrompt || INTENT_PROMPTS[input.intent] || INTENT_PROMPTS.general
}

function trimLineToTokenBudget(line: string, maxTokens: number): string {
  const words = line.trim().split(/\s+/)
  const kept: string[] = []

  for (let i = words.length - 1; i >= 0; i--) {
    kept.unshift(words[i])
    const candidate = kept.join(' ')
    if (estimateTokens(candidate) > maxTokens) {
      kept.shift()
      break
    }
  }

  return kept.join(' ')
}

export function trimConversationHistory(history?: string, maxHistoryTokens?: number): string | undefined {
  if (!history) return undefined

  const normalized = history.trim()
  if (!normalized) return undefined
  if (!maxHistoryTokens || maxHistoryTokens <= 0) return normalized
  if (estimateTokens(normalized) <= maxHistoryTokens) return normalized

  const lines = normalized.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  const kept: string[] = []

  for (let i = lines.length - 1; i >= 0; i--) {
    const candidate = [lines[i], ...kept].join('\n')
    if (estimateTokens(candidate) <= maxHistoryTokens) {
      kept.unshift(lines[i])
      continue
    }
    if (kept.length === 0) {
      const truncatedLine = trimLineToTokenBudget(lines[i], maxHistoryTokens)
      if (truncatedLine) kept.unshift(truncatedLine)
    }
    break
  }

  return kept.length > 0 ? kept.join('\n') : undefined
}

export function buildPrompt(input: GenerateInput): string {
  const systemPrompt = getSystemPrompt(input)
  const trimmedHistory = trimConversationHistory(input.conversationHistory, input.maxHistoryTokens)

  const contextBlock = input.context.length > 0
    ? input.context.map((r) => {
      const heading = (r as { headingHierarchy?: string[] }).headingHierarchy?.at(-1)?.replace(/^#+\s*/, '') ?? ''
      const section = heading ? `#${heading}` : ''
      return `[Source: ${r.sourcePath}${section}]\n${r.content}`
    }).join('\n\n')
    : 'No relevant documentation found.'

  const historyBlock = trimmedHistory
    ? `\n## Conversation History\n${trimmedHistory}\n`
    : ''

  return `${systemPrompt}

## RULES
1. ONLY use information from the Context section below. Do not add external knowledge.
2. Quote or closely paraphrase source text when possible.
3. If sources conflict, mention both perspectives.
4. If the context lacks sufficient information, say exactly what is missing.
5. Cite every claim using [Source: filename#section] format.

## Context
${contextBlock}
${historyBlock}
## Question
${input.query}

## RESPONSE FORMAT
Start with a direct answer in 1-2 sentences, then provide supporting details with citations.`
}

export async function* generateAnswer(
  model: ModelPlugin,
  input: GenerateInput,
): AsyncIterable<string> {
  if (!model.generate) {
    throw new Error('LLM model must support generate()')
  }

  const prompt = buildPrompt(input)

  yield* model.generate(prompt, {
    temperature: 0.3,
    maxTokens: 4096,
  })
}
