// Production entry: `bun run build && bun run start`. Serves built client assets, everything else goes to SSR.
import { join, normalize } from 'node:path'

// built artifact: untyped and absent before `bun run build`, so import it by computed path
type Handler = { fetch: (req: Request) => Response | Promise<Response> }
const { default: handler }: { default: Handler } = await import(`./dist/server/${'server.js'}`)

const CLIENT = join(import.meta.dir, 'dist/client')

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname))
    if (path !== '/' && !path.includes('..')) {
      const file = Bun.file(join(CLIENT, path))
      if (await file.exists()) {
        const immutable = path.startsWith('/assets/')
        return new Response(
          file,
          immutable
            ? { headers: { 'cache-control': 'public, max-age=31536000, immutable' } }
            : undefined,
        )
      }
    }
    return handler.fetch(req)
  },
})

console.log(`Ysin NG listening on ${server.url}`)
