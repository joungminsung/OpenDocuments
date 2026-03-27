import { describe, it, expect, beforeEach } from 'vitest'
import { EmailParser } from '../src/index.js'

const SAMPLE_EMAIL = `From: john@example.com
To: jane@example.com
Subject: Meeting Notes
Date: Mon, 1 Jan 2024 10:00:00 +0000

Hello Jane,

Here are the meeting notes from today.

1. Project update
2. Budget review
3. Next steps

Best regards,
John`

describe('EmailParser', () => {
  let parser: EmailParser

  beforeEach(async () => {
    parser = new EmailParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-email')
    expect(parser.supportedTypes).toEqual(['.eml', '.msg'])
  })

  it('extracts headers and body', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.eml', content: SAMPLE_EMAIL })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].content).toContain('john@example.com')
    expect(chunks[0].content).toContain('Meeting Notes')
    expect(chunks[1].content).toContain('meeting notes from today')
  })

  it('handles empty email', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.eml', content: '' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
