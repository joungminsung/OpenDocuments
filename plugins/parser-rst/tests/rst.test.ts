import { describe, it, expect, beforeEach } from 'vitest'
import { RSTParser } from '../src/index.js'
import type { ParsedChunk } from 'opendocuments-core'

async function collect(parser: RSTParser, content: string): Promise<ParsedChunk[]> {
  const chunks: ParsedChunk[] = []
  for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.rst', content })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('RSTParser', () => {
  let parser: RSTParser

  beforeEach(async () => {
    parser = new RSTParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-rst')
    expect(parser.supportedTypes).toEqual(['.rst'])
    expect(parser.type).toBe('parser')
  })

  it('reports healthy', async () => {
    const status = await parser.healthCheck()
    expect(status.healthy).toBe(true)
  })

  it('returns no chunks for empty input', async () => {
    const chunks = await collect(parser, '')
    expect(chunks).toHaveLength(0)

    const blank = await collect(parser, '   \n\n  \n')
    expect(blank).toHaveLength(0)
  })

  it('extracts underlined headings and builds heading hierarchy', async () => {
    const rst = `
Introduction
============

This is an intro paragraph.

Getting Started
---------------

Install the package first.
`.trim()

    const chunks = await collect(parser, rst)
    const intro = chunks.find(c => c.content.includes('intro paragraph'))
    const install = chunks.find(c => c.content.includes('Install'))

    expect(intro).toBeDefined()
    expect(intro!.headingHierarchy).toEqual(['Introduction'])

    expect(install).toBeDefined()
    expect(install!.headingHierarchy).toEqual(['Introduction', 'Getting Started'])
  })

  it('extracts overlined headings', async () => {
    const rst = `
==========
Main Title
==========

Some content here.
`.trim()

    const chunks = await collect(parser, rst)
    expect(chunks[0].headingHierarchy).toEqual(['Main Title'])
    expect(chunks[0].content).toBe('Some content here.')
  })

  it('parses code-block directives with language tag', async () => {
    const rst = `
Usage
-----

.. code-block:: python

    def hello():
        return "world"
`.trim()

    const chunks = await collect(parser, rst)
    const code = chunks.find(c => c.chunkType === 'code-ast')
    expect(code).toBeDefined()
    expect(code!.language).toBe('python')
    expect(code!.content).toContain('def hello()')
    expect(code!.headingHierarchy).toEqual(['Usage'])
  })

  it('parses .. code:: directive (alternative syntax)', async () => {
    const rst = `
.. code:: typescript

    const x: number = 42
`.trim()

    const chunks = await collect(parser, rst)
    const code = chunks.find(c => c.chunkType === 'code-ast')
    expect(code).toBeDefined()
    expect(code!.language).toBe('typescript')
    expect(code!.content).toContain('const x')
  })

  it('parses literal blocks introduced by ::', async () => {
    const rst = `
Example::

    $ npm install opendocuments
    $ opendocuments start
`.trim()

    const chunks = await collect(parser, rst)
    const para = chunks.find(c => c.chunkType === 'semantic')
    const code = chunks.find(c => c.chunkType === 'code-ast')

    expect(para).toBeDefined()
    expect(para!.content).toMatch(/Example/)
    expect(code).toBeDefined()
    expect(code!.content).toContain('npm install')
  })

  it('handles standalone :: paragraph separator before literal block', async () => {
    const rst = `
Description

::

    some literal content
`.trim()

    const chunks = await collect(parser, rst)
    const code = chunks.find(c => c.chunkType === 'code-ast')
    expect(code).toBeDefined()
    expect(code!.content).toContain('some literal content')
  })

  it('resets heading hierarchy when same-level heading appears', async () => {
    const rst = `
Chapter One
===========

Intro text.

Chapter Two
===========

More text.
`.trim()

    const chunks = await collect(parser, rst)
    const intro = chunks.find(c => c.content.includes('Intro'))
    const more = chunks.find(c => c.content.includes('More'))

    expect(intro!.headingHierarchy).toEqual(['Chapter One'])
    expect(more!.headingHierarchy).toEqual(['Chapter Two'])
  })

  it('skips non-code directives without emitting their body as content', async () => {
    const rst = `
Title
=====

.. note::

    This is a note directive body.

Real content here.
`.trim()

    const chunks = await collect(parser, rst)
    const hasNote = chunks.some(c => c.content.includes('This is a note directive body'))
    const hasContent = chunks.some(c => c.content.includes('Real content'))
    expect(hasNote).toBe(false)
    expect(hasContent).toBe(true)
  })
})
