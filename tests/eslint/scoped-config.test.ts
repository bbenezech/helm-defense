import path from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({
    overrideConfigFile: path.join(process.cwd(), "eslint.config.ts"),
  });
});

async function getRuleIds(code: string, relativePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(process.cwd(), relativePath),
  });
  return result.messages.map((message) => message.ruleId).filter((ruleId): ruleId is string => ruleId !== null);
}

describe("scoped eslint config", () => {
  it("flags explicit any in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("export function read(value: any) { return value; }", "three/assets.ts");
    expect(ruleIds).toContain("@typescript-eslint/no-explicit-any");
  });

  it("flags type assertions in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("const value = input as number;", "three/assets.ts");
    expect(ruleIds).toContain("no-restricted-syntax");
  });

  it("flags non-null assertions in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("const value = input!;", "three/assets.ts");
    expect(ruleIds).toContain("@typescript-eslint/no-non-null-assertion");
  });

  it("flags optional chaining in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("const value = input?.value;", "three/assets.ts");
    expect(ruleIds).toContain("no-restricted-syntax");
  });

  it("flags nullish coalescing in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("const value = input ?? fallback;", "three/assets.ts");
    expect(ruleIds).toContain("no-restricted-syntax");
  });

  it("flags logical-or assignment in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("value ||= fallback;", "three/assets.ts");
    expect(ruleIds).toContain("no-restricted-syntax");
  });

  it("flags optional API surface in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("type Options = { value?: number };", "src/store/index.ts");
    expect(ruleIds).toContain("helm-defense/no-optional-api");
  });

  it("flags eslint-disable comments in AGENTS-enforced files", async () => {
    const ruleIds = await getRuleIds("/* eslint-disable */\nexport const value = 1;", "src/components/game.tsx");
    expect(ruleIds).toContain("unicorn/no-abusive-eslint-disable");
  });
});
