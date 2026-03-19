import path from "node:path";

function getRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

function getString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((entry) => typeof entry !== "string")) return null;
  return value.filter((entry) => typeof entry === "string");
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function getProjectRelativePath(filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return normalizePath(path.relative(process.cwd(), absolutePath));
}

function getOwnerBySymbol(options: unknown): Map<string, string> {
  const ownerBySymbol = new Map<string, string>();
  const optionsRecord = getRecord(options);
  if (optionsRecord === null) return ownerBySymbol;

  const ownersRecord = getRecord(optionsRecord["owners"]);
  if (ownersRecord === null) return ownerBySymbol;

  for (const [ownerPath, ownedSymbolsValue] of Object.entries(ownersRecord)) {
    const ownedSymbols = getStringArray(ownedSymbolsValue);
    if (ownedSymbols === null) continue;

    for (const ownedSymbol of ownedSymbols) {
      ownerBySymbol.set(ownedSymbol, normalizePath(ownerPath));
    }
  }

  return ownerBySymbol;
}

function getNodeType(node: unknown): string | null {
  const nodeRecord = getRecord(node);
  if (nodeRecord === null) return null;
  return getString(nodeRecord["type"]);
}

function getIdentifierName(node: unknown): string | null {
  const nodeRecord = getRecord(node);
  if (nodeRecord === null) return null;
  return getString(nodeRecord["name"]);
}

function getImportedSymbolName(specifier: unknown): string | null {
  const specifierRecord = getRecord(specifier);
  if (specifierRecord === null) return null;

  if (getNodeType(specifierRecord) !== "ImportSpecifier") return null;

  const importedNode = specifierRecord["imported"];
  const importedName = getIdentifierName(importedNode);
  if (importedName !== null) return importedName;

  const importedRecord = getRecord(importedNode);
  if (importedRecord === null) return null;
  return getString(importedRecord["value"]);
}

function getDeclarationNames(node: unknown): string[] {
  const nodeRecord = getRecord(node);
  if (nodeRecord === null) return [];

  const nodeType = getNodeType(nodeRecord);
  if (
    nodeType === "ClassDeclaration" ||
    nodeType === "FunctionDeclaration" ||
    nodeType === "TSDeclareFunction" ||
    nodeType === "TSEnumDeclaration" ||
    nodeType === "TSInterfaceDeclaration" ||
    nodeType === "TSTypeAliasDeclaration"
  ) {
    const identifierName = getIdentifierName(nodeRecord["id"]);
    return identifierName === null ? [] : [identifierName];
  }

  if (nodeType !== "VariableDeclaration") return [];

  const declarations = nodeRecord["declarations"];
  if (!Array.isArray(declarations)) return [];

  const names: string[] = [];
  for (const declaration of declarations) {
    const declarationRecord = getRecord(declaration);
    if (declarationRecord === null) continue;
    const identifierName = getIdentifierName(declarationRecord["id"]);
    if (identifierName === null) continue;
    names.push(identifierName);
  }

  return names;
}

type ReportDescriptor = {
  node: unknown;
  messageId: string;
  data?: Record<string, string>;
};

type RuleContext = {
  filename: string;
  options?: unknown[];
  report: (descriptor: ReportDescriptor) => void;
};

const enforceSymbolOwnerRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce direct imports and declarations from the file that owns each symbol.",
    },
    schema: [
      {
        type: "object",
        properties: {
          owners: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        required: ["owners"],
        additionalProperties: false,
      },
    ],
    messages: {
      wrongImport: 'Symbol "{{symbolName}}" must be imported from "{{ownerPath}}" directly.',
      wrongDeclaration: 'Symbol "{{symbolName}}" must be declared in "{{ownerPath}}" directly.',
    },
  },
  create(context: RuleContext) {
    const ownerBySymbol = getOwnerBySymbol(context.options === undefined ? null : context.options[0]);
    const currentFilePath = getProjectRelativePath(context.filename);

    return {
      ImportDeclaration(node: unknown) {
        const nodeRecord = getRecord(node);
        if (nodeRecord === null) return;

        const sourceRecord = getRecord(nodeRecord["source"]);
        if (sourceRecord === null) return;

        const sourceValue = getString(sourceRecord["value"]);
        if (sourceValue === null || !sourceValue.startsWith(".")) return;

        const importedFilePath = getProjectRelativePath(path.resolve(path.dirname(context.filename), sourceValue));
        const specifiers = nodeRecord["specifiers"];
        if (!Array.isArray(specifiers)) return;

        for (const specifier of specifiers) {
          const importedSymbolName = getImportedSymbolName(specifier);
          if (importedSymbolName === null) continue;

          const ownerPath = ownerBySymbol.get(importedSymbolName);
          if (ownerPath === undefined || ownerPath === importedFilePath) continue;

          context.report({
            node: specifier,
            messageId: "wrongImport",
            data: { symbolName: importedSymbolName, ownerPath },
          });
        }
      },
      ExportNamedDeclaration(node: unknown) {
        const nodeRecord = getRecord(node);
        if (nodeRecord === null) return;

        const declaration = nodeRecord["declaration"];
        if (declaration === null || declaration === undefined) return;

        for (const declarationName of getDeclarationNames(declaration)) {
          const ownerPath = ownerBySymbol.get(declarationName);
          if (ownerPath === undefined || ownerPath === currentFilePath) continue;

          context.report({
            node: declaration,
            messageId: "wrongDeclaration",
            data: { symbolName: declarationName, ownerPath },
          });
        }
      },
    };
  },
};

export default enforceSymbolOwnerRule;
