import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'coverage',
      'playwright-report',
      'test-results',
      'node_modules',
      'supabase/.temp',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // shadcn-style variant helpers and context hooks live beside their components.
          allowExportNames: ['buttonVariants', 'badgeVariants', 'useCartDrawer', 'useAdminRealtime'],
        },
      ],
      // Informational only: this project does not enable the React Compiler.
      'react-hooks/incompatible-library': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Node-side files: configs, scripts, tests, and Deno edge functions.
    files: [
      '*.config.{ts,js}',
      'scripts/**/*.{js,mjs,ts}',
      'tests/**/*.ts',
      'supabase/**/*.ts',
      'src/**/*.test.{ts,tsx}',
      'src/test/**/*.{ts,tsx}',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-console': 'off',
    },
  },
  {
    // The router module defines lazy route components; Fast Refresh does not apply to it.
    files: ['src/app/router.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
  },
);
