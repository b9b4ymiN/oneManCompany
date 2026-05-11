import tseslint from 'typescript-eslint';

export default [
  {
    files: ['packages/**/*.ts', 'vitest.config.ts'],
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];
