#!/usr/bin/env node
import { createServer } from "node:http"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { extname, join, normalize, resolve, sep } from "node:path"

const root = resolve(process.cwd(), "learning-site")
const port = Number(process.env.PORT || process.argv[2] || 4173)
const host = process.env.HOST || "127.0.0.1"

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
])

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/")
  const normalized = normalize(decoded).replace(/^([/\\])+/, "")
  const absolute = resolve(root, normalized)
  if (absolute !== root && !absolute.startsWith(root + sep)) return null
  return absolute
}

const server = createServer(async (req, res) => {
  try {
    const requested = safePath(req.url || "/")
    if (!requested) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" })
      res.end("Forbidden")
      return
    }

    let file = requested
    const info = await stat(file).catch(() => null)
    if (info?.isDirectory()) file = join(file, "index.html")
    if (!info) file = join(root, "index.html")

    const fileInfo = await stat(file).catch(() => null)
    if (!fileInfo?.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      res.end("Not found")
      return
    }

    res.writeHead(200, {
      "content-type": types.get(extname(file)) || "application/octet-stream",
      "cache-control": "no-cache",
    })
    createReadStream(file).pipe(res)
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    res.end(error instanceof Error ? error.message : String(error))
  }
})

server.listen(port, host, () => {
  console.log(`Codebase tour running at http://${host}:${port}`)
  console.log(`Serving ${root}`)
})
