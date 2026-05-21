import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

export const SERVER_VERSION = version
