export type QueryRoute = 'rag' | 'direct' | 'web_only' | 'rag_web'

// TODO: Make patterns configurable via middleware (before:query hook) or config
const GREETING_PATTERNS = [
  /^(hi|hello|hey|howdy|yo|sup|greetings)\b/i,
  /^(안녕|안녕하세요|반갑습니다|하이|헬로)/,
  /^(good\s+(morning|afternoon|evening|day))\b/i,
  /^(what'?s\s+up|how\s+are\s+you)\b/i,
  /^(thanks|thank\s+you|감사합니다|고마워)\b/i,
]

const DIRECT_PATTERNS = [
  /^(how\s+many\s+docs|how\s+many\s+documents|문서\s*(수|개수|목록|리스트))/i,
  /^(list\s+(all\s+)?documents|show\s+(all\s+)?documents|show\s+docs)/i,
  /^(문서\s*목록|문서\s*리스트|문서\s*보여)/i,
  /^(what\s+documents?\s+(do\s+)?(you|we)\s+have)/i,
  /^(count\s+docs|count\s+documents)/i,
]

export function routeQuery(query: string): QueryRoute {
  const trimmed = query.trim()

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) return 'direct'
  }

  for (const pattern of DIRECT_PATTERNS) {
    if (pattern.test(trimmed)) return 'direct'
  }

  return 'rag'
}
