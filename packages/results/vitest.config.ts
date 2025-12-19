import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@studio/core': path.resolve(__dirname, '../core/src'),
      '@studio/api': path.resolve(__dirname, '../api/src'),
      '@studio/auth': path.resolve(__dirname, '../auth/src'),
      '@studio/notifications': path.resolve(__dirname, '../notifications/src'),
      '@studio/ui': path.resolve(__dirname, '../ui/src'),
      '@studio/templates': path.resolve(__dirname, '../templates/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', '**/*.config.ts', '**/*.d.ts', '**/index.ts', '**/__tests__/**'],
    },
  },
});

