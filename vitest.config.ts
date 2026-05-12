import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@onemancompany/kernel': path.resolve(
        __dirname,
        'packages/kernel/src/index.ts'
      ),
      '@onemancompany/adapters': path.resolve(
        __dirname,
        'packages/adapters/src/index.ts'
      ),
      '@onemancompany/observability': path.resolve(
        __dirname,
        'packages/observability/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    testTimeout: 60000,
    include: ['packages/**/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'packages/kernel/src/state-machine.ts',
        'packages/kernel/src/constitution-enforcer.ts',
        'packages/kernel/src/context-manager.ts',
        'packages/kernel/src/debate-controller.ts',
        'packages/kernel/src/evidence-controller.ts',
        'packages/kernel/src/journal-writer.ts',
      ],
      thresholds: {
        lines: 99,
        functions: 100,
        branches: 80,
        statements: 99,
      },
    },
  },
});
