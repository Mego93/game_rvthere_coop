import { defineConfig } from 'vitest/config';

// Experiments are throwaway scripts run on demand; they are not part of `npm test`.
export default defineConfig({
  test: { include: ['experiments/**/*.experiment.ts'], environment: 'node', testTimeout: 120_000 },
});
