// Shared wrapper for the Vercel Function adapters in api/auth/.
//
// `readEnv()` throws when the deployment is misconfigured. Letting that escape
// crashes the invocation, and Vercel reports FUNCTION_INVOCATION_FAILED with no
// hint — the careful "list every missing name" message never reaches anyone but
// the deploy logs. The client already treats 503 as "server not configured", so
// answer that instead, and say which names are missing.
import { readEnv, type ServerEnv } from './env.js';

export type EndpointHandler = (
  request: Request,
  deps: { env: ServerEnv },
) => Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // A deploy fixed five minutes from now must not keep serving this.
      'cache-control': 'no-store',
    },
  });
}

export function endpoint(
  handler: EndpointHandler,
  source?: Record<string, string | undefined>,
): { fetch: (request: Request) => Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      let env: ServerEnv;
      try {
        // Read at call time, not module load, so a test can inject and so a
        // missing variable is reported rather than crashing the cold start.
        env = readEnv(source ?? process.env);
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'server misconfigured';
        // eslint-disable-next-line no-console
        console.error('[auth] configuration error:', detail);
        // `detail` names variables, never values — the names are already public
        // in .env.example, and a broken deploy is worth being able to diagnose.
        return json(503, { error: 'not-configured', detail });
      }

      try {
        return await handler(request, { env });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[auth] unhandled error:', e);
        return json(500, { error: 'server-error' });
      }
    },
  };
}
