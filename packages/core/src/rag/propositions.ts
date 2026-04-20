import type { ModelPlugin } from '../plugin/interfaces.js'

const PROP_PROMPT = (chunk: string) => `Decompose the following passage into a list of atomic propositions — self-contained, minimal factual statements that each stand alone. Use bullet points, one per line. Do not paraphrase unnecessarily.

Passage:
${chunk}

Propositions:`

const HQ_PROMPT = (chunk: string, n: number) => `List ${n} distinct questions this passage directly answers. One per line, numbered.

Passage:
${chunk}

Questions:`

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const piece of stream) out += piece
  return out
}

function parseBullets(text: string): string[] {
  return text.split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[\.\)])\s*/, '').trim())
    .filter(l => l.length > 0)
}

/**
 * Ask an LLM to decompose the chunk into atomic propositions (self-contained facts).
 * Each proposition is a minimal, stand-alone factual statement derived from the chunk.
 * The output is intended to be concatenated into the FTS5 index only (not the
 * vector embedding) to boost lexical recall when users phrase a fact differently
 * than the original text.
 *
 * Returns [] on LLM failure or missing generate().
 */
export async function generatePropositions(chunk: string, llm: ModelPlugin): Promise<string[]> {
  if (!llm.generate) return []
  try {
    const stream = llm.generate(PROP_PROMPT(chunk), { temperature: 0, maxTokens: 512 })
    return parseBullets(await collectStream(stream))
  } catch {
    return []
  }
}

/**
 * Ask an LLM to produce up to `n` questions this chunk directly answers. Used to
 * augment FTS5 recall on question-style queries — a user asking "What is Redis?"
 * can match a chunk whose augmented text contains that exact question even when
 * the raw chunk content uses different wording.
 *
 * Returns [] on LLM failure or missing generate().
 */
export async function generateHypotheticalQuestions(
  chunk: string,
  llm: ModelPlugin,
  n = 3
): Promise<string[]> {
  if (!llm.generate) return []
  try {
    const stream = llm.generate(HQ_PROMPT(chunk, n), { temperature: 0.3, maxTokens: 256 })
    return parseBullets(await collectStream(stream)).slice(0, n)
  } catch {
    return []
  }
}
