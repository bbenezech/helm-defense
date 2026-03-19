# Architecture

## Toolchain

- Package manager and script runner: Bun (`packageManager` in `package.json`)
- Web app build and dev server: Vite
- Desktop shell: Electron
- TypeScript project build/check: `tsgo --build`
- Test runner: Vitest

## Primary Commands

- Install dependencies: `bun install`
- Type-check/build graph: `bun check`
- Web dev server: `bun run start`
- Web demo entry: `bun run demo`
- Production build: `bun run build`
- Electron dev loop: `bun run electron:dev`
- Tileset generation: `bun run tile ...`
- Terrain coverage validation: `bun run validate:terrain-coverage ...`
- Test suite: `bun run test`

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
