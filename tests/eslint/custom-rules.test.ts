import path from "node:path";
import { RuleTester } from "eslint";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import tseslint from "typescript-eslint";
import enforceSymbolOwnerRule from "../../eslint/rules/enforce-symbol-owner.ts";
import noBarrelReexportRule from "../../eslint/rules/no-barrel-reexport.ts";
import noOptionalApiRule from "../../eslint/rules/no-optional-api.ts";
import noTypesFileRule from "../../eslint/rules/no-types-file.ts";
import noValueDefaultOrRule from "../../eslint/rules/no-value-default-or.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
});
const root = process.cwd();
const ownerOptions = [
  {
    owners: {
      "three/assets.ts": ["TerrainAssetBundle"],
      "three/app.ts": ["ThreeTerrainApp"],
    },
  },
];

function file(relativePath: string): string {
  return path.join(root, relativePath);
}

tester.run("helm-defense/no-barrel-reexport", noBarrelReexportRule, {
  valid: [
    {
      code: "export function createStore() { return 1; }",
      filename: file("src/store/index.ts"),
    },
  ],
  invalid: [
    {
      code: 'export { value } from "./value.ts";',
      filename: file("src/components/example.ts"),
      errors: [{ messageId: "forbidden" }],
    },
    {
      code: 'export * from "./value.ts";',
      filename: file("three/example.ts"),
      errors: [{ messageId: "forbidden" }],
    },
  ],
});

tester.run("helm-defense/no-types-file", noTypesFileRule, {
  valid: [
    {
      code: "export type ThreeTerrainApp = { destroy(): void; };",
      filename: file("three/app.ts"),
    },
  ],
  invalid: [
    {
      code: "export type TerrainTypes = { value: number };",
      filename: file("three/types.ts"),
      errors: [{ messageId: "forbidden" }],
    },
  ],
});

tester.run("helm-defense/no-optional-api", noOptionalApiRule, {
  valid: [
    {
      code: "type Options = { value: number }; function read(value: number) { return value; }",
      filename: file("src/store/example.ts"),
    },
  ],
  invalid: [
    {
      code: "type Options = { value?: number }; function read(value?: number) { return value; }",
      filename: file("src/store/example.ts"),
      errors: [{ messageId: "optionalProperty" }, { messageId: "optionalParameter" }],
    },
    {
      code: "type Options = { read?(): number; };",
      filename: file("three/example.ts"),
      errors: [{ messageId: "optionalMethod" }],
    },
  ],
});

tester.run("helm-defense/no-value-default-or", noValueDefaultOrRule, {
  valid: [
    {
      code: "if (left || right) { value(); }",
      filename: file("three/example.ts"),
    },
  ],
  invalid: [
    {
      code: "const value = left || right;",
      filename: file("three/example.ts"),
      errors: [{ messageId: "forbidden" }],
    },
  ],
});

tester.run("helm-defense/enforce-symbol-owner", enforceSymbolOwnerRule, {
  valid: [
    {
      code: 'import type { ThreeTerrainApp } from "../../three/app.ts";',
      filename: file("src/components/example.tsx"),
      options: ownerOptions,
    },
    {
      code: "export type TerrainAssetBundle = { value: number };",
      filename: file("three/assets.ts"),
      options: ownerOptions,
    },
  ],
  invalid: [
    {
      code: 'import type { ThreeTerrainApp } from "../../three/assets.ts";',
      filename: file("src/components/example.tsx"),
      options: ownerOptions,
      errors: [{ messageId: "wrongImport" }],
    },
    {
      code: "export type TerrainAssetBundle = { value: number };",
      filename: file("three/codec.ts"),
      options: ownerOptions,
      errors: [{ messageId: "wrongDeclaration" }],
    },
  ],
});
