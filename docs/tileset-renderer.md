# Tileset Renderer

The active terrain tileset pipeline is now fully CPU-driven. `scripts/tileset.ts` reads the shared terrain scene spec, rasterizes the visible UVs for each of the 19 slope poses, samples the source texture with nearest-neighbor lookup, and writes `tileset.png` directly without Blender, Python, or ImageMagick.

## Active Render Contract

These values are the gameplay-facing terrain asset contract and now live in `scripts/lib/terrain-scene-spec.ts` plus `scripts/lib/terrain-scene-spec.json`:

| Setting             | Value                 |
| ------------------- | --------------------- |
| Resolution          | `128 x 96`            |
| Frame range         | `4..22`               |
| Frame count         | `19`                  |
| Tile order owner    | `ORDERED_SLOPES`      |
| Texture rotation    | `cameraAlignedLegacy` |
| Sampling            | nearest-neighbor      |
| UV outside range    | clamp to edge         |
| Owned pixel alpha   | `255`                 |
| Unowned pixel color | transparent black     |

The fixed scene spec still defines the orthographic camera, the mesh polygons, the UVs, and the 19 pose transforms. It also carries the explicit per-pose texture quarter turn that keeps beauty and checker textures screen-locked even when a pose is not derivable from `rotationZRad` alone. The runtime-facing metadata contract remains the same: `tileset.json` still uses `128 x 96` tiles with the same `elevationYOffsetPx`, ordering, rows, and columns as before.

## Pipeline Notes

- `scripts/tileset.ts` now writes the generated bundle directly next to the source `texture.png`. Running `bun run tile public/Grass_23-512x512/texture.png` regenerates the active bundle in `public/Grass_23-512x512/`.
- `tileset.png` is produced by `scripts/lib/terrain-raster.ts`. The rasterizer reuses the shared visible-UV rasterization, applies the same explicit per-pose `cameraAlignedLegacy` quarter-turn contract as the checker path, samples the source RGBA texture exactly once per visible owned seed pixel, and flood-fills ownership-only leftovers from neighboring seeded colors so there are no transparent gaps.
- The rasterizer fails fast if an owned pixel would expose a fully transparent source texel. That keeps the beauty atlas honest instead of silently revealing undefined RGB.
- `tileset.checker.png` stays analytic. It is still generated from the shared scene spec and ownership masks in `scripts/lib/terrain-ownership.ts`; it is not derived from the beauty atlas.
- Because the beauty path is now deterministic nearest-neighbor rasterization, the output is intentionally harder-edged than the old filtered Blender render.

## CLI

There is now a single production path:

```bash
bun run tile public/Grass_23-512x512/texture.png
```

There is no `--sampling-profile`, no `BLENDER_BIN`, and no external image montage step anymore.

## Validation

### Raster Parity

`bun run validate:tileset-raster` renders a canonical checker source texture through the CPU beauty rasterizer and compares the result to `tileset.checker.png` with exact RGBA equality.

It emits:

- `reference-atlas.png`
- `raster-atlas.png`
- `diff-atlas.png`
- `summary.json`
- per-frame `reference.png`, `raster.png`, `diff.png`, and `summary.json`

under `tmp/tileset-raster-report/`.

```bash
bun run validate:tileset-raster public/Grass_23-512x512
```

The validator is expected to reach `0` mismatched pixels. There is no boundary-blend bucket anymore because the CPU rasterizer and the analytic checker atlas share the same deterministic contract.

### Compass Rotation Check

`bun run validate:tileset-compass` renders `assets/compass.png` through the same CPU rasterizer, extracts the four cardinal needles from the monochrome silhouette, tints them inside the validator, and checks all 19 terrain tiles. This catches pose-specific half-turn and mirror mistakes that a plain checker cannot see.

It emits:

- `source-compass.png`
- `tinted-compass.png`
- `raster-atlas.png`
- per-frame `raster.png`, `overlay.png`, and `summary.json`

under `tmp/tileset-compass-report/`.

```bash
bun run validate:tileset-compass public/Grass_23-512x512
```

### Native Coverage Proof

`bun run validate:terrain-coverage` still compares atlas alpha against the ownership oracle generated from the same terrain scene contract. It enforces:

- no uncovered pixels
- no overlap
- no stray coverage
- no wrong-owner pixels

```bash
bun run validate:terrain-coverage public/Grass_23-512x512
```

### Three Resolver Proof

`bun run validate:three-resolve` is unchanged in purpose: it checks that the CPU-side Three packed-terrain resolver still matches the same ownership oracle the asset pipeline targets.

```bash
bun run validate:three-resolve public/Grass_23-512x512
```

## Regression Check

The safest verification loop is now contract-first:

1. Run `bun run tile public/Grass_23-512x512/texture.png`.
2. Run `bun run validate:tileset-compass public/Grass_23-512x512`.
3. Run `bun run validate:tileset-raster public/Grass_23-512x512`.
4. Run `bun run validate:terrain-coverage public/Grass_23-512x512`.
5. Optionally run `bun run validate:three-resolve public/Grass_23-512x512`.
6. Spot-check steep and diagonal frames in `tileset.png` against the example map if you want a visual confirmation that orientation still matches `ORDERED_SLOPES`.
