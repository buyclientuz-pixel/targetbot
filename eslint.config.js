import prettierPlugin from 'eslint-plugin-prettier';

export default [
  {
    files: ['**/*.{js,ts,tsx}'],
    ignores: ['dist/**', '.wrangler/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    plugins: {
      prettier: prettierPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      quotes: ['error', 'double', { avoidEscape: true }],
      'no-var': 'error',
      'prefer-const': 'error',
      semi: ['error', 'always']
    }
  }
];
