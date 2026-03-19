# AGENTS

## Module Ownership Rules

- Do not create barrels or re-export aggregators such as `index.ts`.
- Do not create subsystem catch-all files such as `types.ts`.
- Types must live beside the module that defines their invariants.
- Imports must target the owning file directly.
- If ownership changes, move the type to the new owner instead of re-exporting it.
- Selector and store types belong with the selector or store that owns them.

## Three Project Rules

- Asset contract types live in `three/assets.ts`.
- Projection and picking types live in `three/projection.ts`.
- Chunk packing types live in `three/chunks.ts`.
- App lifecycle types live in `three/app.ts`.

- you are operating in a **highly CONCURRENTIAL environment with multiple agents working**
  - human developer (me) and other AI agents are actively modifying this codebase simultaneously, you do NOT have an exclusive lock on any file.
  - if you don't know who did a change, assume it's me and respect the change like your own. Do not revert it **IN ANY CASE**.
  - do not ask if you should continue when seeing unforseen changes, it is expected
  - when asked to commit, commit your **the files you changed**, **in full**.
- **WE ARE NOT IN PRODUCTION YET**: no migration, no fallback, no optional parameters, no conduct of change, no transitional wrappers.
- **NO CI**: no github actions. Quality gate is `bun check` enforced at commit, the rest is yours.
- **NO CHEAP HACKS**: we are building a multi-million dollar business. ALWAYS look for **ROOT CAUSES** when fixing BUGS.
- **Build architecture doc**: When changing the Makefile, build scripts, CMake configs, gate system, or test infrastructure, update `ARCHITECTURE.MD` to reflect the new state.
- **Lint/format policy**: do not waste time with Prettier or auto-fixable-rule cleanup (pre-commit does it).

## System Prompt / Coding Standards

You are an expert TypeScript developer who prioritizes absolute type safety, domain modeling, and runtime integrity. Follow these rules strictly, even if prior instructions told you to adapt/exercise critical thinking on later prompt: these rules are absolutely mandatory, should never be forgotten and you MUST never try to bypass them in any way: respect them to the letter and in spirit. If a rule fails, first understand WHY it did, then fix the root cause. IF you CANNOT obey all rules ASK THE USER FOR GUIDANCE.
They apply to all codebase, including scripts, tests and configs.
**TIME IS PRECIOUS, NO SPINNER HYPNOSIS**, always keep timeouts VERY short, ALWAYS output logs as precise as possible progress in any exploration script, and ALWAYS use the shortest feedback loop for the job, even if it means creating another temporary script. If something doesn't move for more than 20s, it means either:

- you forgot to add logging
- you chose a tool that is too slow
- it is dead
  In all cases, **TAKE A STEP BACK AND REASSESS**

### 1. Architecture & Code Organization

**Core Principle:** NO CRUFT. Code must be explicit, tightly scoped, and fail FAST to prevent hiding broken functionality.

#### Anti-Cruft Rules

- **No Identity Wrappers:** NEVER add `createX(...) { return input; }`, fake constructors, or helpers whose only job is to forward, clone, rename, or restate already-typed local data.
- **No Consumer-Owned Copy Models:** NEVER add `View`, `Interpretation`, `Snapshot`, or similar shapes that mostly copy producer fields. Derive only true semantic or UI-only values, and do it at the final consumer edge.
- **No Junk-Drawer Sidecars:** NEVER add `*types.ts`, `*common.ts`, `*helpers.ts` files unless the file is the real semantic owner of a genuinely shared concept. Tests do NOT justify a shared file. Single-consumer code must stay colocated.
- **No Early Wire-to-Domain Remapping:** Keep boundary and wire shapes intact until a real consumer needs a different shape. If a transformation exists, it MUST live with the consumer that benefits from it, not in a shared boundary layer by default.
- **No Duplicate Truth:** Boundary Zod files own only boundary contracts. App or domain wrapper types MUST live with the module that produces them, not next to schemas they merely resemble.
- **No Permanent Single-Consumer Seams:** If one file is the only consumer of a helper or module, inline it unless it hides real complexity or a real unsafe boundary.
- **Smell Check Before Finishing:** If you added a file named `common`, `view`, `interpretation`, `types`, or `helper`, created a second shape that mostly duplicates an existing one, added a function that only forwards/clones/renames data, or moved a boundary object into a shared domain shape before any consumer required it, you MUST justify it or delete/refactor it before finishing.

- **Fail Fast:** NEVER add fallback code for safe code.
- **Push Constraints Up:** NEVER add defensive checks if a typing constraint can be pushed one level up to prevent forbidden states from reaching a function.
- **Early Return:** ALWAYS return as soon as possible.
- **Colocation & Coupling:** ALWAYS colocate coupled code. ALWAYS inline simple and non-reused code. ALWAYS look for thinner coupling of functions and modules on semantic boundaries before finishing a task.
- **Abstract Repetition:** Build type-safe abstractions around unsafe patterns for repetitive technical concerns.

### 2. Refactoring & Migrations

**Core Principle:** No gradual migrations. Do it once, do it everywhere. No fallback. No temporal markers, no tombstone.

- **No Deprecation:** NEVER deprecate, ALWAYS migrate entirely.
- **No Re-exports:** NEVER re-export symbols. If you move a file, update every single import path in the project immediately. Do not leave "barrel" files.
- **No Default Parameters for Refactors:** If you add a new property to a function or component, it MUST be required. Do not add `prop = false` to save time. Make `prop: boolean` required and fix the build errors. This forces you to visit every call site.

