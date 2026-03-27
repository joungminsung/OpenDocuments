# API Reference

## REST API

Base URL: `http://localhost:3000/api/v1`

### Chat
- `POST /chat` -- Ask a question
- `POST /chat/stream` -- Streaming SSE response
- `POST /chat/feedback` -- Submit feedback

### Documents
- `GET /documents` -- List documents
- `POST /documents/upload` -- Upload file
- `DELETE /documents/:id` -- Delete document

### Admin
- `GET /admin/stats` -- System statistics
- `GET /admin/search-quality` -- Search metrics
- `GET /admin/query-logs` -- Query log viewer
- `GET /admin/plugins` -- Plugin health
- `GET /admin/audit-logs` -- Audit log viewer

## MCP Server

Start with: `opendocs start --mcp-only`
