import reactRefresh from "eslint-plugin-react-refresh";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import enforceSymbolOwnerRule from "./eslint/rules/enforce-symbol-owner.ts";
import noBarrelReexportRule from "./eslint/rules/no-barrel-reexport.ts";
import noOptionalApiRule from "./eslint/rules/no-optional-api.ts";
import noTypesFileRule from "./eslint/rules/no-types-file.ts";
import noValueDefaultOrRule from "./eslint/rules/no-value-default-or.ts";

const projectRoot = import.meta.dirname;
const scopedFiles = [
  "three/**/*.ts",
  "tests/three/**/*.ts",
  "src/components/**/*.ts",
  "src/components/**/*.tsx",
  "src/store/**/*.ts",
];
const symbolOwnerConfig = {
  owners: {
    "three/assets.ts": ["TerrainAssetBundle"],
    "three/app.ts": ["ThreeTerrainApp"],
    "three/projection.ts": ["Point2", "Rect", "PickedTile", "CameraState", "Viewport"],
    "src/store/renderer-mode.ts": ["RendererMode"],
  },
};

const helmDefensePlugin = {
  rules: {
    "enforce-symbol-owner": enforceSymbolOwnerRule,
    "no-barrel-reexport": noBarrelReexportRule,
    "no-optional-api": noOptionalApiRule,
    "no-types-file": noTypesFileRule,
    "no-value-default-or": noValueDefaultOrRule,
  },
};

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
      "unicorn/prevent-abbreviations": "off",
      "prefer-const": ["error", { destructuring: "all" }],

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
  {
    files: scopedFiles,
    plugins: { "helm-defense": helmDefensePlugin },
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["tests/*/*.ts"] }, tsconfigRootDir: projectRoot },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": true, "ts-ignore": true, "ts-nocheck": true, "ts-check": false },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "helm-defense/enforce-symbol-owner": ["error", symbolOwnerConfig],
      "helm-defense/no-barrel-reexport": "error",
      "helm-defense/no-optional-api": "error",
      "helm-defense/no-types-file": "error",
      "helm-defense/no-value-default-or": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression",
          message: "Type assertions with `as` are forbidden in scoped AGENTS-enforced files.",
        },
        {
          selector: "TSTypeAssertion",
          message: "Angle-bracket type assertions are forbidden in scoped AGENTS-enforced files.",
        },
        { selector: "ChainExpression", message: "Optional chaining is forbidden in scoped AGENTS-enforced files." },
        {
          selector: "LogicalExpression[operator='??']",
          message: "Nullish coalescing is forbidden in scoped AGENTS-enforced files.",
        },
        {
          selector: "AssignmentExpression[operator='??=']",
          message: "Nullish assignment is forbidden in scoped AGENTS-enforced files.",
        },
        {
          selector: "AssignmentExpression[operator='||=']",
          message: "Logical-or assignment is forbidden in scoped AGENTS-enforced files.",
        },
      ],
    },
  },
);
