import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'OpenDocuments',
  description: 'Self-hosted RAG platform documentation',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Plugins', link: '/plugins/' },
    ],
    sidebar: [
      { text: 'Getting Started', items: [
        { text: 'Installation', link: '/guide/' },
        { text: 'Configuration', link: '/guide/configuration' },
        { text: 'Deployment', link: '/guide/deployment' },
      ]},
      { text: 'Plugins', items: [
        { text: 'Creating Plugins', link: '/plugins/' },
        { text: 'Parser API', link: '/plugins/parser-api' },
        { text: 'Connector API', link: '/plugins/connector-api' },
        { text: 'Model API', link: '/plugins/model-api' },
      ]},
    ],
  },
})
