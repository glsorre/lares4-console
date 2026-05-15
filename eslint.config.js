import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import i18next from 'eslint-plugin-i18next';

export default [
  { ignores: ['dist/**', 'dist-desktop/**', 'src-tauri/target/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'max-len': ['error', { code: 140, ignoreStrings: true }],
    },
  },
  {
    files: ['src/desktop/**/*.tsx', 'src/pro/**/*.tsx'],
    ignores: ['src/components/ui/**', '**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', {
        markupOnly: true,
        ignoreAttribute: ['data-testid', 'role', 'type', 'variant', 'size', 'aria-hidden', 'orientation', 'side', 'align', 'sideOffset', 'href', 'target', 'rel'],
        ignoreCallee: ['cn', 'clsx', 'console.log', 'console.error', 'console.warn', 'console.info', 'console.debug', 'i18n.t', 't'],
      }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        TextEncoder: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
