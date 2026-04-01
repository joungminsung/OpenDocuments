/**
 * Expand a query with translations for bilingual (ko↔en) document search.
 * Uses simple dictionary-based translation for common technical terms.
 * Not a full translator -- supplements the original query with keyword variations.
 */

/**
 * Base Korean-English dictionary with 300+ technical term pairs.
 * Organized by domain for maintainability.
 */
const BASE_KO_EN_DICT: Record<string, string> = {
  // ── General Software Development ──
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
  '소스코드': 'source code', '리팩토링': 'refactoring', '코드리뷰': 'code review',
  '의존성주입': 'dependency injection', '콜백': 'callback', '프로미스': 'promise',
  '이벤트': 'event', '로깅': 'logging', '디렉토리': 'directory',
  '바이너리': 'binary', '컴파일': 'compile', '런타임': 'runtime',
  '스택': 'stack', '힙': 'heap', '가비지컬렉션': 'garbage collection',
  '스레드': 'thread', '프로세스': 'process', '동시성': 'concurrency',
  '병렬처리': 'parallel processing', '데드락': 'deadlock', '뮤텍스': 'mutex',
  '세마포어': 'semaphore', '알고리즘': 'algorithm', '자료구조': 'data structure',
  '해시': 'hash', '정렬': 'sorting', '재귀': 'recursion',
  '반복': 'iteration', '추상화': 'abstraction', '캡슐화': 'encapsulation',
  '상속': 'inheritance', '다형성': 'polymorphism', '제네릭': 'generics',
  '열거형': 'enum', '어노테이션': 'annotation', '데코레이터': 'decorator',
  '직렬화': 'serialization', '역직렬화': 'deserialization',
  '버전관리': 'version control', '브랜치': 'branch', '머지': 'merge',
  '커밋': 'commit', '태그': 'tag', '저장소': 'repository',

  // ── Architecture & Design (~30) ──
  '아키텍처': 'architecture', '마이크로서비스': 'microservice',
  '설계': 'design', '패턴': 'pattern', '의존성': 'dependency',
  '확장성': 'scalability', '미들웨어': 'middleware', '엔드포인트': 'endpoint',
  '라우팅': 'routing', '게이트웨이': 'gateway', '프록시': 'proxy',
  '로드밸런서': 'load balancer', '서비스메시': 'service mesh',
  '모놀리식': 'monolithic', '이벤트소싱': 'event sourcing',
  '도메인주도설계': 'domain driven design', '헥사고날': 'hexagonal',
  '클린아키텍처': 'clean architecture', '레이어': 'layer',
  '싱글톤': 'singleton', '팩토리': 'factory', '옵저버': 'observer',
  '전략패턴': 'strategy pattern', '어댑터': 'adapter',
  '파사드': 'facade', '데이터흐름': 'data flow', '결합도': 'coupling',
  '응집도': 'cohesion', '관심사분리': 'separation of concerns',
  '서비스디스커버리': 'service discovery', '서킷브레이커': 'circuit breaker',
  '사이드카': 'sidecar', '백엔드': 'backend', '프론트엔드': 'frontend',
  '풀스택': 'full stack',

  // ── DevOps & Infrastructure (~40) ──
  '컨테이너': 'container', '도커': 'docker', '쿠버네티스': 'kubernetes',
  '오케스트레이션': 'orchestration', '파이프라인': 'pipeline',
  '모니터링': 'monitoring', '인프라': 'infrastructure', '클라우드': 'cloud',
  '롤백': 'rollback', '헬스체크': 'health check', '스케일링': 'scaling',
  '오토스케일링': 'autoscaling', '로드밸런싱': 'load balancing',
  '무중단배포': 'zero downtime deployment', '블루그린배포': 'blue green deployment',
  '카나리배포': 'canary deployment', '롤링업데이트': 'rolling update',
  '인그레스': 'ingress',
  '네임스페이스': 'namespace', '노드': 'node', '포드': 'pod',
  '레플리카': 'replica', '디플로이먼트': 'deployment resource',
  '서비스': 'service', '볼륨': 'volume', '시크릿': 'secret',
  '컨피그맵': 'configmap', '헬름': 'helm', '테라폼': 'terraform',
  '앤서블': 'ansible', '젠킨스': 'jenkins', '깃허브액션': 'github actions',
  '지속적통합': 'continuous integration', '지속적배포': 'continuous deployment',
  '아티팩트': 'artifact', '레지스트리': 'registry',
  '가상머신': 'virtual machine', '하이퍼바이저': 'hypervisor',
  '프로비저닝': 'provisioning', '대시보드': 'dashboard',
  '알림': 'alert', '임계값': 'threshold', '가용성': 'availability',
  '장애복구': 'disaster recovery', '백업': 'backup', '복원': 'restore',
  '로그수집': 'log aggregation', '추적': 'tracing', '메트릭': 'metric',

  // ── Database & Storage (~30) ──
  '쿼리': 'query', '인덱스': 'index', '트랜잭션': 'transaction',
  '벡터': 'vector', '임베딩': 'embedding', '유사도': 'similarity',
  '샤딩': 'sharding', '레플리케이션': 'replication', '파티셔닝': 'partitioning',
  '정규화': 'normalization', '비정규화': 'denormalization',
  '스키마': 'schema', '마이그레이션': 'migration', '시드': 'seed',
  '조인': 'join', '서브쿼리': 'subquery', '집계': 'aggregation',
  '커서': 'cursor', '배치처리': 'batch processing',
  '키값저장소': 'key value store', '관계형데이터베이스': 'relational database',
  '비관계형': 'non-relational', '객체저장소': 'object storage',
  '데이터웨어하우스': 'data warehouse', '데이터레이크': 'data lake',
  '연결풀': 'connection pool', '락': 'lock', '동시성제어': 'concurrency control',
  '벡터데이터베이스': 'vector database', '전문검색': 'full text search',
  '역인덱스': 'inverted index', '블룸필터': 'bloom filter',

  // ── Security (~25) ──
  '암호화': 'encryption', '토큰': 'token', '세션': 'session',
  '인가': 'authorization', '취약점': 'vulnerability',
  '접근제어': 'access control', '방화벽': 'firewall',
  '인증서': 'certificate', '공개키': 'public key', '개인키': 'private key',
  '해싱': 'hashing', '솔트': 'salt', '서명': 'signature',
  '크로스사이트스크립팅': 'cross site scripting',
  'SQL인젝션': 'SQL injection', '요청위조': 'request forgery',
  '제로트러스트': 'zero trust', '침입탐지': 'intrusion detection',
  '감사로그': 'audit log', '다단계인증': 'multi factor authentication',
  '싱글사인온': 'single sign on', '역할기반접근제어': 'role based access control',
  '데이터마스킹': 'data masking', '비밀관리': 'secret management',
  '보안감사': 'security audit', '펜테스팅': 'penetration testing',

  // ── Frontend (~25) ──
  '렌더링': 'rendering', '상태관리': 'state management',
  '반응형': 'responsive', '비동기': 'async', '스트림': 'stream',
  '가상돔': 'virtual DOM', '서버사이드렌더링': 'server side rendering',
  '정적사이트생성': 'static site generation', '하이드레이션': 'hydration',
  '번들러': 'bundler', '트리쉐이킹': 'tree shaking', '코드분할': 'code splitting',
  '지연로딩': 'lazy loading', '핫리로드': 'hot reload',
  '스타일시트': 'stylesheet', '레이아웃': 'layout', '그리드': 'grid',
  '플렉스박스': 'flexbox', '애니메이션': 'animation',
  '접근성': 'accessibility', '국제화': 'internationalization',
  '지역화': 'localization', '라우터': 'router',
  '상태': 'state', '프롭스': 'props', '훅': 'hook',
  '컨텍스트': 'context',

  // ── Data Science & ML (~30) ──
  '머신러닝': 'machine learning', '딥러닝': 'deep learning',
  '학습': 'training', '추론': 'inference', '정확도': 'accuracy',
  '파인튜닝': 'fine-tuning', '모델': 'model',
  '신경망': 'neural network', '트랜스포머': 'transformer',
  '어텐션': 'attention', '토크나이저': 'tokenizer',
  '하이퍼파라미터': 'hyperparameter', '에포크': 'epoch',
  '배치크기': 'batch size', '학습률': 'learning rate',
  '과적합': 'overfitting', '과소적합': 'underfitting',
  '정규화기법': 'regularization', '드롭아웃': 'dropout',
  '손실함수': 'loss function', '옵티마이저': 'optimizer',
  '그래디언트': 'gradient', '역전파': 'backpropagation',
  '데이터증강': 'data augmentation', '전이학습': 'transfer learning',
  '강화학습': 'reinforcement learning', '생성모델': 'generative model',
  '분류': 'classification', '회귀': 'regression', '클러스터링': 'clustering',
  '차원축소': 'dimensionality reduction', '특성추출': 'feature extraction',
  '프롬프트': 'prompt', '컨텍스트윈도우': 'context window',
  '검색증강생성': 'retrieval augmented generation', '청킹': 'chunking',
  '리랭킹': 'reranking', '그라운딩': 'grounding',

  // ── Testing (~15) ──
  '단위테스트': 'unit test', '통합테스트': 'integration test',
  '커버리지': 'coverage', '디버깅': 'debugging',
  '엔드투엔드테스트': 'end to end test', '회귀테스트': 'regression test',
  '부하테스트': 'load test', '스트레스테스트': 'stress test',
  '목객체': 'mock', '스텁': 'stub', '스파이': 'spy',
  '픽스처': 'fixture', '어서션': 'assertion',
  '테스트더블': 'test double', '스냅샷테스트': 'snapshot test',
  '테스트자동화': 'test automation',

  // ── API & Communication (~20) ──
  '웹소켓': 'WebSocket', '웹훅': 'webhook',
  '메시지큐': 'message queue', '이벤트버스': 'event bus',
  '페이로드': 'payload', '헤더': 'header', '미들웨어체인': 'middleware chain',
  '요청': 'request', '응답': 'response', '상태코드': 'status code',
  '페이지네이션': 'pagination', '필터링': 'filtering',
  '속도제한': 'rate limiting', '재시도': 'retry',
  '타임아웃': 'timeout', '폴링': 'polling',
  '구독': 'subscription', '발행': 'publish',
  '프로토콜': 'protocol', '그래프큐엘': 'GraphQL',
  'REST API': 'REST API',

  // ── Project Management (~15) ──
  '요구사항': 'requirements', '스프린트': 'sprint', '릴리즈': 'release',
  '풀리퀘스트': 'pull request', '이슈': 'issue', '백로그': 'backlog',
  '스토리포인트': 'story point', '번다운차트': 'burndown chart',
  '회고': 'retrospective', '스크럼': 'scrum', '칸반': 'kanban',
  '마일스톤': 'milestone', '로드맵': 'roadmap',
  '기술부채': 'technical debt', '리팩토링계획': 'refactoring plan',
  '코드오너': 'code owner',
}

