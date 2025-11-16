import prettierPlugin from "eslint-plugin-prettier";

export default [
  {
    files: ["**/*.js"],
    ignores: ["dist/**", ".wrangler/**", "node_modules/**"],
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
    rules: {
      "prettier/prettier": "error",
      quotes: ["error", "double", { avoidEscape: true }],
      "no-var": "error",
      "prefer-const": "error",
      semi: ["error", "always"],
    },
  },
];
