import { readEnv } from '../_lib/env';
import { handleStart } from '../_lib/handlers';

export default {
  async fetch(request: Request): Promise<Response> {
    return handleStart(request, { env: readEnv() });
  },
};
