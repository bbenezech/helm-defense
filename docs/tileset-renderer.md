# Tileset Renderer

The active terrain tileset renderer no longer depends on loading a binary `.blend` scene. `scripts/tileset.ts` now launches Blender in background mode with `scripts/render_tileset.py`, which recreates the terrain mesh, camera, materials, and 19-frame slope animation directly in `bpy`.

## Active Render Contract

These values are treated as fixed gameplay-facing output contract and are mirrored in `scripts/lib/blender.ts`:

| Setting | Value |
| --- | --- |
| Camera type | Orthographic |
| Camera location | `(10, -10, 8.16)` |
| Camera rotation | `(60 deg, 0 deg, 45 deg)` |
| Ortho scale | `2.8` |
| Resolution | `128 x 96` |
| Frame range | `4..22` |
| Cycles sampling | `10` render samples, `10` preview samples |
| Cycles filtering | `GAUSSIAN`, width `0.01`, denoising off |
| Output path | `scripts/out` |
| Active variant | `tiles-no-shading-rotation-fast` |
| Default sampling profile | `nativeExact` |

The frame count is intentionally tied to `ORDERED_SLOPES`, so the scripted render still emits one PNG per terrain slope in the same order as the runtime tileset metadata.

## Variant Parameters

The Python builder is parametric even though only the live variant is wired into `scripts/tileset.ts` today.

| Variant knob | Options | Meaning |
| --- | --- | --- |
| `engine` | `BLENDER_EEVEE_NEXT`, `CYCLES` | Matches the old normal vs fast scene family |
| `shading` | `flat`, `shaded` | `flat` keeps all emission strengths at `1.0`; `shaded` uses `2.0 / 1.0 / 0.5` for light/med/dark materials |
| `textureRotation` | `none`, `quarterTurn`, `cameraAlignedLegacy` | `quarterTurn` applies a literal static UV mapping-node turn; `cameraAlignedLegacy` animates the mapping node so texture north stays on the upper-right screen edge while the terrain mesh rotates through slope variants |
| `samplingProfile` | `legacyMatched`, `strictPixel`, `nativeExact` | `nativeExact` is now the default production path: it keeps the beauty render look but replaces frame alpha with deterministic ownership masks before montage. `legacyMatched` keeps the current `Linear` sampler and legacy-soft alpha edges; `strictPixel` switches the texture nodes to `Closest` and hardens every rendered frame to binary alpha before montage |

The live production path currently uses:

```text
engine = CYCLES
shading = flat
textureRotation = cameraAlignedLegacy
samplingProfile = nativeExact
```

## Pipeline Notes

- `scripts/tileset.ts` still copies the source texture to `scripts/texture.png`, renders frame PNGs to `scripts/out`, then assembles `tileset.png`, `tileset.json`, maps, and derived height/normal maps exactly as before.
- `tileset.checker.png` is not a beauty render. It is rasterized directly from the shared terrain scene spec and ownership logic, then quantized onto the same per-tile surface-texel lattice that feeds the packed terrain surface, so the Three checker diagnostic matches terrain-space surface lookups instead of per-face beauty UVs or continuous beauty-space interpolation.
- `elevationYOffsetPx` still comes from the rendered tile dimensions, so the runtime tile contract remains `128 x 96` render size with `16px` vertical offset and `64px` logical diamond height.
- The pixel-art look depends on the render settings as much as the mesh: the active Cycles path keeps denoising off and uses a tiny `0.01` Gaussian pixel filter, which matches the legacy `.blend` scenes much more closely than Blender's softer defaults.
- The rotated legacy scenes were authored against a screen-space rule, not just a static UV rule: texture north should keep reading along the upper-right edge of the diamond even as the terrain mesh rotates. In the procedural builder `cameraAlignedLegacy` reproduces that by counter-rotating the mapping node per frame instead of hardcoding one `-pi/2` turn.
- `strictPixel` is intentionally harsher than the production default. It keeps the same geometry, camera, and north-locking rule, but it samples the source texture with `Closest` and then thresholds the alpha channel of every frame to `0/255` before montage so the final silhouettes are hard-edged.
- `nativeExact` is the proof profile. It renders the same beauty RGB as `legacyMatched`, then clips every frame with a deterministic ownership mask generated from `scripts/lib/terrain-ownership.ts`. The ownership masks use the shared scene spec plus a half-open native tile rule: the top surface owns `north/west` boundaries and excludes `south/east`, while non-top silhouette pixels are preserved only where they are outside the expanded top-surface footprint.
- `nativeExact` also enforces a color-safety invariant during clipping: an owned pixel is not allowed to come from a fully transparent source pixel, so the exact atlas cannot reveal undefined RGB that was hidden behind zero alpha in the raw beauty render.
- The legacy `.blend` files stay in `scripts/` as visual references and comparison artifacts; they are no longer required for the active path.

## CLI

Use `--sampling-profile` to switch between the render styles. If you omit it, `nativeExact` is used:

```bash
bun run tile public/Grass_23-512x512/texture.png
bun run tile public/Grass_23-512x512/texture.png --sampling-profile nativeExact
bun run tile public/Grass_23-512x512/texture.png --sampling-profile legacyMatched
bun run tile public/Grass_23-512x512/texture.png --sampling-profile strictPixel
```

## Native Coverage Proof

`bun run validate:terrain-coverage` validates the terrain tileset without Phaser or Tiled in the loop. It composes maps directly from project-native layer fixtures using the same fixed placement contract the assets target:

- tile image size `128 x 96`
- logical map diamond height `64`
- per-layer vertical offset `16`
- the current `ORDERED_SLOPES` frame order and shared scene spec in `scripts/lib/terrain-scene-spec.json`

The validator compares two native-resolution rasterizations:

- an ownership oracle from `scripts/lib/terrain-ownership.ts`, driven by the shared scene spec plus deterministic top-surface ownership rules
- the actual `tileset.png` alpha, read as deterministic binary coverage from the generated atlas

For each fixture pixel it enforces exact-one coverage:

- `oracle == 1` and `actual == 0`: uncovered pixel
- `actual > 1`: overlapping pixel
- `oracle == 0` and `actual > 0`: stray coverage
- `oracle == 1` and `actual == 1` with different tile owners: wrong shape or wrong placement

The proof always checks the shared demo fixture plus deterministic seeded stress fixtures generated from the heightmap pipeline, and it writes `oracle.png`, `actual.png`, `diff.png`, and `summary.json` into the report directory for every fixture. The oracle also self-checks its own flat-neighbor tiling before the real atlas is compared, so seam bugs in the ownership masks fail fast.

```bash
bun run tile public/Grass_23-512x512/texture.png --sampling-profile nativeExact
bun run validate:terrain-coverage public/Grass_23-512x512/tilesets/texture
```

`legacyMatched` and `strictPixel` are still valid visual outputs, but only `nativeExact` is intended to satisfy the exact native no-hole/no-overlap proof.

## Regression Check

The safest comparison workflow is behavioral:

1. Render the same `texture.png` once with the legacy `tiles-no-shading-rotation-fast.blend` scene and once with `scripts/render_tileset.py`.
2. Confirm both paths emit exactly `19` PNGs with `128 x 96` dimensions.
3. Confirm the generated `tileset.json` geometry metadata stays unchanged, especially `tilewidth`, `tileheight`, `elevationYOffsetPx`, rows, columns, and tile ordering.
4. Spot-check the steep and diagonal slope frames against the example map to ensure orientation still matches `ORDERED_SLOPES`.
