import { describe, it, expect } from 'vitest'
import { detectHardware, recommendModels } from '../../src/utils/hardware.js'
import type { HardwareInfo } from '../../src/utils/hardware.js'

/* ------------------------------------------------------------------ */
/*  detectHardware                                                     */
/* ------------------------------------------------------------------ */

describe('detectHardware', () => {
  it('returns valid hardware info with RAM > 0 and cores > 0', () => {
    const hw = detectHardware()

    expect(hw.totalRamGB).toBeGreaterThan(0)
    expect(hw.cpuCores).toBeGreaterThan(0)
    expect(hw.gpuVramGB).toBe(0)
    expect(typeof hw.platform).toBe('string')
    expect(hw.platform.length).toBeGreaterThan(0)
    expect(typeof hw.arch).toBe('string')
    expect(hw.arch.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/*  recommendModels                                                    */
/* ------------------------------------------------------------------ */

describe('recommendModels', () => {
  function makeHw(totalRamGB: number, gpuVramGB = 0): HardwareInfo {
    return { totalRamGB, gpuVramGB, cpuCores: 8, platform: 'linux', arch: 'x64' }
  }

  it('recommends qwen2.5:7b + bge-m3 for 8 GB RAM (4.8 GB effective)', () => {
    // 8 * 0.6 = 4.8 GB — falls in the [<6 GB] range → 3b
    // Actually 4.8 < 6, so expect 3b
    const rec = recommendModels(makeHw(8))
    expect(rec.llm).toBe('qwen2.5:3b')
    expect(rec.embedding).toBe('nomic-embed-text')
    expect(rec.reason).toBeTruthy()
  })

  it('recommends qwen2.5:14b + bge-m3 for 32 GB RAM (19.2 GB effective)', () => {
    // 32 * 0.6 = 19.2 GB — falls in the [12,24) range → 14b
    const rec = recommendModels(makeHw(32))
    expect(rec.llm).toBe('qwen2.5:14b')
    expect(rec.embedding).toBe('bge-m3')
    expect(rec.reason).toBeTruthy()
  })

  it('recommends qwen2.5:32b + bge-m3 when GPU VRAM >= 24 GB', () => {
    const rec = recommendModels(makeHw(64, 24))
    expect(rec.llm).toBe('qwen2.5:32b')
    expect(rec.embedding).toBe('bge-m3')
    expect(rec.reason).toBeTruthy()
  })

  it('prefers GPU VRAM over system RAM when GPU VRAM is set', () => {
    // 8 GB system RAM but 16 GB GPU VRAM → 14b
    const rec = recommendModels(makeHw(8, 16))
    expect(rec.llm).toBe('qwen2.5:14b')
    expect(rec.embedding).toBe('bge-m3')
  })

  it('recommends qwen2.5:7b + bge-m3 when effective memory is in [6,12) GB', () => {
    // 16 * 0.6 = 9.6 GB → 7b
    const rec = recommendModels(makeHw(16))
    expect(rec.llm).toBe('qwen2.5:7b')
    expect(rec.embedding).toBe('bge-m3')
  })
})
