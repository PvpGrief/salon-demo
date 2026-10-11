import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests run by default. Database tests need a local Supabase:
    //   npx supabase start && npm run test:db
    include: process.env.TEST_DB ? ['tests/db/**/*.test.ts'] : ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: !process.env.TEST_DB,
  },
});
