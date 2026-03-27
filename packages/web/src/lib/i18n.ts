const translations: Record<string, Record<string, string>> = {
  en: {
    'nav.chat': 'Chat',
    'nav.documents': 'Documents',
    'nav.settings': 'Settings',
    'nav.admin': 'Admin',
    'chat.placeholder': 'Ask a question about your documents...',
    'chat.send': 'Send',
    'chat.empty': 'Ask questions about your indexed documents.',
    'docs.title': 'Documents',
    'docs.upload': 'Drop files here or click to browse',
    'docs.empty': 'No documents indexed yet.',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.profile': 'RAG Profile',
  },
  ko: {
    'nav.chat': '채팅',
    'nav.documents': '문서',
    'nav.settings': '설정',
    'nav.admin': '관리자',
    'chat.placeholder': '문서에 대해 질문하세요...',
    'chat.send': '전송',
    'chat.empty': '인덱싱된 문서에 대해 질문하세요.',
    'docs.title': '문서 관리',
    'docs.upload': '파일을 드래그하거나 클릭하여 업로드',
    'docs.empty': '인덱싱된 문서가 없습니다.',
    'settings.title': '설정',
    'settings.theme': '테마',
    'settings.profile': 'RAG 프로필',
  },
}

let currentLocale = 'en'

export function setLocale(locale: string): void {
  currentLocale = translations[locale] ? locale : 'en'
}

export function t(key: string): string {
  return translations[currentLocale]?.[key] || translations.en?.[key] || key
}

export function detectLocale(): string {
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('ko')) return 'ko'
  return 'en'
}
