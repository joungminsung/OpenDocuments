import { describe, expect, it } from 'vitest'

const unsupportedConnectorPackages = [
  '@opendocuments/connector-discord',
  '@opendocuments/connector-jira',
  '@opendocuments/connector-linear',
  '@opendocuments/connector-slack',
]

describe('unsupported connector packages', () => {
  it('are not importable from the workspace', async () => {
    for (const packageName of unsupportedConnectorPackages) {
      await expect(import(packageName)).rejects.toThrow()
    }
  })
})
