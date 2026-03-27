import type {
  ConnectorPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  PluginContext,
  HealthStatus,
} from '@opendocuments/core'
import { fetchWithTimeout } from '@opendocuments/core'

export type S3Provider = 's3' | 'gcs'

export interface S3Config {
  provider: S3Provider   // 's3' or 'gcs'
  bucket: string
  prefix?: string        // key prefix / folder (e.g. 'docs/')
  region?: string        // AWS region (default: us-east-1)
  accessKeyId?: string   // AWS or HMAC key (overrides env)
  secretAccessKey?: string // AWS or HMAC secret (overrides env)
  endpoint?: string      // custom endpoint for MinIO / compatible stores
  // TODO: Implement AWS Signature V4 signing for private S3 buckets.
  //       Currently supports public buckets, custom endpoints with pre-configured
  //       credentials, or GCS with a Bearer token via GOOGLE_ACCESS_TOKEN env var.
}

const SUPPORTED_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst', '.html', '.htm'])

export class S3Connector implements ConnectorPlugin {
  name = '@opendocuments/connector-s3'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private provider: S3Provider = 's3'
  private bucket = ''
  private prefix = ''
  private region = 'us-east-1'
  private endpoint = ''
  private accessKeyId = ''
  private secretAccessKey = ''

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as S3Config
    this.provider = config.provider || 's3'
    this.bucket = config.bucket || ''
    this.prefix = config.prefix || ''
    this.region = config.region || 'us-east-1'
    this.endpoint = config.endpoint || ''
    this.accessKeyId =
      config.accessKeyId || process.env.AWS_ACCESS_KEY_ID || ''
    this.secretAccessKey =
      config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || ''
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.bucket) {
      return { healthy: false, message: 'No bucket configured' }
    }
    try {
      const url = this.buildListUrl('')
      const res = await this.apiFetch(url)
      return {
        healthy: res.ok,
        message: res.ok
          ? `Connected to ${this.provider.toUpperCase()} bucket: ${this.bucket}`
          : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    if (this.provider === 'gcs') {
      yield* this.discoverGCS()
    } else {
      yield* this.discoverS3()
    }
  }

  private async *discoverS3(): AsyncIterable<DiscoveredDocument> {
    let continuationToken: string | undefined

    do {
      const url = this.buildListUrl(continuationToken)
      const res = await this.apiFetch(url)
      if (!res.ok) throw new Error(`S3 list API error: ${res.status}`)

      const xml = await res.text()
      const keys = this.parseS3Keys(xml)

      for (const key of keys) {
        if (!this.hasSupportedExtension(key)) continue
        yield {
          sourceId: key,
          title: key.split('/').pop() || key,
          sourcePath: `s3://${this.bucket}/${key}`,
          contentHash: key,
        }
      }

      continuationToken = this.parseS3NextToken(xml)
    } while (continuationToken)
  }

  private async *discoverGCS(): AsyncIterable<DiscoveredDocument> {
    let pageToken: string | undefined

    do {
      const prefixParam = this.prefix
        ? `&prefix=${encodeURIComponent(this.prefix)}`
        : ''
      const tokenParam = pageToken
        ? `&pageToken=${encodeURIComponent(pageToken)}`
        : ''
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o?maxResults=100${prefixParam}${tokenParam}`

      const res = await this.apiFetch(url)
      if (!res.ok) throw new Error(`GCS list API error: ${res.status}`)

      const data = await res.json() as {
        nextPageToken?: string
        items?: { name: string; id: string; md5Hash?: string; updated: string }[]
      }

      for (const item of data.items || []) {
        if (!this.hasSupportedExtension(item.name)) continue
        yield {
          sourceId: item.id || item.name,
          title: item.name.split('/').pop() || item.name,
          sourcePath: `gcs://${this.bucket}/${item.name}`,
          contentHash: item.md5Hash || item.updated,
        }
      }

      pageToken = data.nextPageToken
    } while (pageToken)
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    let url: string

    if (this.provider === 'gcs') {
      // Extract object name from sourcePath (gcs://bucket/key)
      const key = ref.sourcePath.replace(`gcs://${this.bucket}/`, '')
      url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}?alt=media`
    } else {
      // Extract object key from sourcePath (s3://bucket/key)
      const key = ref.sourcePath.replace(`s3://${this.bucket}/`, '')
      url = this.buildObjectUrl(key)
    }

    const res = await this.apiFetch(url)
    if (!res.ok) throw new Error(`Object fetch error: ${res.status}`)

    const content = await res.text()
    const title = ref.sourcePath.split('/').pop() || ref.sourceId

    return {
      sourceId: ref.sourceId,
      title,
      content,
    }
  }

  // Build the XML list URL for S3 (list-type=2 = ListObjectsV2)
  private buildListUrl(continuationToken?: string): string {
    const base = this.endpoint
      ? `${this.endpoint}/${this.bucket}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com`

    const prefixParam = this.prefix
      ? `&prefix=${encodeURIComponent(this.prefix)}`
      : ''
    const tokenParam = continuationToken
      ? `&continuation-token=${encodeURIComponent(continuationToken)}`
      : ''

    return `${base}/?list-type=2${prefixParam}${tokenParam}`
  }

  private buildObjectUrl(key: string): string {
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${key}`
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`
  }

  private apiFetch(url: string): Promise<Response> {
    const headers: Record<string, string> = {}
    // GCS supports OAuth2 Bearer tokens via env for authenticated access
    const gcsToken = process.env.GOOGLE_ACCESS_TOKEN
    if (this.provider === 'gcs' && gcsToken) {
      headers['Authorization'] = `Bearer ${gcsToken}`
    }
    // TODO: For private S3 buckets, add AWS Signature V4 Authorization header here.
    //       Use this.accessKeyId and this.secretAccessKey with the signing algorithm:
    //       https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
    return fetchWithTimeout(url, { headers })
  }

  private hasSupportedExtension(key: string): boolean {
    const dot = key.lastIndexOf('.')
    if (dot === -1) return false
    return SUPPORTED_EXTENSIONS.has(key.slice(dot).toLowerCase())
  }

  // Minimal XML parser for S3 ListObjectsV2 response
  private parseS3Keys(xml: string): string[] {
    const keys: string[] = []
    const keyRegex = /<Key>([^<]+)<\/Key>/g
    let match: RegExpExecArray | null
    while ((match = keyRegex.exec(xml)) !== null) {
      keys.push(match[1])
    }
    return keys
  }

  private parseS3NextToken(xml: string): string | undefined {
    const match = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)
    return match ? match[1] : undefined
  }
}

export default S3Connector
