import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // three pages from one build: the landing, the app and the task sheet
      input: { main: 'index.html', app: 'app/index.html', ulohy: 'ulohy/index.html' },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
