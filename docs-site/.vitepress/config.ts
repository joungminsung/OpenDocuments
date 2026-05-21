import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenDocuments',
  description: 'Open source self-hosted RAG platform for AI document search across GitHub, Notion, Google Drive, Confluence, S3, local files, and web sources. Ask questions with source citations.',
  lang: 'en-US',
  base: '/OpenDocuments/',
  ignoreDeadLinks: [/localhost/],

  head: [
    ['meta', { name: 'keywords', content: 'self-hosted rag, ai document search, open source rag, retrieval augmented generation, knowledge base, llm document search, ollama rag, vector search, semantic search, document qa, enterprise search alternative, mcp server, github search, notion search, google drive search' }],
    ['meta', { property: 'og:title', content: 'OpenDocuments - Self-Hosted RAG Platform for AI Document Search' }],
    ['meta', { property: 'og:description', content: 'Open source RAG platform that connects GitHub, Notion, Google Drive, Confluence, S3, local files, and web sources, then answers questions with citations.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://joungminsung.github.io/OpenDocuments/' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'OpenDocuments - Self-Hosted RAG Platform' }],
    ['meta', { name: 'twitter:description', content: 'Self-hosted AI document search across GitHub, Notion, Google Drive, local files, and web sources.' }],
    ['link', { rel: 'canonical', href: 'https://joungminsung.github.io/OpenDocuments/' }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'OpenDocuments',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux, Windows',
      description: 'Open source self-hosted RAG platform for AI document search with source citations.',
      softwareVersion: '0.3.0',
      license: 'https://github.com/joungminsung/OpenDocuments/blob/main/LICENSE',
      codeRepository: 'https://github.com/joungminsung/OpenDocuments',
      programmingLanguage: 'TypeScript',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        'Self-hosted retrieval augmented generation',
        'AI document search with source citations',
        'GitHub, Notion, Google Drive, Confluence, S3, local file, and web connectors',
        'Ollama, OpenAI, Anthropic, Google, and xAI model providers',
        'MCP server for AI coding assistants',
        'TypeScript SDK, CLI, Web UI, and HTTP API',
      ],
    })],
  ],

  sitemap: {
    hostname: 'https://joungminsung.github.io/OpenDocuments/',
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'SDK', link: '/sdk/guide' },
      { text: 'GitHub', link: 'https://github.com/joungminsung/OpenDocuments' },
    ],
    sidebar: [
      { text: 'Getting Started', items: [
        { text: 'Quick Start', link: '/guide/' },
        { text: 'What is OpenDocuments?', link: '/guide/what-is-opendocuments' },
        { text: 'Comparisons', link: '/guide/comparisons' },
        { text: 'Self-Hosted RAG with Ollama', link: '/guide/self-hosted-rag-ollama' },
        { text: 'MCP Knowledge Base', link: '/guide/mcp-knowledge-base' },
        { text: 'Architecture', link: '/guide/architecture' },
        { text: 'Configuration', link: '/guide/configuration' },
        { text: 'Deployment', link: '/guide/deployment' },
      ]},
      { text: 'Plugins', items: [
        { text: 'Overview', link: '/plugins/' },
        { text: 'Parser API', link: '/plugins/parser-api' },
        { text: 'Connector API', link: '/plugins/connector-api' },
        { text: 'Model API', link: '/plugins/model-api' },
      ]},
      { text: 'SDK', items: [
        { text: 'TypeScript Client', link: '/sdk/guide' },
      ]},
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/joungminsung/OpenDocuments' },
    ],
    editLink: {
      pattern: 'https://github.com/joungminsung/OpenDocuments/edit/main/docs-site/:path',
    },
    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
