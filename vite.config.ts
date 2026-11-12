import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/level/**'],
      // A construção da cena (Three.js) fica fora: é coberta pelo E2E e pelo playtest (decisão na spec de arquitetura).
      exclude: ['src/level/build*.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
