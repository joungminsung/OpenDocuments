import semver from 'semver'
import type { AnyPlugin } from './interfaces.js'

export interface CompatibilityResult {
  compatible: boolean
  errors: string[]
  warnings: string[]
}

export function checkCompatibility(
  plugin: AnyPlugin,
  coreVersion: string,
  installedPluginNames: string[]
): CompatibilityResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!semver.satisfies(coreVersion, plugin.coreVersion)) {
    errors.push(
      `Requires core version ${plugin.coreVersion}, but current is ${coreVersion}`
    )
  }

  if (plugin.dependencies) {
    for (const dep of plugin.dependencies) {
      if (!installedPluginNames.includes(dep)) {
        errors.push(`Missing required dependency: ${dep}`)
      }
    }
  }

  if (plugin.conflicts) {
    for (const conflict of plugin.conflicts) {
      if (installedPluginNames.includes(conflict)) {
        errors.push(`Conflicts with installed plugin: ${conflict}`)
      }
    }
  }

  return { compatible: errors.length === 0, errors, warnings }
}
