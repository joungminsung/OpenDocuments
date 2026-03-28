import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'

export interface GenerateInput {
  query: string
  context: SearchResult[]
  intent: string
  systemPrompt?: string
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

export function buildPrompt(input: GenerateInput): string {
  const systemPrompt = input.systemPrompt || INTENT_PROMPTS[input.intent] || INTENT_PROMPTS.general

  const contextBlock = input.context.length > 0
    ? input.context.map((r) => {
      const heading = (r as { headingHierarchy?: string[] }).headingHierarchy?.at(-1)?.replace(/^#+\s*/, '') ?? ''
      const section = heading ? `#${heading}` : ''
      return `[Source: ${r.sourcePath}${section}]\n${r.content}`
    }).join('\n\n')
    : 'No relevant documentation found.'

  return `${systemPrompt}

## Context
${contextBlock}

## Question
${input.query}

## Instructions
Answer based on the context above. If the context does not contain enough information to answer fully, acknowledge what is missing. Cite sources using [Source: filename#section] format.`
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
    systemPrompt: INTENT_PROMPTS[input.intent] || INTENT_PROMPTS.general,
  })
}
