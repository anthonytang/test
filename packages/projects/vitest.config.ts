import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', '**/*.config.ts', '**/*.d.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@studio/projects': path.resolve(dirname, './src'),
      '@studio/core': path.resolve(dirname, '../core/src'),
      '@studio/api': path.resolve(dirname, '../api/src'),
      '@studio/auth': path.resolve(dirname, '../auth/src'),
      '@studio/notifications': path.resolve(dirname, '../notifications/src'),
      '@studio/storage': path.resolve(dirname, '../storage/src'),
    },
  },
});

