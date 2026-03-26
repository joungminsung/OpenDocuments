import { readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const SUPPORTED_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt',          // built-in
  '.pdf', '.docx',                 // document parsers
  '.xlsx', '.xls', '.csv',        // spreadsheet parsers
  '.html', '.htm',                 // HTML parser
  '.ipynb',                        // Jupyter parser
])
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build', '.next', '.turbo', 'coverage'])

export function discoverFiles(dir: string, extensions?: Set<string>): string[] {
  const supported = extensions || SUPPORTED_EXTENSIONS
  const results: string[] = []

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue
        walk(join(currentDir, entry.name))
      } else if (supported.has(extname(entry.name))) {
        results.push(join(currentDir, entry.name))
      }
    }
  }

  const stat = statSync(dir)
  if (stat.isFile()) {
    if (supported.has(extname(dir))) results.push(dir)
  } else {
    walk(dir)
  }

  return results
}
