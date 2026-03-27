import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocs/core'

export class EmailParser implements ParserPlugin {
  name = '@opendocs/parser-email'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.eml', '.msg']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return

    const { headers, body } = parseEmail(content)

    // Yield metadata as first chunk
    const metaLines = []
    if (headers.from) metaLines.push(`From: ${headers.from}`)
    if (headers.to) metaLines.push(`To: ${headers.to}`)
    if (headers.subject) metaLines.push(`Subject: ${headers.subject}`)
    if (headers.date) metaLines.push(`Date: ${headers.date}`)

    if (metaLines.length > 0) {
      yield {
        content: metaLines.join('\n'),
        chunkType: 'semantic',
        headingHierarchy: [headers.subject || 'Email'],
        metadata: { type: 'email-header' },
      }
    }

    // Yield body
    if (body.trim()) {
      yield {
        content: body.trim(),
        chunkType: 'semantic',
        headingHierarchy: [headers.subject || 'Email'],
      }
    }
  }
}

function parseEmail(raw: string): { headers: Record<string, string>; body: string } {
  const headerEnd = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n')
  if (headerEnd === -1) return { headers: {}, body: raw }

  const headerSection = raw.substring(0, headerEnd)
  const body = raw.substring(headerEnd).trim()

  const headers: Record<string, string> = {}
  const lines = headerSection.split(/\r?\n/)
  let currentKey = ''

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of previous header
      if (currentKey) headers[currentKey] += ' ' + line.trim()
    } else {
      const colonIdx = line.indexOf(':')
      if (colonIdx > 0) {
        currentKey = line.substring(0, colonIdx).toLowerCase()
        headers[currentKey] = line.substring(colonIdx + 1).trim()
      }
    }
  }

  // Strip MIME boundaries and extract text/plain part
  const textBody = extractTextPart(body)

  return { headers, body: textBody }
}

function extractTextPart(body: string): string {
  // If it's multipart, try to find text/plain section
  if (body.includes('Content-Type: text/plain')) {
    const parts = body.split(/--[^\r\n]+/)
    for (const part of parts) {
      if (part.includes('Content-Type: text/plain')) {
        const bodyStart = part.indexOf('\n\n')
        if (bodyStart !== -1) return part.substring(bodyStart + 2).trim()
      }
    }
  }
  // Otherwise return as-is (strip common MIME headers)
  return body.replace(/Content-Type:.*\n/gi, '').replace(/Content-Transfer-Encoding:.*\n/gi, '').trim()
}

export default EmailParser
