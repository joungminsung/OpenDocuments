import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverFiles } from '../../src/utils/file-discovery.js'

describe('discoverFiles', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('discovers code files supported by the code parser', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opendocuments-discovery-'))
    tempDirs.push(dir)
    const files = ['app.ts', 'main.py', 'service.go', 'notes.unsupported']
    for (const file of files) writeFileSync(join(dir, file), file)

    expect(discoverFiles(dir).map((file) => file.split('/').pop()).sort()).toEqual([
      'app.ts',
      'main.py',
      'service.go',
    ])
  })
})
