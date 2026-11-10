import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['shared/**/*.test.ts', 'src/i18n/**/*.test.ts', 'src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