// ── Module-level mutable state for custom dictionary ──
let customKoEnDict: Record<string, string> = {}
let customEnKoDict: Record<string, string> = {}

/**
 * Get the merged Korean-to-English dictionary (base + custom).
 * Custom entries override base entries with the same key.
 */
function getKoEnDict(): Record<string, string> {
  return { ...BASE_KO_EN_DICT, ...customKoEnDict }
}

/**
 * Get the merged English-to-Korean dictionary (base reversed + custom reversed).
 * Custom entries override base entries with the same key.
 */
function getEnKoDict(): Record<string, string> {
  const baseReverse = Object.fromEntries(
    Object.entries(BASE_KO_EN_DICT).map(([k, v]) => [v, k])
  )
  return { ...baseReverse, ...customEnKoDict }
}

/**
 * Load a custom Korean-English dictionary that supplements the base dictionary.
 * Pass an empty object to clear custom entries.
 * @param koEnPairs - Korean key to English value pairs
 */
export function loadCustomDictionary(koEnPairs: Record<string, string>): void {
  customKoEnDict = { ...koEnPairs }
  customEnKoDict = Object.fromEntries(
    Object.entries(koEnPairs).map(([k, v]) => [v, k])
  )
}

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
    const koEnDict = getKoEnDict()
    const translations: string[] = []
    for (const [ko, en] of Object.entries(koEnDict)) {
      if (query.includes(ko)) {
        translations.push(en)
      }
    }
    if (translations.length > 0) {
      queries.push(translations.join(' '))
    }
  } else {
    // English query: add Korean keyword translations
    const enKoDict = getEnKoDict()
    const translations: string[] = []
    for (const [en, ko] of Object.entries(enKoDict)) {
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
