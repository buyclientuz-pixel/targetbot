import prettierPlugin from "eslint-plugin-prettier";
import tseslint from "typescript-eslint";

const commonRules = {
  "prettier/prettier": "error",
  quotes: ["error", "double", { avoidEscape: true }],
  "no-var": "error",
  "prefer-const": "error",
  semi: ["error", "always"],
};

const commonIgnores = ["dist/**", ".wrangler/**", "node_modules/**"];

export default [
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
    ignores: commonIgnores,
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: commonRules,
  }),
  {
    files: ["**/*.js"],
    ignores: commonIgnores,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: commonRules,
  },
];
