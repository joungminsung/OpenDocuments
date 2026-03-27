# Creating Plugins

```bash
opendocuments plugin create my-parser --type parser
cd my-parser
npm install
npm run test
```

## Plugin Types

- **parser**: Convert files to text chunks
- **connector**: Fetch documents from external sources
- **model**: LLM/embedding providers
- **middleware**: Pipeline hooks
