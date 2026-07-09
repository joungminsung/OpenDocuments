import { BlockList, isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

const TRUSTED_PROXY_CACHE = new Map<string, BlockList>()

function normalizeAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1)
  return trimmed
}

function getTrustedProxyBlockList(config: string): BlockList {
  const cached = TRUSTED_PROXY_CACHE.get(config)
  if (cached) return cached

  const blockList = new BlockList()
  for (const rawEntry of config.split(',')) {
    const entry = normalizeAddress(rawEntry)
    if (!entry) continue

    if (entry === 'loopback') {
      blockList.addSubnet('127.0.0.0', 8, 'ipv4')
      blockList.addAddress('::1', 'ipv6')
      continue
    }

    const [address, prefixValue] = entry.split('/', 2)
    const addressType = isIP(address)
    if (addressType === 0) continue
    const family = addressType === 4 ? 'ipv4' : 'ipv6'

    if (prefixValue !== undefined) {
      const prefix = Number(prefixValue)
      const maxPrefix = addressType === 4 ? 32 : 128
      if (Number.isInteger(prefix) && prefix >= 0 && prefix <= maxPrefix) {
        blockList.addSubnet(address, prefix, family)
      }
      continue
    }

    blockList.addAddress(address, family)
  }

  TRUSTED_PROXY_CACHE.set(config, blockList)
  return blockList
}

/** Return the TCP peer address without consulting spoofable HTTP headers. */
export function getRemoteAddress(c: Context): string {
  try {
    return normalizeAddress(getConnInfo(c).remote.address || '')
  } catch {
    // Hono's in-process request helper has no socket. Production Node requests do.
    return ''
  }
}

/** Check whether an address belongs to the configured reverse-proxy allowlist. */
export function isTrustedProxy(address: string, trustedProxy?: string): boolean {
  const normalized = normalizeAddress(address)
  if (!normalized || !trustedProxy) return false
  const addressType = isIP(normalized)
  if (addressType === 0) return false
  return getTrustedProxyBlockList(trustedProxy).check(
    normalized,
    addressType === 4 ? 'ipv4' : 'ipv6'
  )
}

/** Resolve the client IP, honoring forwarding headers only from a trusted proxy. */
export function getClientIp(c: Context, trustedProxy?: string): string {
  const remoteAddress = getRemoteAddress(c)
  if (!isTrustedProxy(remoteAddress, trustedProxy)) return remoteAddress

  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) {
    const chain = forwardedFor
      .split(',')
      .map(normalizeAddress)
      .filter(Boolean)

    for (let i = chain.length - 1; i >= 0; i--) {
      if (!isTrustedProxy(chain[i], trustedProxy)) return chain[i]
    }
  }

  return normalizeAddress(c.req.header('x-real-ip') || '') || remoteAddress
}

function isLoopbackAddress(address: string): boolean {
  const normalized = normalizeAddress(address)
  return normalized === '::1' || normalized.startsWith('127.')
}

/** Determine whether a request arrived securely, with trusted proxy support. */
export function isSecureRequest(c: Context, trustedProxy?: string): boolean {
  const remoteAddress = getRemoteAddress(c)
  if (isLoopbackAddress(remoteAddress)) return true

  try {
    if (new URL(c.req.url).protocol === 'https:') return true
  } catch {
    // Continue to trusted-proxy evaluation.
  }

  if (isTrustedProxy(remoteAddress, trustedProxy)) {
    const forwardedProto = c.req.header('x-forwarded-proto')
      ?.split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
      .pop()
    return forwardedProto === 'https'
  }

  // Hono's in-process request helper has no peer address. Permit only its
  // localhost URL so unit tests and embedded usage keep their local semantics.
  if (!remoteAddress) {
    try {
      const hostname = new URL(c.req.url).hostname
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
    } catch {
      return false
    }
  }

  return false
}
