/**
 * WebSocket chat endpoint scaffold.
 *
 * Protocol:
 *   Client → Server: { type: "query", payload: { query, profile?, conversationId? } }
 *   Server → Client: { type: "chunk", payload: { text } }
 *   Server → Client: { type: "sources", payload: { sources } }
 *   Server → Client: { type: "done", payload: { queryId, route, profile } }
 *   Server → Client: { type: "error", payload: { code, message } }
 */
import type { AppContext } from '../../bootstrap.js'

export function createWSHandler(ctx: AppContext) {
  return async function handleWebSocket(ws: { send: (data: string) => void; close: () => void }, message: string) {
    try {
      const msg = JSON.parse(message)

      if (msg.type === 'query' && msg.payload?.query) {
        for await (const event of ctx.ragEngine.queryStream({
          query: msg.payload.query,
          profile: msg.payload.profile,
        })) {
          ws.send(JSON.stringify(event))
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: (err as Error).message } }))
    }
  }
}

// WebSocket upgrade will be wired when @hono/node-ws or native ws is integrated.
// For now, SSE streaming at POST /api/v1/chat/stream serves as the primary streaming endpoint.
