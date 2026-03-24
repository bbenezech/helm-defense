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
- Tileset compass validation: `bun run validate:tileset-compass [tileset-directory] --report-dir <dir>`
- Tileset raster validation: `bun run validate:tileset-raster [tileset-directory] --report-dir <dir>`
- Terrain coverage validation: `bun run validate:terrain-coverage ...`
- Test suite: `bun run test`

## Terrain Assets

- `bun run tile ...` generates the terrain asset bundle directly next to the source `texture.png`. For the checked-in sample, `bun run tile public/Grass_23-512x512/texture.png` regenerates the bundle under `public/Grass_23-512x512/`.
- The runtime bundle includes `tileset.png` for biome color, `tileset.checker.png` for the optional checker debug view, `biomes.json` that points each biome at the color and checker atlases, and `random.map.json` for tile placement.
- Color tiles are now rasterized deterministically on the CPU from the shared terrain scene spec, visible UV coverage, and ownership masks. The beauty path uses nearest-neighbor texture sampling, clamp-to-edge UV behavior, and an ownership flood fill for UV-invisible owned leftovers so `tileset.png` has no transparent holes.
- The checker atlas is generated from the same ownership masks and UV contract as the beauty atlas. In Three it is a debug-only RGB source switch; visibility always comes from beauty alpha.
- The Three renderer now uses a packed terrain tilemap whose word is `shapeRef + biomeIndex + baseHeightLevel`. Pass 1 resolves the visible beauty/checker color and computes exact coarse world height and world normal analytically from the canonical 19-shape terrain contract. Pass 2 performs lighting from the pass-1 attachments.

## Terrain Validation

- `scripts/lib/terrain-coverage-proof.ts` owns the native terrain placement contract used by validators and tests. It is the shared semantic proof for fixture placement, canvas bounds, and coverage composition against the canonical `128 x 96 / 64 / 16` terrain geometry.
- `bun run validate:tileset-compass ...` renders the vendored `assets/compass.png` through the CPU beauty rasterizer after extracting and tinting the four cardinal needles. It checks all 19 terrain poses, so pose-specific mirror or half-turn mistakes cannot hide behind representative sampling, and emits `source-compass.png`, `tinted-compass.png`, `raster-atlas.png`, plus per-frame `raster.png`, `overlay.png`, and `summary.json` under `tmp/tileset-compass-report/`.
- `bun run validate:tileset-raster ...` generates a canonical UV-space checker source texture, renders it through the CPU beauty rasterizer, compares the result to `tileset.checker.png` with exact RGBA equality, and emits `reference-atlas.png`, `raster-atlas.png`, `diff-atlas.png`, `summary.json`, and per-frame diagnostics under `tmp/tileset-raster-report/`.
- `bun run validate:terrain-coverage ...` compares the generated `tileset.png` atlas against the ownership oracle and emits per-fixture overlap, uncovered, stray, and wrong-owner diagnostics under `tmp/terrain-coverage-report/`.
- The Three-side correctness loop is now test-first: the packed terrain codec is covered by ownership oracle tests, and the analytic surface evaluator is covered against the canonical `tileDataToTerrain(...)` output across the shipped terrain poses.

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
