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
- Biome generation: `bun biome <source.png>`
- Tileset compass validation: `bun run validate:tileset-compass [tileset-directory] --report-dir <dir>`
- Tileset raster validation: `bun run validate:tileset-raster [tileset-directory] --report-dir <dir>`
- Terrain coverage validation: `bun run validate:terrain-coverage ...`
- Test suite: `bun run test`

## Terrain Assets

- `downloads/` is the raw, uncommitted holding area for candidate textures and triage material. `assets/` contains only active source PNGs that we intentionally build from.
- `three/biome.json` is the checked-in runtime terrain contract for the shared 19-slope tileset layout. It owns the common tile order, atlas geometry, and `elevationYOffsetPx`.
- `bun biome <source.png>` accepts any PNG path, derives the lowercase biome id from the source basename, recreates `public/biome/<id>/`, copies the input to `source.png`, and writes the generated runtime atlas to `tileset.png`.
- A biome runtime folder now contains exactly two generated assets: `source.png` and `tileset.png`.
- The Three runtime does not fetch map JSON or biome manifests anymore. `three/assets.ts` imports `three/biome.json`, generates the default terrain map and deterministic two-biome ownership grid in code, loads `grass` and `mud` as the beauty atlas array, and loads `checkers` as the dedicated checker/debug atlas.
- Color tiles are now rasterized deterministically on the CPU from the shared terrain scene spec, visible UV coverage, and ownership masks. The beauty path uses nearest-neighbor texture sampling, clamp-to-edge UV behavior, and an ownership flood fill for UV-invisible owned leftovers so `tileset.png` has no transparent holes.
- The Three renderer now uses two terrain data maps at runtime. The packed 8-slice terrain stack remains the visibility structure whose word is `shapeRef + biomeIndex + baseHeightLevel`, while a separate logical world-cell surface map stores the topmost non-empty terrain cell at each `(mapX, mapY)` using the same word layout. Pass 1 resolves the visible beauty/checker color from the packed stack, computes exact coarse world height analytically from the winning tile, and computes a smoothed lighting normal from the world-cell surface map.
- Pass 2 is now the final terrain-and-sea composite. Dry terrain lighting still comes entirely from the pass-1 attachments, and the stylized sea renderer applies a global animated water level on top with pure threshold flooding, depth-based transmittance, Voronoi-driven foam/caustics, and no extra asset files or extra fullscreen pass.

## Terrain Validation

- `scripts/lib/terrain-coverage-proof.ts` owns the native terrain placement contract used by validators and tests. It is the shared semantic proof for fixture placement, canvas bounds, and coverage composition against the canonical `128 x 96 / 64 / 16` terrain geometry.
- `bun run validate:tileset-compass ...` renders `scripts/fixtures/compass.png` through the CPU beauty rasterizer using the shared `three/biome.json` layout. It checks all 19 terrain poses and emits `source-compass.png`, `tinted-compass.png`, `raster-atlas.png`, plus per-frame `raster.png`, `overlay.png`, and `summary.json` under `tmp/tileset-compass-report/`.
- `bun run validate:tileset-raster ...` rerenders a biome folder’s `source.png` through the CPU beauty rasterizer using `three/biome.json`, compares the result to that folder’s `tileset.png`, and emits `reference-atlas.png`, `raster-atlas.png`, `diff-atlas.png`, `summary.json`, and per-frame diagnostics under `tmp/tileset-raster-report/`.
- `bun run validate:terrain-coverage ...` compares a biome folder’s generated `tileset.png` atlas against the ownership oracle defined by the shared `three/biome.json` contract and emits per-fixture overlap, uncovered, stray, and wrong-owner diagnostics under `tmp/terrain-coverage-report/`.
- The Three-side correctness loop is now test-first: the packed terrain codec is covered by ownership oracle tests, and the analytic surface evaluator is covered against the canonical `tileDataToTerrain(...)` output across the shipped terrain poses.

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- ESLint is intentionally focused on runtime/app modules; `tests/**` and `scripts/**` rely on TypeScript plus their own execution paths instead of lint coverage.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
