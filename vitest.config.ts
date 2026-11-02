import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests use the package's source, so they don't depend on a build. Node-environment tests resolve
  // like server-side code, which has its own list of conditions.
  resolve: { conditions: ['open-bot-avatar/source'] },
  ssr: { resolve: { conditions: ['open-bot-avatar/source'] } },
  test: {
    projects: [
      { extends: true, test: { name: 'core', include: ['packages/core/tests/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'site', include: ['apps/site/tests/**/*.test.ts'], environment: 'node' } },
    ],
    pool: 'threads',
    maxWorkers: 2,
  },
});
