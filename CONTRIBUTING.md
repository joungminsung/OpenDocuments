# Contributing to OpenDocuments

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/opendocuments/opendocuments
cd opendocuments
npm run setup
npm run test
```

## Making Changes

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run tests: `npm run test`
4. Create a changeset: `npx changeset`
5. Submit a PR

## Plugin Development

```bash
opendocuments plugin create my-plugin --type parser
cd my-plugin
npm install && npm run test
```

## Code Style

- TypeScript strict mode
- No emojis in CLI output (use ANSI symbols)
- ESM modules (`type: "module"`)
- Vitest for testing
