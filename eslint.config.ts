import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/*.d.ts",
      "**/*.min.js",
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/release/",
      "**/coverage/",
      "**/assets/",
      "**/public/",
    ],
  },
  ...tseslint.configs.recommended, // https://typescript-eslint.io/users/configs/#recommended, https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/src/configs/eslintrc/recommended.ts
  reactRefresh.configs.vite, // https://www.npmjs.com/package/eslint-plugin-react-refresh
  reactHooks.configs["recommended-latest"], // https://www.npmjs.com/package/eslint-plugin-react-hooks,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // ts is plenty enough on this...
      "@typescript-eslint/no-explicit-any": "off", // allow escape hatch, we use tons of dubiously typed libraries
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off", // allow escape hatch, we use tons of dubiously typed libraries
    },
  },
);
