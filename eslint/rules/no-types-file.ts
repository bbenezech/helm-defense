import path from "node:path";

const noTypesFileRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow catch-all types.ts files in AGENTS-enforced files.",
    },
    schema: [],
    messages: {
      forbidden: "Catch-all files named `types.ts` are forbidden. Move types beside the module that owns them.",
    },
  },
  create(context: { filename: string; report: (descriptor: { node: unknown; messageId: string }) => void }) {
    return {
      Program(node: unknown) {
        const basename = path.basename(context.filename);
        if (basename === "types.ts" || basename === "types.tsx") {
          context.report({ node, messageId: "forbidden" });
        }
      },
    };
  },
};

export default noTypesFileRule;
