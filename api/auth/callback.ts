import { readEnv } from '../_lib/env';
import { handleCallback } from '../_lib/handlers';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleCallback(request, { env: readEnv() });
  },
};
