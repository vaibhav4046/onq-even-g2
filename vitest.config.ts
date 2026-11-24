import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@oncue/core': path.join(ROOT, 'packages', 'core', 'src', 'index.ts'),
    },
  },
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/*/tests/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 15000,
  },
});
