import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      // three pages from one build: the landing, the app and the task sheet (plus the old /ulohy/ route, a redirect)
      input: { main: 'index.html', app: 'app/index.html', tasks: 'tasks/index.html', ulohy: 'ulohy/index.html' },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
