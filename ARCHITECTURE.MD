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

## Terrain Assets

- `bun run tile ...` generates the checked-in terrain asset bundle under `public/<tileset>/`.
- The bundle now includes `tileset.png` for biome color, `tileset.metadata.png` for world-space geometric normals, and `biomes.json` that points each biome at both atlases.
- Color tiles are still rendered from Blender frame output and clipped with ownership masks before montage.
- The metadata atlas is rasterized from the shared terrain scene specification with the same ownership coverage, so the Three renderer can sample per-pixel normals from the winning terrain texel without a separate runtime fallback.

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
