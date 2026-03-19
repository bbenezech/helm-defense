const noBarrelReexportRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow re-export aggregators in AGENTS-enforced files.",
    },
    schema: [],
    messages: {
      forbidden: "Re-export aggregators are forbidden. Import from and export within the owning file directly.",
    },
  },
  create(context: { report: (descriptor: { node: unknown; messageId: string }) => void }) {
    return {
      ExportAllDeclaration(node: unknown) {
        context.report({ node, messageId: "forbidden" });
      },
      ExportNamedDeclaration(node: { source: unknown } | unknown) {
        if (typeof node === "object" && node !== null && "source" in node && node.source !== null) {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

export default noBarrelReexportRule;
