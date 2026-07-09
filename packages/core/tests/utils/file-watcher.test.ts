import { describe, it, expect, vi, afterEach } from 'vitest'
import { FileWatcher } from '../../src/utils/file-watcher.js'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('FileWatcher', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'opendocuments-watch-test-'))
    tempDirs.push(dir)
    return dir
  }

  it('can seed existing files without emitting initial added events', async () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'a.md'), '# A')
    const onChange = vi.fn()

    const watcher = new FileWatcher(dir, new Set(['.md']), onChange, { ignoreInitial: true })
    watcher.start()
    watcher.stop()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits deleted events after the initial state is seeded', async () => {
    const dir = makeTempDir()
    const file = join(dir, 'a.md')
    writeFileSync(file, '# A')
    const onChange = vi.fn()

    const watcher = new FileWatcher(dir, new Set(['.md']), onChange, { ignoreInitial: true })
    watcher.start()
    unlinkSync(file)
    await (watcher as any).scan()
    watcher.stop()

    expect(onChange).toHaveBeenCalledWith([{ path: file, type: 'deleted' }])
  })
})
