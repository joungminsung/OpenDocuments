export type QueryIntent = 'code' | 'concept' | 'config' | 'data' | 'search' | 'compare' | 'general'

interface IntentPattern {
  intent: QueryIntent
  patterns: RegExp[]
  keywords: string[]
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'code',
    patterns: [
      /(?:how|방법|어떻게)\s+(?:to\s+)?(?:implement|구현|use|사용|call|write|코드)/i,
      /(?:function|함수|class|클래스|method|메서드|api)\s/i,
      /(?:code|코드)\s+(?:example|예시|sample|샘플)/i,
      /(?:import|require|from)\s/i,
    ],
    keywords: ['function', 'class', 'method', 'import', 'error', 'bug', 'fix', 'debug', 'code', 'example', 'sample', '함수', '클래스', '에러', '버그', '코드'],
  },
  {
    intent: 'concept',
    patterns: [
      /(?:what\s+is|뭐야|무엇|설명|explain|개념)/i,
      /(?:difference\s+between|차이점|차이가)/i,
      /(?:why|왜)\s+(?:does|is|do|should)/i,
      /(?:mean|의미|뜻)\??$/i,
    ],
    keywords: ['what', 'why', 'explain', 'definition', 'concept', '개념', '설명', '뜻', '의미'],
  },
  {
    intent: 'config',
    patterns: [
      /(?:config|설정|configure|환경\s*변수|environment)/i,
      /(?:setup|셋업|install|설치|deploy|배포)/i,
      /\.(?:env|yaml|yml|json|toml|ini|conf)\b/i,
    ],
    keywords: ['config', 'setting', 'setup', 'install', 'deploy', 'environment', '설정', '설치', '배포', '환경'],
  },
  {
    intent: 'data',
    patterns: [
      /(?:how\s+much|how\s+many|얼마|몇|통계|숫자|수치)/i,
      /(?:chart|그래프|table|표|데이터|data)\s/i,
      /\d{4}년|\d{4}\s*(?:Q[1-4]|분기|quarter)/i,
    ],
    keywords: ['data', 'number', 'statistics', 'count', 'total', 'budget', '예산', '매출', '통계', '현황', '수치'],
  },
  {
    intent: 'search',
    patterns: [
      /(?:find|찾|search|검색|list|목록|show\s+me)/i,
      /(?:recent|최근|latest|관련)\s+(?:document|문서|file|파일)/i,
    ],
    keywords: ['find', 'search', 'list', 'show', '찾', '검색', '목록', '관련'],
  },
  {
    intent: 'compare',
    patterns: [
      /(?:compare|비교|vs\.?|versus|차이점)/i,
      /(?:difference|다른\s*점|장단점|pros\s+and\s+cons)/i,
    ],
    keywords: ['compare', 'versus', 'vs', 'difference', 'better', '비교', '차이', '장단점'],
  },
]

export function classifyIntent(query: string): QueryIntent {
  const lower = query.toLowerCase()

  // Score each intent
  let bestIntent: QueryIntent = 'general'
  let bestScore = 0

  for (const { intent, patterns, keywords } of INTENT_PATTERNS) {
    let score = 0

    // Pattern matches (high weight)
    for (const pattern of patterns) {
      if (pattern.test(query)) score += 3
    }

    // Keyword matches (lower weight)
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) score += 1
    }

    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  return bestIntent
}
