import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/vscode-dotenvup/**'],
    globals: true,
  },
});
