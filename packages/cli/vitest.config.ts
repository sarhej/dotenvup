import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    pool: 'forks',
    // Test files must not run in parallel: the CLI keychain is global, so
    // concurrent `up init --force` calls overwrite each other's keys.
    // (vitest 4 removed poolOptions.forks.singleFork.)
    fileParallelism: false,
  },
});
