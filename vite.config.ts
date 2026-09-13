import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // two pages from one build: the app and the task sheet
      input: { main: 'index.html', ulohy: 'ulohy/index.html' },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
