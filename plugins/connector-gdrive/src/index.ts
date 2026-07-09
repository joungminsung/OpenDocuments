import type {
  ConnectorPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  PluginContext,
  HealthStatus,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'
import { createSign } from 'node:crypto'

export interface GDriveConfig {
  accessToken?: string        // OAuth2 access token
  serviceAccountKey?: string | ServiceAccountKey
  folderId?: string           // Google Drive folder ID to crawl
  syncInterval?: number       // seconds
}

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
  scopes?: string[]
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// Supported Google Workspace MIME types for export
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const GOOGLE_SLIDE_MIME = 'application/vnd.google-apps.presentation'

// Regular file MIME types we treat as plain documents
const SUPPORTED_MIME_TYPES = new Set([
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDE_MIME,
  'text/plain',
  'text/markdown',
  'text/x-rst',
])

export class GDriveConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-gdrive'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private accessToken = ''
  private folderId = ''
  private serviceAccountKey?: ServiceAccountKey
  private accessTokenExpiresAt = Number.POSITIVE_INFINITY
  private tokenRefreshPromise?: Promise<void>

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as GDriveConfig
    this.serviceAccountKey = undefined
    this.accessTokenExpiresAt = Number.POSITIVE_INFINITY
    this.accessToken = config.accessToken || process.env.GDRIVE_ACCESS_TOKEN || ''
    this.folderId = config.folderId || process.env.GDRIVE_FOLDER_ID || ''
    if (!this.accessToken && config.serviceAccountKey) {
      this.serviceAccountKey = this.parseServiceAccountKey(config.serviceAccountKey)
      await this.refreshServiceAccountToken()
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.accessToken) {
      return { healthy: false, message: 'No access token configured' }
    }
    try {
      const res = await this.gdriveFetch(`${DRIVE_API}/files?pageSize=1`)
      return {
        healthy: res.ok,
        message: res.ok ? 'Connected to Google Drive' : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    let pageToken: string | undefined
    const folderFilter = this.folderId
      ? `'${this.folderId}' in parents and `
      : ''

    do {
      const mimeQuery = [...SUPPORTED_MIME_TYPES]
        .map(m => `mimeType='${m}'`)
        .join(' or ')
      const q = encodeURIComponent(`${folderFilter}(${mimeQuery}) and trashed=false`)
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)&pageSize=100${pageParam}`

      const res = await this.gdriveFetch(url)
      if (!res.ok) throw new Error(`Google Drive list API error: ${res.status}`)

      const data = await res.json() as {
        nextPageToken?: string
        files: { id: string; name: string; mimeType: string; modifiedTime: string; md5Checksum?: string }[]
      }

      for (const file of data.files) {
        yield {
          sourceId: file.id,
          title: file.name,
          sourcePath: `gdrive://${file.id}`,
          contentHash: file.md5Checksum || file.modifiedTime,
        }
      }

      pageToken = data.nextPageToken
    } while (pageToken)
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // Extract the file ID from the sourcePath (gdrive://<id>)
    const fileId = ref.sourceId || ref.sourcePath.replace('gdrive://', '')

    // First get file metadata to determine MIME type
    const metaRes = await this.gdriveFetch(`${DRIVE_API}/files/${fileId}?fields=id,name,mimeType`)
    if (!metaRes.ok) throw new Error(`Google Drive metadata error: ${metaRes.status}`)
    const meta = await metaRes.json() as { id: string; name: string; mimeType: string }

    let content: string

    if (
      meta.mimeType === GOOGLE_DOC_MIME ||
      meta.mimeType === GOOGLE_SHEET_MIME ||
      meta.mimeType === GOOGLE_SLIDE_MIME
    ) {
      // Google Workspace files: export as plain text
      const exportRes = await this.gdriveFetch(
        `${DRIVE_API}/files/${fileId}/export?mimeType=text%2Fplain`
      )
      if (!exportRes.ok) throw new Error(`Google Drive export error: ${exportRes.status}`)
      content = await exportRes.text()
    } else {
      // Regular files: download directly
      const dlRes = await this.gdriveFetch(
        `${DRIVE_API}/files/${fileId}?alt=media`
      )
      if (!dlRes.ok) throw new Error(`Google Drive download error: ${dlRes.status}`)
      content = await dlRes.text()
    }

    return {
      sourceId: ref.sourceId,
      title: meta.name,
      content,
    }
  }

  private async gdriveFetch(url: string): Promise<Response> {
    await this.ensureFreshServiceAccountToken()

    const request = () => fetchWithTimeout(url, {
      headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
    })

    let response = await request()
    if (response.status === 401 && this.serviceAccountKey) {
      await this.ensureFreshServiceAccountToken(true)
      response = await request()
    }
    return response
  }

  private parseServiceAccountKey(input: string | ServiceAccountKey): ServiceAccountKey {
    const key = typeof input === 'string' ? JSON.parse(input) as ServiceAccountKey : input
    if (!key.client_email || !key.private_key) {
      throw new Error('Google service account key requires client_email and private_key')
    }
    return key
  }

  private async ensureFreshServiceAccountToken(force = false): Promise<void> {
    if (!this.serviceAccountKey) return
    const refreshBefore = this.accessTokenExpiresAt - 60_000
    if (force || !this.accessToken || Date.now() >= refreshBefore) {
      await this.refreshServiceAccountToken()
    }
  }

  private async refreshServiceAccountToken(): Promise<void> {
    if (!this.serviceAccountKey) return
    if (this.tokenRefreshPromise) return this.tokenRefreshPromise

    this.tokenRefreshPromise = this.exchangeServiceAccountKey(this.serviceAccountKey)
    try {
      await this.tokenRefreshPromise
    } finally {
      this.tokenRefreshPromise = undefined
    }
  }

  private async exchangeServiceAccountKey(key: ServiceAccountKey): Promise<void> {
    const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token'
    const now = Math.floor(Date.now() / 1000)
    const scope = (key.scopes || ['https://www.googleapis.com/auth/drive.readonly']).join(' ')
    const assertion = this.signJwt(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: key.client_email,
        scope,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      },
      key.private_key
    )
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    })
    const res = await fetchWithTimeout(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error(`Google service account token error: ${res.status}`)
    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) throw new Error('Google service account token response missing access_token')
    const expiresInSeconds = Number.isFinite(data.expires_in) && (data.expires_in as number) > 0
      ? data.expires_in as number
      : 3600
    this.accessToken = data.access_token
    this.accessTokenExpiresAt = Date.now() + expiresInSeconds * 1000
  }

  private signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string): string {
    const encodedHeader = this.base64Url(JSON.stringify(header))
    const encodedPayload = this.base64Url(JSON.stringify(payload))
    const signingInput = `${encodedHeader}.${encodedPayload}`
    const signer = createSign('RSA-SHA256')
    signer.update(signingInput)
    signer.end()
    return `${signingInput}.${signer.sign(privateKey, 'base64url')}`
  }

  private base64Url(value: string): string {
    return Buffer.from(value).toString('base64url')
  }
}

export default GDriveConnector
