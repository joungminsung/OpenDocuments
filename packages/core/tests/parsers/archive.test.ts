import { describe, it, expect } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { ArchiveParser } from '../../src/parsers/archive.js'

function localZipEntry(name: string, content: string): Buffer {
  const nameBuffer = Buffer.from(name)
  const raw = Buffer.from(content)
  const compressed = deflateRawSync(raw)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(compressed.length, 18)
  header.writeUInt32LE(raw.length, 22)
  header.writeUInt16LE(nameBuffer.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, nameBuffer, compressed])
}

describe('ArchiveParser', () => {
  it('extracts deflated text entries from ZIP archives', async () => {
    const parser = new ArchiveParser()
    const zip = Buffer.concat([
      localZipEntry('docs/readme.md', '# Readme\n\nHello from zip.'),
      localZipEntry('docs/notes.txt', 'Plain notes.'),
    ])

    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'archive',
      title: 'docs.zip',
      content: zip,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toContain('# Readme')
    expect(chunks[0].headingHierarchy).toEqual(['Archive: docs.zip', 'docs/readme.md'])
    expect(chunks[0].metadata.needsExtraction).toBe(false)
    expect(chunks[1].content).toContain('Plain notes.')
  })

  it('rejects entries with zip-bomb compression ratios', async () => {
    const parser = new ArchiveParser()
    const zip = localZipEntry('oversized.txt', 'A'.repeat(2 * 1024 * 1024))

    await expect(async () => {
      for await (const _chunk of parser.parse({
        sourceId: 'archive',
        title: 'unsafe.zip',
        content: zip,
      })) {
        // Consume the parser so extraction is attempted.
      }
    }).rejects.toThrow('unsafe compression ratio')
  })
})
