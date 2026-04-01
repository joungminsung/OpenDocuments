import type { PluginPermissions } from './interfaces.js'

/**
 * Resolved and normalized plugin permissions with all fields present.
 */
export interface ResolvedPermissions {
  network: boolean | string[]
  filesystem: boolean | string[]
  env: string[]
  events: string[]
}

/**
 * Normalize raw plugin permissions into a fully resolved form.
 * When permissions are undefined, returns all-true defaults for backward compatibility.
 */
export function validatePluginPermissions(permissions?: PluginPermissions): ResolvedPermissions {
  if (permissions === undefined) {
    return {
      network: true,
      filesystem: true,
      env: [],
      events: [],
    }
  }

  return {
    network: permissions.network ?? true,
    filesystem: permissions.filesystem ?? true,
    env: permissions.env ?? [],
    events: permissions.events ?? [],
  }
}

/**
 * Check whether a URL is permitted under the given network permission.
 * - `true`  — allow all URLs
 * - `false` — block all URLs
 * - `string[]` — allow only URLs whose hostname matches one of the allowed entries
 */
export function enforceNetworkPermission(networkPerm: boolean | string[], url: string): boolean {
  if (networkPerm === true) return true
  if (networkPerm === false) return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  return networkPerm.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))
}

/**
 * Check whether a filesystem path is permitted under the given filesystem permission.
 * - `true`  — allow all paths
 * - `false` — block all paths
 * - `string[]` — allow only paths that start with one of the allowed prefixes
 */
export function enforceFilesystemPermission(fsPerm: boolean | string[], path: string): boolean {
  if (fsPerm === true) return true
  if (fsPerm === false) return false

  return fsPerm.some((allowed) => path.startsWith(allowed))
}
