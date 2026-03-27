import type {
  ConnectorPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  PluginContext,
  HealthStatus,
} from '@opendocuments/core'
import { fetchWithTimeout } from '@opendocuments/core'

export interface GDriveConfig {
  accessToken?: string        // OAuth2 access token
  serviceAccountKey?: string  // TODO: full service account JWT flow
  folderId?: string           // Google Drive folder ID to crawl
  syncInterval?: number       // seconds
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
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private accessToken = ''
  private folderId = ''

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as GDriveConfig
    this.accessToken = config.accessToken || process.env.GDRIVE_ACCESS_TOKEN || ''
    this.folderId = config.folderId || process.env.GDRIVE_FOLDER_ID || ''
    // TODO: if serviceAccountKey is provided, generate a JWT and exchange it for an
    //       access token using https://oauth2.googleapis.com/token (OAuth2 service
    //       account flow). For now, only Bearer token auth is supported.
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

  private gdriveFetch(url: string): Promise<Response> {
    const headers: Record<string, string> = {}
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }
    return fetchWithTimeout(url, { headers })
  }
}

export default GDriveConnector
