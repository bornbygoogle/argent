/**
 * Deployment probe — no imports, no environment, no crypto, no cookies.
 *
 * It exists to answer one question that cannot be answered from outside a
 * Vercel deployment: does this runtime invoke the `export default { fetch }`
 * Web-handler shape at all?
 *
 *   200 "pong"                  -> the shape works; the auth failure is ours
 *   500 FUNCTION_INVOCATION_FAILED -> the shape is not being invoked, and no
 *                                  amount of error handling inside the handler
 *                                  can ever run
 *
 * Delete once /api/auth/* is healthy.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    return Response.json(
      {
        pong: true,
        method: request.method,
        node: process.version,
        // Presence only — never the values.
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
