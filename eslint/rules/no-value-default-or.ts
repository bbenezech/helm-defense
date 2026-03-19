function isNodeRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isControlFlowTestContext(node: { parent?: unknown } | unknown): boolean {
  let current = node;

  while (isNodeRecord(current) && "parent" in current) {
    const parent = current["parent"];
    if (!isNodeRecord(parent)) return false;

    if (
      (parent["type"] === "IfStatement" && parent["test"] === current) ||
      (parent["type"] === "WhileStatement" && parent["test"] === current) ||
      (parent["type"] === "DoWhileStatement" && parent["test"] === current) ||
      (parent["type"] === "ForStatement" && parent["test"] === current) ||
      (parent["type"] === "ConditionalExpression" && parent["test"] === current)
    ) {
      return true;
    }

    if (parent["type"] === "LogicalExpression" || (parent["type"] === "UnaryExpression" && parent["operator"] === "!")) {
      current = parent;
      continue;
    }

    return false;
  }

  return false;
}

const noValueDefaultOrRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow value-position logical-or defaulting in AGENTS-enforced files.",
    },
    schema: [],
    messages: {
      forbidden:
        "Value-position `||` defaulting is forbidden in scoped AGENTS-enforced files. Use an explicit branch instead.",
    },
  },
  create(context: { report: (descriptor: { node: unknown; messageId: string }) => void }) {
    return {
      LogicalExpression(node: { operator?: string } | unknown) {
        if (typeof node !== "object" || node === null || !("operator" in node) || node.operator !== "||") return;
        if (isControlFlowTestContext(node)) return;
        context.report({ node, messageId: "forbidden" });
      },
    };
  },
};

export default noValueDefaultOrRule;
