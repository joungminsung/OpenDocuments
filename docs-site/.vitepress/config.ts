import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenDocuments',
  description: 'Open source self-hosted RAG tool for AI document search — connect GitHub, Notion, Google Drive, and more. Ask questions in natural language with source citations.',
  lang: 'en-US',
  ignoreDeadLinks: [/localhost/],

  head: [
    ['meta', { name: 'keywords', content: 'rag tool, ai document search, self-hosted knowledge base, open source rag, retrieval augmented generation, llm document search, ollama rag, vector search, ai knowledge management, document qa, enterprise search, mcp server' }],
    ['meta', { property: 'og:title', content: 'OpenDocuments — Open Source RAG Tool for AI Document Search' }],
    ['meta', { property: 'og:description', content: 'Self-hosted RAG platform that connects scattered documents (GitHub, Notion, Drive, Confluence) and answers questions with AI. Supports Ollama, OpenAI, Claude, Gemini.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://opendocuments.dev' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'OpenDocuments — Open Source RAG Tool' }],
    ['meta', { name: 'twitter:description', content: 'Self-hosted AI document search. Connect GitHub, Notion, Drive. Ask questions, get cited answers.' }],
    ['link', { rel: 'canonical', href: 'https://opendocuments.dev' }],
  ],

  sitemap: {
    hostname: 'https://opendocuments.dev',
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'SDK', link: '/sdk/guide' },
    ],
    sidebar: [
      { text: 'Getting Started', items: [
        { text: 'Quick Start', link: '/guide/' },
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
