# Tileset Renderer

The biome pipeline is now intentionally small.

- `downloads/` is the scratch area for raw candidate textures and experiments.
- `assets/` contains only active source PNGs such as `grass.png`, `mud.png`, and `checkers.png`.
- `three/biome.json` is the shared runtime contract for the 19 terrain shapes.
- `public/biome/<name>/` is the runtime output for one built biome.

## Build Contract

`bun biome <source.png>` accepts any PNG path, derives the biome id from the lowercase basename, recreates `public/biome/<id>/`, and writes:

- `source.png`
- `tileset.png`

Example:

```bash
bun biome ./assets/grass.png
bun biome ./assets/mud.png
bun biome ./assets/checkers.png
```

After those runs, the runtime folders are:

```text
public/biome/grass/source.png
public/biome/grass/tileset.png
public/biome/mud/source.png
public/biome/mud/tileset.png
public/biome/checkers/source.png
public/biome/checkers/tileset.png
```

The build does not emit `tileset.json`, `biomes.json`, `random.map.json`, `random.biome-grid.json`, checker sidecars, heightmaps, or normalmaps.

## Shared Runtime Contract

`three/biome.json` owns the common terrain atlas geometry:

- `128 x 96` frame size
- `19` ordered slope frames
- `4 x 5` atlas layout
- `elevationYOffsetPx = 16`
- the shared `NESW` and `CENTER` properties for every terrain tile

The Three runtime imports that JSON directly. Per-biome JSON files are gone because the geometry is shared across all biome atlases.

## Three Runtime

`three/assets.ts` now owns the runtime terrain bundle:

- imports `three/biome.json`
- loads `grass` and `mud` from `public/biome/<name>/tileset.png` into the beauty atlas array
- loads `checkers` from `public/biome/checkers/tileset.png` as the dedicated checker/debug atlas
- generates the default terrain map in code
- generates the deterministic two-biome ownership grid in code

`checkers` is a normal biome build output. The only special case is in the Three renderer, where its atlas is used for the checker debug view instead of the grass/mud terrain blend.

## Validation

The validators now use the shared `three/biome.json` contract.

Raster parity:

```bash
bun run validate:tileset-raster public/biome/grass
```

This rerenders `public/biome/grass/source.png` through the CPU rasterizer and compares it to `public/biome/grass/tileset.png`.

Compass rotation:

```bash
bun run validate:tileset-compass public/biome/grass
```

This renders `scripts/fixtures/compass.png` through the same rasterizer and checks that all 19 poses keep the compass screen-locked.

Coverage proof:

```bash
bun run validate:terrain-coverage public/biome/grass
bun run validate:terrain-coverage public/biome/mud
```

This compares `tileset.png` coverage against the ownership oracle from the shared terrain contract.

## Regression Loop

Use this loop when changing the biome pipeline:

1. Run `bun biome ./assets/grass.png`.
2. Run `bun biome ./assets/mud.png`.
3. Run `bun biome ./assets/checkers.png`.
4. Run `bun run validate:tileset-compass public/biome/grass`.
5. Run `bun run validate:terrain-coverage public/biome/grass`.
6. Run `bun run validate:terrain-coverage public/biome/mud`.
7. Run `bun check`.
