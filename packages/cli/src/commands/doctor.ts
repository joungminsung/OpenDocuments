import { Command } from 'commander'
import { VERSION, log } from 'opendocuments-core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function doctorCommand() {
  return new Command('doctor')
    .description('Run health diagnostics')
    .action(async () => {
      log.heading('OpenDocuments Health Check')
      let hasIssues = false

      try {
        const ctx = await getContext()
        log.ok(`Core           v${VERSION}`)

        // Test SQLite
        try {
          ctx.db.get('SELECT 1')
          log.ok('SQLite         connected')
        } catch {
          log.fail('SQLite         connection failed')
          hasIssues = true
        }

        // Test LanceDB / document store
        try {
          log.ok('LanceDB        connected')
          const docs = ctx.store.listDocuments()
          log.ok(`Documents      ${docs.length} indexed`)
        } catch {
          log.fail('LanceDB        connection failed')
          hasIssues = true
        }

        const workspaces = ctx.workspaceManager.list()
        log.ok(`Workspaces     ${workspaces.length}`)

        log.blank()
        log.heading('Plugins')
        for (const p of ctx.registry.listAll()) {
          const isStub = p.name.includes('stub')
          if (isStub) {
            log.fail(`${p.name.padEnd(35)} v${p.version} (DEGRADED)`)
            hasIssues = true
          } else {
            log.ok(`${p.name.padEnd(35)} v${p.version}`)
          }
        }

        log.blank()
        log.heading('Model Health')
        for (const model of ctx.registry.getModels()) {
          if (model.healthCheck) {
            try {
              const status = await model.healthCheck()
              if (status.healthy) {
                log.ok(`${model.name.padEnd(35)} healthy`)
              } else {
                log.fail(`${model.name.padEnd(35)} ${status.message ?? 'unhealthy'}`)
                hasIssues = true
              }
            } catch (err) {
              log.fail(`${model.name.padEnd(35)} healthCheck threw: ${(err as Error).message}`)
              hasIssues = true
            }
          } else {
            log.ok(`${model.name.padEnd(35)} (no healthCheck)`)
          }
        }

        // Ollama-specific diagnostics
        if (ctx.config.model.provider === 'ollama') {
          log.blank()
          log.heading('Ollama Diagnostics')

          const baseUrl = ctx.config.model.baseUrl || 'http://localhost:11434'
          const tagsUrl = `${baseUrl}/api/tags`

          let ollamaReachable = false
          let availableModels: string[] = []

          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 3000)
            const res = await fetch(tagsUrl, { signal: controller.signal })
            clearTimeout(timeoutId)

            if (res.ok) {
              ollamaReachable = true
              const data = await res.json() as { models?: { name: string }[] }
              availableModels = (data.models ?? []).map((m) => m.name)
              log.ok(`Ollama         reachable at ${baseUrl}`)
            } else {
              log.fail(`Ollama         responded with HTTP ${res.status}`)
              hasIssues = true
            }
          } catch {
            log.fail(`Ollama         cannot connect to ${baseUrl}`)
            log.arrow('  Fix: ollama serve')
            log.arrow('  Install: https://ollama.com')
            hasIssues = true
          }

          if (ollamaReachable) {
            const requiredModels = Array.from(
              new Set([ctx.config.model.llm, ctx.config.model.embedding])
            )

            for (const required of requiredModels) {
              // Ollama tags may include ":latest" suffix; match on base name or exact name
              const found = availableModels.some(
                (m) => m === required || m === `${required}:latest` || m.startsWith(`${required}:`)
              )
              if (found) {
                log.ok(`Model          ${required}`)
              } else {
                log.fail(`Model          ${required} not found`)
                log.arrow(`  Fix: ollama pull ${required}`)
                hasIssues = true
              }
            }
          }
        }

        log.blank()
        if (hasIssues) {
          log.fail('Some checks failed.')
        } else {
          log.ok('All checks passed!')
        }
      } catch (err) {
        hasIssues = true
        const message = (err as Error).message
        log.fail(`Bootstrap failed: ${message}`)
        log.blank()
        log.info('Troubleshooting suggestions:')
        if (message.includes('ENOENT') || message.includes('no such file')) {
          log.arrow('  The data directory or config file may be missing. Run: opendocuments init')
        } else if (message.includes('SQLITE') || message.includes('database')) {
          log.arrow('  SQLite database may be corrupt. Try removing ~/.opendocuments/opendocuments.db and restarting.')
        } else if (message.includes('permission') || message.includes('EACCES')) {
          log.arrow('  Permission denied. Check ownership of ~/.opendocuments/')
        } else {
          log.arrow('  Run with DEBUG=1 for verbose output.')
          log.arrow('  Check logs at ~/.opendocuments/logs/ if available.')
        }
      } finally {
        await shutdownContext()
      }

      if (hasIssues) {
        process.exitCode = 1
      }
    })
}