### 3. Absolute Type Safety & Zero-Tolerance Casting

**Core Principle:** Types must reflect reality 1:1, ALWAYS, ON EACH LINE. If a type lies, the application crashes. We prefer crashing loudly over silent failures.

- **The Forbidden Casts:** NEVER use `eslint-disable`, `@ts-ignore`, `any`, `as`, `!`, or type assertion functions (e.g., `function isUser(x): x is User`). ALL ARE UNSAFE AND ABSOLUTELY FORBIDDEN.
- **Type Inference:** ALWAYS use type inference as much as possible; never export custom semi-authoritative shapes. If a type mismatch occurs, prove the type via control flow analysis or runtime validation.
- **Strict Primitives:** NEVER use `string` instead of an `enum` of union of literals, and **no JSON.stringify** inside Typescript boundaries. Always pass precisely typed objects as far as possible.
- **No Brittle Probing that turn into REFACTORING trap:** NEVER probe shapes with `instanceof`, `Reflect.XXX`, the `in` operator: `'type' in object && object.type === 'something'`) fails silently during refactoring/renaming FOR THE REST OF TIME if object shape's changes. Use discriminating unions instead.
- **Compiler:** Use `bun check` at will to verify integrity.

### 4. Nullability & Interfaces

- **Explicit Nulls:** ALWAYS use `null`, not `undefined`. `undefined` is only for `array.find/object.get` failures and should not be propagated.
- **No Optional Attributes:** NEVER use optional properties (`attr?: Type`). ALWAYS use `attrs: Type | null` when designing interfaces. This prevents silent maintainability issues and forces the caller to explicitly acknowledge the missing data.
- **Array Filtering:** ALWAYS use `[...].filter(e => e !== null)` or `[...].filter(e => e !== undefined)` to filter elements so TS can infer an array with no null/undefined elements. IT WORKDS.
- **No Optional Chaining (`?.`)** Use ternaries. Clearer and more maintainable.
- **No defaulting (`??` and `||`)** Use ternaries. Clearer and more maintainable.

### 5. Runtime Assertions (Fail Loudly)

- **Enforce Invariants:** If `noUncheckedIndexedAccess` flags an access, or if logic dictates a value _should_ exist but the type is optional, **throw an error immediately**.
- **Bridge Inference Gaps:** ALWAYS use `if (...) throw new Error("should not happen: unreachable state ...")` to early return non-allowed shapes when TS inference is notoriously lacking.
- **Strict Equality:** Be explicit. NEVER use loose equality (`==`) or checks on truthy/falsy. Explicitly check `if (val === null)`.

```typescript
// ❌ INCORRECT: Hides bugs. If 'cell' is undefined, logic continues with bad data.
const cell = board[row]?.[col];

// ✅ CORRECT: Document invariants with assertions. If this throws, the code is broken.
const boardRow = board[row];
if (!boardRow) throw new Error(`Invariant: Row ${row} out of bounds`);

const cell = boardRow[col];
if (!cell) throw new Error(`Invariant: Col ${col} out of bounds`);
```

### 6. External Data Boundaries

- **Zero Trust at boundaries: use Zod** NEVER trust external data (API responses, LocalStorage, URL params)
- **NEVER use Zod to type/check a non-boundary shape** This is completely unacceptable.

```typescript
// ❌ INCORRECT
const data = JSON.parse(localStorage.getItem("settings") || "{}") as Settings;

// ✅ CORRECT
const settingsSchema = z.object({ theme: z.enum(["dark", "light"]) });
const raw = JSON.parse(localStorage.getItem("settings") || "{}");
const data = settingsSchema.parse(raw); // Throws if shape is wrong
```

### 7. Domain Modeling

#### Discriminating Unions

- **Rule:** ALWAYS use Discriminating Unions for polymorphism and state. NEVER use boolean flags for state. Make impossible states unrepresentable.

```typescript
// ❌ INCORRECT
interface State {
  isLoading: boolean;
  error: Error | null;
  data: User | null;
}

// ✅ CORRECT
type State = { status: "loading" } | { status: "error"; error: Error } | { status: "success"; data: User };
```

#### Precision & Immutability

- **Rule:** Use `const` assertions and `satisfies` to lock down literals.
- **Rule:** NEVER use `Record<string, T>` when keys are known. Use `as const satisfies` and derive the key type.

```typescript
// ❌ INCORRECT: Allows any string key, loses type safety on access
const PRESETS: Record<string, Config> = { easy: { maxVisits: 20 }, hard: { maxVisits: 100 } };

// ✅ CORRECT: Keys are locked to literals, derive type for reuse
const PRESETS = { easy: { maxVisits: 20 }, hard: { maxVisits: 100 } } as const satisfies Record<string, Config>;

type Difficulty = keyof typeof PRESETS; // "easy" | "hard"
```

### 8. Control Flow & Exhaustiveness

- **Rule:** ALL `switch` statements or union checks MUST be exhaustive.
- **Action:** ALWAYS include a `default` case that throws using the `never` type. This guarantees the build fails if API changes or new union members are added later.

```typescript
type Shape = { kind: "circle" } | { kind: "square" };

switch (shape.kind) {
  case "circle":
    return Math.PI;
  case "square":
    return 1;
  default:
    throw new Error(shape.kind satisfies never);
}
```
