/**
 * Expand a query with translations for bilingual (ko↔en) document search.
 * Uses simple dictionary-based translation for common technical terms.
 * Not a full translator -- supplements the original query with keyword variations.
 */

// TODO: Load custom dictionaries from config for domain-specific terminology
const KO_EN_DICT: Record<string, string> = {
  '인증': 'authentication', '설정': 'configuration', '배포': 'deployment',
  '설치': 'installation', '데이터베이스': 'database', '서버': 'server',
  '클라이언트': 'client', '사용자': 'user', '관리자': 'admin',
  '보안': 'security', '권한': 'permission', '로그인': 'login',
  '비밀번호': 'password', '검색': 'search', '문서': 'document',
  '파일': 'file', '업로드': 'upload', '다운로드': 'download',
  '에러': 'error', '버그': 'bug', '수정': 'fix',
  '테스트': 'test', '빌드': 'build', '실행': 'run',
  '함수': 'function', '변수': 'variable', '타입': 'type',
  '모듈': 'module', '패키지': 'package', '라이브러리': 'library',
  '프레임워크': 'framework', '컴포넌트': 'component', '인터페이스': 'interface',
  '환경변수': 'environment variable', '캐시': 'cache', '큐': 'queue',
  '예산': 'budget', '매출': 'revenue', '보고서': 'report',
}

const EN_KO_DICT: Record<string, string> = Object.fromEntries(
  Object.entries(KO_EN_DICT).map(([k, v]) => [v, k])
)

/**
 * Check if text contains Korean characters.
 */
function containsKorean(text: string): boolean {
  return /[\uac00-\ud7af]/.test(text)
}

/**
 * Expand query with translations of detected keywords.
 * Returns original query plus expanded variants.
 */
export function expandQuery(query: string): string[] {
  const queries = [query]
  const hasKorean = containsKorean(query)
  const lower = query.toLowerCase()

  if (hasKorean) {
    // Korean query: add English keyword translations
    const translations: string[] = []
    for (const [ko, en] of Object.entries(KO_EN_DICT)) {
      if (query.includes(ko)) {
        translations.push(en)
      }
    }
    if (translations.length > 0) {
      queries.push(translations.join(' '))
    }
  } else {
    // English query: add Korean keyword translations
    const translations: string[] = []
    for (const [en, ko] of Object.entries(EN_KO_DICT)) {
      if (lower.includes(en)) {
        translations.push(ko)
      }
    }
    if (translations.length > 0) {
      queries.push(translations.join(' '))
    }
  }

  return queries
}

/**
 * Merge results from multiple query variants using Reciprocal Rank Fusion.
 */
export function reciprocalRankFusion<T extends { score: number }>(
  resultSets: T[][],
  k = 60,
  getKey?: (item: T) => string,
  scoreWeighted = false
): T[] {
  const scores = new Map<string, { item: T; score: number }>()

  for (const results of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const item = results[rank]
      // Key excludes score so items with same content but different scores are deduped
      const { score: _score, ...rest } = item as T & { score: number }
      const key = getKey ? getKey(item) : JSON.stringify(rest)
      const existing = scores.get(key)
      const rrfBase = 1 / (k + rank + 1)
      const rrfScore = scoreWeighted ? rrfBase * item.score : rrfBase

      if (existing) {
        existing.score += rrfScore
      } else {
        scores.set(key, { item, score: rrfScore })
      }
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, score }))
}
