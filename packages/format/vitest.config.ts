import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    // Session agent tests spawn real processes; serialize files to avoid races.
    fileParallelism: false,
  },
});
