/**
 * Tiny health-check HTTP server for the worker.
 *
 * Railway/Fly (and an uptime monitor on a VPS) want an HTTP endpoint they can poll to know the
 * process is alive and to keep it from being reaped. This serves `GET /health` → 200 and
 * nothing else. It is NOT the app and touches no money — just liveness. Port from PORT
 * (platform-provided) or 8080.
 */
import { createServer, type Server } from 'node:http'

export function startHealthServer(log: (msg: string) => void = console.log): Server {
  const port = Number(process.env.PORT) || 8080
  const startedAt = Date.now()
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true, uptimeMs: Date.now() - startedAt }))
      return
    }
    res.statusCode = 404
    res.end('not found')
  })
  server.listen(port, () => log(`[health] listening on :${port}`))
  return server
}
