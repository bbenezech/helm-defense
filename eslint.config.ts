import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

export default tseslint.config(
  {
    ignores: [
      "**/*.d.ts",
      "**/*.min.js",
      "**/node_modules/",
      "**/tmp/",
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
  eslintPluginUnicorn.configs.recommended, // https://github.com/sindresorhus/eslint-plugin-unicorn
  {
    rules: {
      // whitelist
      "unicorn/prefer-import-meta-properties": "error",

      // blacklist
      "unicorn/no-nested-ternary": "off", // not compatible with prettier
      "unicorn/number-literal-case": "off", // not compatible with prettier
      "unicorn/no-null": "off", // not my style
      "unicorn/filename-case": "off", // todo
      "unicorn/no-array-reduce": "off",
      "unicorn/prefer-global-this": "off",
      "unicorn/prefer-single-call": "off",
      "unicorn/prefer-module": "off",
      "unicorn/prefer-at": "off",
      "unicorn/prefer-modern-math-apis": "off", // hypoth is too slow
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // ts is plenty enough on this...
      "@typescript-eslint/no-explicit-any": "off", // allow escape hatch, we use dubiously typed libraries
    },
  },
  {
    files: ["**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off", // allow escape hatch, we use dubiously typed libraries
    },
  },
);
