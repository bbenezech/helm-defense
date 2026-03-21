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
- Checker atlas validation: `bun run validate:checker-atlas [tileset-directory] --report-dir <dir>`
- Terrain coverage validation: `bun run validate:terrain-coverage ...`
- Three resolver validation: `bun run validate:three-resolve [tileset-directory] --fixture <name|all> --report-dir <dir>`
- Test suite: `bun run test`

## Terrain Assets

- `bun run tile ...` generates the checked-in terrain asset bundle under `public/<tileset>/`.
- The bundle includes `tileset.png` for biome color, `tileset.checker.png` for the Three checker diagnostic, `biomes.json` that points each biome at the color and checker atlases, `random.map.json` for tile placement, and `random.tileableHeightmap.json` as the canonical terrain surface source.
- Color tiles are still rendered from Blender frame output and clipped with ownership masks before montage.
- The checker diagnostic atlas is generated analytically from the shared terrain scene spec and ownership masks. It rasterizes the visible mesh UVs with the same `cameraAlignedLegacy` quarter-turn mapping rule as the beauty tiles, then applies ownership-mask alpha so Three can compare a checkerized beauty-space texture against the global terrain surface without transparent gaps.
- The Three renderer derives its packed global surface texture at runtime from `random.tileableHeightmap.json` with the shared `tileableHeightmapToTileData -> tileDataToTerrain -> packTerrain` pipeline, which keeps Three lighting aligned with the Phaser terrain normals instead of a per-tile metadata atlas.

## Terrain Validation

- `scripts/lib/terrain-coverage-proof.ts` owns the native terrain placement contract used by validators and tests. It is the shared semantic proof for fixture placement, canvas bounds, and coverage composition against the canonical `128 x 96 / 64 / 16` terrain geometry.
- `bun run validate:checker-atlas ...` generates a canonical UV-space checker source texture, renders it through the Blender terrain scene, ownership-clips the output frames, and emits `reference-atlas.png`, `blender-atlas.png`, `diff-atlas.png`, `boundary-diff-atlas.png`, `summary.json`, and per-frame diagnostics under `tmp/checker-atlas-report/`.
- Checker-atlas summaries now separate raw mismatch counts from mismatch classifications. `boundaryBlendDarkPixels` and `boundaryBlendLightPixels` capture expected checker-cell edge blending on seed-backed owned pixels; `unexpectedOwnedMismatchPixels` and `unexpectedBackgroundMismatchPixels` are the actionable buckets and sum to `unexpectedMismatchPixels`.
- `bun run validate:terrain-coverage ...` compares the generated `tileset.png` atlas against the ownership oracle and emits per-fixture overlap, uncovered, stray, and wrong-owner diagnostics under `tmp/terrain-coverage-report/`.
- `bun run validate:three-resolve ...` compares the CPU-side Three packed-terrain resolver against the same ownership oracle by feeding it a synthetic atlas whose alpha channel is the oracle mask itself.
- The Three resolver validator emits per-fixture `oracle.png`, `resolve.png`, `diff.png`, `summary.json`, and `first-failure.json` reports. `first-failure.json` includes the first failing pixel plus the full reverse-painter candidate trace so resolver bugs can be debugged from CPU artifacts before touching WGSL or browser captures.
- The intended debugging loop is oracle-first: fix the CPU resolver until `validate:three-resolve` reaches zero uncovered, stray, and wrong-owner pixels, then mirror the exact math into the Three WGSL path, and only then use browser checker captures as a human-facing confirmation pass.

## Quality Gate

- The repo-level compiler gate is `bun check`, which resolves to `tsgo --build`.
- Formatting and other auto-fixable cleanup are expected to be handled outside CI/pre-commit policy, not by a hosted pipeline.
