import { readEnv } from '../_lib/env';
import { handleToken } from '../_lib/handlers';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleToken(request, { env: readEnv() });
  },
};
