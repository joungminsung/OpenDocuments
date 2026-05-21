import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface SwaggerConfig {
  url: string  // URL to swagger.json or openapi.yaml
  syncInterval?: number
}

export class SwaggerConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-swagger'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private url = ''
  private cachedSpec: any = null

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as SwaggerConfig
    this.url = config.url || ''
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.url) return { healthy: false, message: 'No Swagger URL configured' }
    try {
      const res = await fetchWithTimeout(this.url, {}, 10000)
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  private async fetchSpec(): Promise<any> {
    const res = await fetchWithTimeout(this.url, {})
    if (!res.ok) throw new Error(`Swagger fetch error: ${res.status}`)
    return res.json()
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    this.cachedSpec = await this.fetchSpec()
    const paths = this.cachedSpec.paths || {}

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods as Record<string, any>)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          yield {
            sourceId: `${method.toUpperCase()} ${path}`,
            title: `${method.toUpperCase()} ${path}`,
            sourcePath: `swagger://${path}#${method}`,
            metadata: { operationId: details.operationId },
          }
        }
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    const spec = this.cachedSpec || await this.fetchSpec()
    const [method, path] = ref.sourceId.split(' ')
    const details = spec.paths?.[path]?.[method.toLowerCase()] || {}

    const content = [
      `# ${method} ${path}`,
      details.summary ? `\n${details.summary}` : '',
      details.description ? `\n${details.description}` : '',
      details.parameters ? `\n## Parameters\n${JSON.stringify(details.parameters, null, 2)}` : '',
      details.requestBody ? `\n## Request Body\n${JSON.stringify(details.requestBody, null, 2)}` : '',
      details.responses ? `\n## Responses\n${JSON.stringify(details.responses, null, 2)}` : '',
    ].filter(Boolean).join('\n')

    return { sourceId: ref.sourceId, title: `${method} ${path}`, content }
  }
}

export default SwaggerConnector
