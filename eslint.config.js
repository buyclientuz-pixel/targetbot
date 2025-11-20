const commonRules = {
  quotes: ["error", "double", { avoidEscape: true }],
  "no-var": "error",
  "prefer-const": "error",
  semi: ["error", "always"],
};

const commonIgnores = ["dist/**", ".wrangler/**", "node_modules/**", "**/*.{ts,tsx}"];

export default [
  {
    ignores: commonIgnores,
  },
  {
    files: ["**/*.{js,mjs}", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: commonRules,
  },
];
