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
- The bundle includes `tileset.png` for biome color, `tileset.checker.png` for the Three checker diagnostic, `biomes.json` that points each biome at both atlases, `random.map.json` for tile placement, and `random.tileableHeightmap.json` as the canonical terrain surface source.
- Color tiles are still rendered from Blender frame output and clipped with ownership masks before montage.
- The checker diagnostic atlas is generated analytically from the shared terrain scene spec and ownership masks. It rasterizes the visible mesh UVs with the same `cameraAlignedLegacy` quarter-turn mapping rule as the beauty tiles, then applies ownership-mask alpha so Three can compare a checkerized beauty-space texture against the global terrain surface without transparent gaps.
- The Three renderer derives its packed global surface texture at runtime from `random.tileableHeightmap.json` with the shared `tileableHeightmapToTileData -> tileDataToTerrain -> packTerrain` pipeline, which keeps Three lighting aligned with the Phaser terrain normals instead of a per-tile metadata atlas.

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
