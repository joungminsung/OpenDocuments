# Plan 5: Parser Plugins

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add parser plugins for PDF, DOCX, XLSX/CSV, HTML, and Jupyter Notebook so users can index common document formats beyond markdown.

**Architecture:** Each parser is a standalone plugin package in `plugins/` implementing the `ParserPlugin` interface from `@opendocuments/core`. Bootstrap auto-registers installed parsers. Parser fallback chains are configured in `opendocuments.config.ts`.

**Tech Stack:** pdf-parse (PDF), mammoth (DOCX), xlsx (Excel), csv-parse (CSV), cheerio (HTML), built-in JSON parse (Jupyter)

**Depends on:** Phase 1 complete (141 tests passing)

---

## File Structure

```
plugins/
├── parser-pdf/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/index.ts
│   └── tests/pdf.test.ts
├── parser-docx/
│   ├── src/index.ts
│   └── tests/docx.test.ts
├── parser-xlsx/
│   ├── src/index.ts
│   └── tests/xlsx.test.ts
├── parser-html/
│   ├── src/index.ts
│   └── tests/html.test.ts
└── parser-jupyter/
    ├── src/index.ts
    └── tests/jupyter.test.ts
```

---

## Task 1: PDF Parser Plugin
- npm deps: `pdf-parse`
- supportedTypes: `['.pdf']`
- Extract text from PDF pages, emit as semantic chunks (1 page = 1 chunk minimum)
- 5 tests: metadata, parse simple PDF, multi-page, empty PDF, error handling

## Task 2: DOCX Parser Plugin
- npm deps: `mammoth`
- supportedTypes: `['.docx']`
- Convert DOCX to HTML via mammoth, then extract text. Separate code blocks.
- 4 tests: metadata, parse simple docx, headings, empty doc

## Task 3: XLSX/CSV Parser Plugin
- npm deps: `xlsx`
- supportedTypes: `['.xlsx', '.xls', '.csv']`
- Each sheet/CSV becomes chunks with header + rows (max 512 tokens per chunk)
- 5 tests: metadata, parse xlsx, multi-sheet, csv, empty

## Task 4: HTML Parser Plugin
- npm deps: `cheerio`
- supportedTypes: `['.html', '.htm']`
- Extract text content, preserve headings, separate code blocks
- 4 tests: metadata, parse HTML, headings, code blocks

## Task 5: Jupyter Notebook Parser Plugin
- No extra deps (JSON parse)
- supportedTypes: `['.ipynb']`
- Parse cells: markdown cells → semantic, code cells → code-ast
- 4 tests: metadata, parse notebook, markdown cells, code cells

## Task 6: Bootstrap Auto-Registration + Integration
- Update bootstrap to scan for installed parser plugins and auto-register them
- Update `discoverFiles` to include new extensions
- Update upload zone text
- Run full test suite
