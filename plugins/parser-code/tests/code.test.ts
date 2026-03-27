import { describe, it, expect, beforeEach } from 'vitest'
import { CodeParser } from '../src/index.js'

describe('CodeParser', () => {
  let parser: CodeParser

  beforeEach(async () => {
    parser = new CodeParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-code')
    expect(parser.type).toBe('parser')
    expect(parser.supportedTypes).toContain('.ts')
    expect(parser.supportedTypes).toContain('.py')
  })

  it('parses TypeScript file with functions', async () => {
    const code = `import { foo } from './foo'

export function hello(name: string): string {
  return 'Hello ' + name
}

export function goodbye(): void {
  console.log('bye')
}
`
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'app.ts', content: code })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].chunkType).toBe('code-ast')
    expect(chunks[0].language).toBe('typescript')
  })

  it('extracts Python functions and classes', async () => {
    const code = `import os

class MyService:
    def __init__(self):
        self.data = {}

    def process(self, item):
        return item.upper()

def main():
    svc = MyService()
    print(svc.process('hello'))
`
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'app.py', content: code })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].language).toBe('python')
    const allSymbols = chunks.flatMap(c => c.codeSymbols || [])
    expect(allSymbols).toContain('MyService')
  })

  it('extracts Go functions', async () => {
    const code = `package main

import "fmt"

func main() {
    fmt.Println("hello")
}

type Server struct {
    Port int
}

func (s *Server) Start() {
    fmt.Println("starting on", s.Port)
}
`
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'main.go', content: code })) {
      chunks.push(chunk)
    }
    expect(chunks[0].language).toBe('go')
  })

  it('handles empty file', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.ts', content: '' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('extracts imports', async () => {
    const code = `import express from 'express'
import { Router } from 'express'

const app = express()
`
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'index.js', content: code })) {
      chunks.push(chunk)
    }
    const firstChunk = chunks[0]
    expect(firstChunk.codeImports).toBeDefined()
    expect(firstChunk.codeImports.length).toBeGreaterThan(0)
  })
})
