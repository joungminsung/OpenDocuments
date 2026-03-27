import { Command } from 'commander'
import { log } from '@opendocuments/core'
import chalk from 'chalk'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function pluginCommand() {
  const cmd = new Command('plugin')
    .description('Manage and develop plugins')

  cmd.command('list')
    .description('List installed plugins with health status')
    .action(async () => {
      const ctx = await getContext()
      try {
        const plugins = ctx.registry.listAll()
        if (plugins.length === 0) { log.info('No plugins installed'); return }

        log.heading('Installed Plugins')
        for (const p of plugins) {
          const plugin = ctx.registry.get(p.name)
          let healthIcon = chalk.dim('[--]')
          if (plugin?.healthCheck) {
            try {
              const h = await plugin.healthCheck()
              healthIcon = h.healthy ? chalk.green('[ok]') : chalk.red('[!!]')
            } catch {
              healthIcon = chalk.red('[!!]')
            }
          }
          log.dim(`  ${healthIcon} ${p.name.padEnd(40)} ${p.type.padEnd(12)} v${p.version}`)
        }
      } finally {
        await shutdownContext()
      }
    })

  cmd.command('create <name>')
    .description('Scaffold a new plugin project')
    .option('--type <type>', 'Plugin type: connector, parser, model, middleware', 'parser')
    .action(async (name, opts) => {
      const dir = join(process.cwd(), name)
      if (existsSync(dir)) {
        log.fail(`Directory ${name} already exists`)
        return
      }

      log.heading('Plugin Scaffold')
      log.info(`Creating ${opts.type} plugin: ${name}`)

      mkdirSync(dir, { recursive: true })
      mkdirSync(join(dir, 'src'))
      mkdirSync(join(dir, 'tests'))

      // package.json
      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name,
        version: '0.1.0',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
        scripts: {
          build: 'tsc',
          test: 'vitest run',
          typecheck: 'tsc --noEmit',
        },
        dependencies: { '@opendocuments/core': '^0.1.0' },
        devDependencies: { typescript: '^5.5.0', vitest: '^2.1.0' },
        peerDependencies: { '@opendocuments/core': '^0.1.0' },
      }, null, 2) + '\n')

      // tsconfig.json
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler',
          declaration: true, strict: true, esModuleInterop: true, skipLibCheck: true,
          outDir: 'dist', rootDir: 'src',
        },
        include: ['src/**/*'],
        exclude: ['tests/**/*', 'dist'],
      }, null, 2) + '\n')

      // vitest.config.ts
      writeFileSync(join(dir, 'vitest.config.ts'),
        `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { globals: true, include: ['tests/**/*.test.ts'] } })\n`)

      // Generate src/index.ts based on type
      const templates: Record<string, string> = {
        parser: `import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocuments/core'

export class MyParser implements ParserPlugin {
  name = '${name}'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.ext'] // TODO: set your file extensions

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return
    yield { content: content.trim(), chunkType: 'semantic', headingHierarchy: [] }
  }
}

export default MyParser
`,
        connector: `import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from '@opendocuments/core'

export class MyConnector implements ConnectorPlugin {
  name = '${name}'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    // TODO: yield discovered documents
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // TODO: fetch document content
    return { sourceId: ref.sourceId, title: ref.sourcePath, content: '' }
  }
}

export default MyConnector
`,
        model: `import type { ModelPlugin, PluginContext, HealthStatus, GenerateOpts, EmbeddingResult } from '@opendocuments/core'

export class MyModel implements ModelPlugin {
  name = '${name}'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { llm: false, embedding: false, reranker: false, vision: false }

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }
}

export default MyModel
`,
        middleware: `import type { MiddlewarePlugin, PluginContext, HealthStatus, PipelineStage } from '@opendocuments/core'

export class MyMiddleware implements MiddlewarePlugin {
  name = '${name}'
  type = 'middleware' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  hooks = [
    {
      stage: 'after:parse' as PipelineStage,
      handler: async (data: unknown) => {
        // TODO: process data
        return data
      },
    },
  ]

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }
}

export default MyMiddleware
`,
      }

      writeFileSync(join(dir, 'src', 'index.ts'), templates[opts.type] || templates.parser)

      // Generate test
      writeFileSync(join(dir, 'tests', 'index.test.ts'),
        `import { describe, it, expect } from 'vitest'
// Note: .js extension is resolved to .ts by vitest's TypeScript support
import Plugin from '../src/index.js'

describe('${name}', () => {
  it('has correct metadata', () => {
    const plugin = typeof Plugin === 'function' ? new Plugin() : Plugin
    expect(plugin.name).toBe('${name}')
    expect(plugin.type).toBe('${opts.type}')
  })

  it('reports healthy', async () => {
    const plugin = typeof Plugin === 'function' ? new Plugin() : Plugin
    if (plugin.setup) await plugin.setup({ config: {}, dataDir: '/tmp', log: console } as any)
    if (plugin.healthCheck) {
      const h = await plugin.healthCheck()
      expect(h.healthy).toBe(true)
    }
  })
})
`)

      // README
      writeFileSync(join(dir, 'README.md'),
        `# ${name}\n\nOpenDocuments ${opts.type} plugin.\n\n## Development\n\n\`\`\`bash\nnpm install\nnpm run build\nnpm run test\n\`\`\`\n`)

      log.ok(`Created ${dir}/`)
      log.arrow(`cd ${name} && npm install && npm run test`)
    })

  cmd.command('publish')
    .description('Publish plugin to npm')
    .action(async () => {
      const { execSync } = await import('node:child_process')
      log.heading('Publishing Plugin')
      try {
        execSync('npm publish --access public', { stdio: 'inherit' })
        log.ok('Published successfully')
      } catch { log.fail('Publish failed. Check npm login and package.json') }
    })

  cmd.command('search <query>')
    .description('Search for OpenDocuments plugins on npm')
    .action(async (query) => {
      const { execSync } = await import('node:child_process')
      try {
        const result = execSync(`npm search opendocuments-plugin ${query} --json 2>/dev/null || echo "[]"`, { encoding: 'utf-8' })
        const packages = JSON.parse(result)
        if (packages.length === 0) { log.info('No plugins found'); return }
        log.heading(`Search Results (${packages.length})`)
        for (const pkg of packages.slice(0, 10)) {
          log.ok(`${pkg.name.padEnd(40)} ${pkg.description || ''}`)
        }
      } catch { log.info('No plugins found') }
    })

  cmd.command('test')
    .description('Run plugin tests')
    .action(async () => {
      const { execSync } = await import('node:child_process')
      try { execSync('npx vitest run', { stdio: 'inherit' }) } catch { process.exit(1) }
    })

  cmd.command('dev')
    .description('Start plugin dev mode (watch)')
    .action(async () => {
      const { execSync } = await import('node:child_process')
      try { execSync('npx tsc --watch', { stdio: 'inherit' }) } catch {}
    })

  cmd.command('add <name>').description('Install a plugin').action(async (name) => {
    const { execSync } = await import('node:child_process')
    log.wait(`Installing ${name}...`)
    try {
      execSync(`npm install ${name}`, { stdio: 'inherit' })
      log.ok(`${name} installed. Restart server to activate.`)
    } catch { log.fail(`Failed to install ${name}`) }
  })

  cmd.command('remove <name>').description('Remove a plugin').action(async (name) => {
    const { execSync } = await import('node:child_process')
    log.wait(`Removing ${name}...`)
    try {
      execSync(`npm uninstall ${name}`, { stdio: 'inherit' })
      log.ok(`${name} removed. Restart server to apply.`)
    } catch { log.fail(`Failed to remove ${name}`) }
  })

  cmd.command('update [name]').description('Update plugins').action(async (name) => {
    const { execSync } = await import('node:child_process')
    if (name) {
      log.wait(`Updating ${name}...`)
      try { execSync(`npm update ${name}`, { stdio: 'inherit' }); log.ok('Updated') } catch { log.fail('Failed') }
    } else {
      log.wait('Updating all plugins...')
      try { execSync('npm update', { stdio: 'inherit' }); log.ok('All plugins updated') } catch { log.fail('Failed') }
    }
  })

  return cmd
}
