import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    maxWorkers: 4,
    retry: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 55,
        functions: 62,
        branches: 45,
        statements: 53,
      },
    },
  },
});
