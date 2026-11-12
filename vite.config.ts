import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Sem strictPort: se a 5173 estiver ocupada, o `npm run dev` sobe na próxima livre.
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Cobertura medida só nos módulos de lógica pura (decisão aprovada na spec).
      include: ['src/logic/**/*.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
