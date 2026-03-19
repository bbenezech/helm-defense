function isParameterParent(parent: unknown): parent is { params: unknown[] } {
  if (typeof parent !== "object" || parent === null) return false;
  if (!("params" in parent)) return false;
  return Array.isArray(parent.params);
}

const noOptionalApiRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow optional API surface in AGENTS-enforced files.",
    },
    schema: [],
    messages: {
      optionalProperty: "Optional properties are forbidden in scoped AGENTS-enforced files.",
      optionalParameter: "Optional function parameters are forbidden in scoped AGENTS-enforced files.",
      optionalMethod: "Optional methods are forbidden in scoped AGENTS-enforced files.",
    },
  },
  create(context: { report: (descriptor: { node: unknown; messageId: string }) => void }) {
    return {
      TSPropertySignature(node: { optional?: boolean } | unknown) {
        if (typeof node === "object" && node !== null && "optional" in node && node.optional === true) {
          context.report({ node, messageId: "optionalProperty" });
        }
      },
      PropertyDefinition(node: { optional?: boolean } | unknown) {
        if (typeof node === "object" && node !== null && "optional" in node && node.optional === true) {
          context.report({ node, messageId: "optionalProperty" });
        }
      },
      TSMethodSignature(node: { optional?: boolean } | unknown) {
        if (typeof node === "object" && node !== null && "optional" in node && node.optional === true) {
          context.report({ node, messageId: "optionalMethod" });
        }
      },
      Identifier(node: { optional?: boolean; parent?: unknown } | unknown) {
        if (typeof node !== "object" || node === null || !("optional" in node) || node.optional !== true) return;
        if (!("parent" in node) || node.parent === undefined) return;
        if (!isParameterParent(node.parent)) return;
        if (!node.parent.params.includes(node)) return;
        context.report({ node, messageId: "optionalParameter" });
      },
      ObjectPattern(node: { optional?: boolean; parent?: unknown } | unknown) {
        if (typeof node !== "object" || node === null || !("optional" in node) || node.optional !== true) return;
        if (!("parent" in node) || node.parent === undefined) return;
        if (!isParameterParent(node.parent)) return;
        if (!node.parent.params.includes(node)) return;
        context.report({ node, messageId: "optionalParameter" });
      },
      ArrayPattern(node: { optional?: boolean; parent?: unknown } | unknown) {
        if (typeof node !== "object" || node === null || !("optional" in node) || node.optional !== true) return;
        if (!("parent" in node) || node.parent === undefined) return;
        if (!isParameterParent(node.parent)) return;
        if (!node.parent.params.includes(node)) return;
        context.report({ node, messageId: "optionalParameter" });
      },
    };
  },
};

export default noOptionalApiRule;
