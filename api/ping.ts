/**
 * Deployment probe. Answers, from outside the platform, why /api/auth/*
 * returns FUNCTION_INVOCATION_FAILED while this file does not.
 *
 * The only difference between the two is that the auth endpoints import from
 * api/_lib/. Each module is loaded here one at a time inside a try/catch, so a
 * module that cannot be resolved or that throws while evaluating is *reported*
 * rather than taking the whole invocation down.
 *
 * Delete once /api/auth/* is healthy.
 */
export default {
  async fetch(): Promise<Response> {
    const steps: Record<string, string> = {};

    const step = async (name: string, load: () => Promise<unknown>) => {
      try {
        await load();
        steps[name] = 'ok';
      } catch (e) {
        steps[name] = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    };

    // In dependency order, so the first failure names the culprit.
    await step('node:crypto', () => import('node:crypto'));
    await step('_lib/cookies', () => import('./_lib/cookies.js'));
    await step('_lib/session', () => import('./_lib/session.js'));
    await step('_lib/env', () => import('./_lib/env.js'));
    await step('_lib/oauth', () => import('./_lib/oauth.js'));
    await step('_lib/handlers', () => import('./_lib/handlers.js'));
    await step('_lib/adapter', () => import('./_lib/adapter.js'));

    // And whether the real endpoint module can be loaded and shaped correctly.
    let startShape = 'not reached';
    try {
      const mod = (await import('./auth/start.js')) as { default?: unknown };
      const def = mod.default as { fetch?: unknown } | undefined;
      startShape = `default=${typeof def}, fetch=${typeof def?.fetch}`;
    } catch (e) {
      startShape = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    // What actually shipped. `Cannot find module` has two very different
    // causes — the file was never deployed, or it was deployed as .ts and Node
    // cannot import that. Listing the directory distinguishes them.
    let tree: string[] = [];
    try {
      const { readdirSync, statSync } = await import('node:fs');
      const walk = (dir: string, depth = 0): void => {
        if (depth > 3) return;
        for (const name of readdirSync(dir)) {
          const full = `${dir}/${name}`;
          try {
            if (statSync(full).isDirectory()) {
              tree.push(`${full}/`);
              walk(full, depth + 1);
            } else {
              tree.push(full);
            }
          } catch {
            tree.push(`${full} <stat failed>`);
          }
        }
      };
      walk('/var/task/api');
    } catch (e) {
      tree = [e instanceof Error ? e.message : String(e)];
    }

    return Response.json(
      {
        pong: true,
        node: process.version,
        steps,
        startShape,
        tree,
        env: {
          VITE_GOOGLE_CLIENT_ID: Boolean(process.env.VITE_GOOGLE_CLIENT_ID),
          GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
          APP_ORIGIN: process.env.APP_ORIGIN ?? null,
          SESSION_SECRET_BYTES: process.env.SESSION_SECRET
            ? Buffer.from(process.env.SESSION_SECRET.trim(), 'base64').length
            : 0,
        },
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  },
};
