import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'file:./data/test.db',
    },
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
  },
});
