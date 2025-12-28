// ESLint v9+ config file (migrated from .eslintrc.js)
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "eqeqeq": "error",
      "curly": "error",
      "semi": ["error", "always"],
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
];
