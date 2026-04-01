import { totalmem, cpus, platform, arch } from 'node:os'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HardwareInfo {
  totalRamGB: number
  gpuVramGB: number
  cpuCores: number
  platform: string
  arch: string
}

export interface ModelRecommendation {
  llm: string
  embedding: string
  reason: string
}

/* ------------------------------------------------------------------ */
/*  detectHardware                                                     */
/* ------------------------------------------------------------------ */

/**
 * Detects basic hardware characteristics of the current machine.
 * GPU VRAM is always 0 — there is no reliable cross-platform API for it.
 */
export function detectHardware(): HardwareInfo {
  return {
    totalRamGB: totalmem() / (1024 ** 3),
    gpuVramGB: 0,
    cpuCores: cpus().length,
    platform: platform(),
    arch: arch(),
  }
}

/* ------------------------------------------------------------------ */
/*  recommendModels                                                    */
/* ------------------------------------------------------------------ */

/**
 * Recommends Ollama LLM and embedding models based on available memory.
 * When GPU VRAM is reported it is used directly; otherwise 60 % of
 * total system RAM is treated as effectively available for a local model.
 */
export function recommendModels(hw: HardwareInfo): ModelRecommendation {
  const availableGB = hw.gpuVramGB > 0 ? hw.gpuVramGB : hw.totalRamGB * 0.6

  if (availableGB >= 24) {
    return {
      llm: 'qwen2.5:32b',
      embedding: 'bge-m3',
      reason: `${availableGB.toFixed(1)} GB available — sufficient for a 32B parameter model with high-quality multilingual embeddings.`,
    }
  }

  if (availableGB >= 12) {
    return {
      llm: 'qwen2.5:14b',
      embedding: 'bge-m3',
      reason: `${availableGB.toFixed(1)} GB available — suitable for a 14B parameter model with high-quality multilingual embeddings.`,
    }
  }

  if (availableGB >= 6) {
    return {
      llm: 'qwen2.5:7b',
      embedding: 'bge-m3',
      reason: `${availableGB.toFixed(1)} GB available — suitable for a 7B parameter model with high-quality multilingual embeddings.`,
    }
  }

  return {
    llm: 'qwen2.5:3b',
    embedding: 'nomic-embed-text',
    reason: `${availableGB.toFixed(1)} GB available — constrained environment; using a lightweight 3B model and compact embedding model.`,
  }
}
