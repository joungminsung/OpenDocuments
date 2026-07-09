import type {
  ConnectorPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  PluginContext,
  HealthStatus,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'
import { createHash, createHmac } from 'node:crypto'

export type S3Provider = 's3' | 'gcs'

export interface S3Config {
  provider: S3Provider   // 's3' or 'gcs'
  bucket: string
  prefix?: string        // key prefix / folder (e.g. 'docs/')
  region?: string        // AWS region (default: us-east-1)
  accessKeyId?: string   // AWS or HMAC key (overrides env)
  secretAccessKey?: string // AWS or HMAC secret (overrides env)
  sessionToken?: string
  endpoint?: string      // custom endpoint for MinIO / compatible stores
}

const SUPPORTED_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst', '.html', '.htm'])

export class S3Connector implements ConnectorPlugin {
  name = '@opendocuments/connector-s3'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private provider: S3Provider = 's3'
  private bucket = ''
  private prefix = ''
  private region = 'us-east-1'
  private endpoint = ''
  private accessKeyId = ''
  private secretAccessKey = ''
  private sessionToken = ''

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
    this.sessionToken =
      config.sessionToken || process.env.AWS_SESSION_TOKEN || ''
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
    if (this.provider === 's3' && this.accessKeyId && this.secretAccessKey) {
      Object.assign(headers, this.signS3Request('GET', url))
    }
    return fetchWithTimeout(url, { headers })
  }

  private signS3Request(method: 'GET', url: string): Record<string, string> {
    const parsed = new URL(url)
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = 'UNSIGNED-PAYLOAD'
    const headers: Record<string, string> = {
      host: parsed.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    }
    if (this.sessionToken) headers['x-amz-security-token'] = this.sessionToken

    const canonicalUri = parsed.pathname
      .split('/')
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join('/')
    const canonicalQuery = Array.from(parsed.searchParams.entries())
      .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')
    const signedHeaders = Object.keys(headers).sort().join(';')
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((key) => `${key}:${headers[key].trim()}\n`)
      .join('')
    const canonicalRequest = [
      method,
      canonicalUri || '/',
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n')
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')
    const signingKey = this.getSignatureKey(dateStamp)
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

    return {
      ...(this.sessionToken ? { 'x-amz-security-token': this.sessionToken } : {}),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    }
  }

  private getSignatureKey(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest()
    const kRegion = createHmac('sha256', kDate).update(this.region).digest()
    const kService = createHmac('sha256', kRegion).update('s3').digest()
    return createHmac('sha256', kService).update('aws4_request').digest()
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
