import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/components/ui/**/*.test.tsx', 'src/app/login/**/*.test.ts', 'src/app/my-evaluations/**/*.test.{ts,tsx}', 'src/app/design-templates/**/*.test.tsx', 'src/server/**/*.test.ts'],
  },
});
