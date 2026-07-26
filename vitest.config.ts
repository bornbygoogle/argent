import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Two environments: `api/` is pure Node (node:crypto, Request/Response),
// `src/` needs a DOM for React components and localStorage.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environmentMatchGlobs: [
      ['api/**', 'node'],
      ['src/**', 'happy-dom'],
    ],
    include: ['api/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
