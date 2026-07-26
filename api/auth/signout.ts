import { readEnv } from '../_lib/env';
import { handleSignout } from '../_lib/handlers';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleSignout(request, { env: readEnv() });
  },
};
