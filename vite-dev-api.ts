import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROUTES = ['start', 'callback', 'token', 'signout'] as const;
type Route = (typeof ROUTES)[number];

/**
 * Mount the /api/auth handlers on the Vite dev server, mirroring what Vercel
 * does in production, so `npm run dev` stays a single command and needs no
 * `vercel dev`. The handlers themselves are shared — this is only an adapter
 * between Node's req/res and the Web-standard Request/Response they speak.
 */
export function devApi(mode: string): Plugin {
  // Vite only exposes VITE_-prefixed vars on import.meta.env. The server
  // secrets are deliberately NOT prefixed, so load the full .env here — this
  // stays in the Node process and never reaches the browser bundle.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  return {
    name: 'argent-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? '').split('?')[0];
        const route = ROUTES.find((r) => path === `/api/auth/${r}`) as Route | undefined;
        if (!route) return next();

        void (async () => {
          try {
            const { readEnv } = await server.ssrLoadModule('/api/_lib/env.ts');
            const handlers = await server.ssrLoadModule('/api/_lib/handlers.ts');
            const handler = {
              start: handlers.handleStart,
              callback: handlers.handleCallback,
              token: handlers.handleToken,
              signout: handlers.handleSignout,
            }[route] as (r: Request, d: { env: unknown }) => Promise<Response>;

            const origin = `http://${req.headers.host ?? 'localhost:5173'}`;
            const body =
              req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);

            const request = new Request(new URL(req.url ?? '/', origin), {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body,
            });

            const response = await handler(request, { env: readEnv(env) });

            res.statusCode = response.status;
            for (const [k, v] of response.headers) {
              if (k === 'set-cookie') continue;
              res.setHeader(k, v);
            }
            const cookies = response.headers.getSetCookie();
            if (cookies.length > 0) res.setHeader('set-cookie', cookies);
            const buf = Buffer.from(await response.arrayBuffer());
            res.end(buf.length > 0 ? buf : undefined);
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            // Surfaces "Missing server env: …" during setup. Never contains a
            // token value — readEnv only ever names the missing variables.
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'dev-api-failed' }));
          }
        })();
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
