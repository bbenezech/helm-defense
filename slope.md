# 30 Degree Isometric and Sloped Tile Math

This document extracts the math behind the project's 30 degree isometric view and its sloped-tile system. It is meant to be exhaustive for inspectable repo sources, not just a summary. The main sources are:

- `Readme.md`
- `src/game/constants.ts`
- `src/game/scene/game.ts`
- `src/game/lib/terrain.ts`
- `src/game/lib/tilemap.ts`
- `src/game/lib/tileset.ts`
- `src/game/scene/LightningFilter.ts`
- `src/game/scene/lightningShader.frag`
- `scripts/tileset.ts`
- `scripts/render_tileset.py`
- `scripts/lib/blender.ts`

The active asset pipeline now builds the Blender scene from `scripts/render_tileset.py`. The binary Blender scene files in `scripts/*.blend` remain in the repo as reference assets, but their internal formulas are still not text-inspectable here.

For exact native atlas guarantees, the project now also uses `scripts/lib/terrain-ownership.ts`: it converts the same `128 x 96 / 64 / 16` tile contract into deterministic ownership masks and clips the `nativeExact` atlas so terrain pixels are covered exactly once at native resolution.

## 1. Core Idea

The project combines two separate systems:

1. A 30 degree axonometric camera model that maps world `y` and world `z` into screen `y`.
2. A sloped-tile terrain model that turns a grid of tile corner heights into:
   - a per-tile slope type
   - a high-resolution heightmap
   - a high-resolution normalmap
   - a packed texture for the lighting shader

The important point is that sloped tiles are defined in top-down world space first, and only then projected into the 30 degree screen view.

## 2. Coordinate Systems and Units

The project uses four coordinate spaces.

| Space | Meaning | Main use |
| --- | --- | --- |
| `tile` | Discrete tile grid | Logical map cells, tile layers, `NESW` slope encoding |
| `terrain` | Fine grid inside the tile grid | Heightmap and normalmap sampling at `precision` pixels per tile |
| `world` | 3D simulation coordinates | Physics, cannon aim, bullet motion, terrain height queries |
| `screen` | 2D rendered coordinates | Sprite placement, pointer picking, shader camera coordinates |

Key units and conventions:

- `WORLD_UNIT_PER_METER = 16` in `src/game/constants.ts`.
- World axes:
  - `x`: horizontal on screen
  - `y`: depth on the ground plane
  - `z`: elevation
- Angles are stored in radians at runtime.
- Preset camera names are stored in degrees and converted with `Phaser.Math.DegToRad(...)`.

## 3. The 30 Degree Isometric Projection

### 3.1 The generic theory

`src/game/constants.ts` documents the generic orthographic pitch model:

```text
screenY ~= worldY * sin(theta) - worldZ * cos(theta)
```

For the floor-aligned variant it also gives:

```text
screenY ~= worldY * 1.0 - worldZ * cot(theta)
cot(theta) = cos(theta) / sin(theta)
```

For the pixel-art isometric preset:

- `theta = 30 deg`
- `sin(theta) = 0.5`
- `cos(theta) = 0.8660254038`
- `cot(theta) = 1.7320508076`
- `arctan(sin(30 deg)) = arctan(0.5) ~= 26.565 deg`

The README repeats the same design intent:

```text
Y-Compression (sin theta) = 0.5000
Z-Influence (cos theta) = 0.8660
```

That `arctan(sin(30 deg)) ~= 26.565 deg` note from `src/game/constants.ts` is the code's explanation for the classic `2:1` pixel-art isometric ratio: once world depth is compressed by `0.5`, the visible ground diagonals produce the familiar `2 horizontal pixels : 1 vertical pixel` look.

### 3.2 What the runtime actually uses

In `src/game/scene/game.ts`:

```ts
const camRotation = Phaser.Math.DegToRad(PERSPECTIVE_INDEX[this.perspective]);
const cosCam = Math.cos(camRotation);
const sinCam = Math.sin(camRotation);
const cotCam = cosCam / sinCam;
```

For axonometric rendering:

```ts
X_FACTOR = 1;
Y_FACTOR = sinCam;
Z_FACTOR = cosCam;
```

So for a pure 30 degree projection the factors would be:

```text
X_FACTOR = 1
Y_FACTOR = sin(30 deg) = 0.5
Z_FACTOR = cos(30 deg) = 0.8660254038
```

But `pixelArtIsometric` has a deliberate art-driven override:

```ts
this.Z_FACTOR = 5 / (8 * Math.SQRT1_2);
```

Since `Math.SQRT1_2 = 1 / sqrt(2) ~= 0.7071067812`:

```text
Z_FACTOR = 5 / (8 * 0.7071067812) ~= 0.8838834765
```

That override exists because the sprite art uses a `2:1` isometric footprint but a taller vertical cube than pure `cos(30 deg)` would produce. The code comments explain the target visual cube:

- projected cube width after 45 degree rotation: `90.51 px`
- projected cube depth: `45.2548 px`
- projected cube height: `80 px`
- depth compression: `45.2548 / 90.51 ~= 0.5`
- desired height compression: `80 / 90.51 ~= 0.8839`

Why `80 px` is the target:

- tileset image size is `128 x 96`
- the tileset stores `elevationYOffsetPx = 16`
- the logical isometric ground tile height is `96 - 2 * 16 = 64 px`
- each higher tile layer is shifted upward by `16 px`

So a one-unit cube is expected to span:

```text
visible ground diamond height = 64 px
one layer step               = 16 px
target projected cube height = 64 + 16 = 80 px
```

That is the visual convention the code is trying to preserve: the top of a `1 x 1 x 1` cube should meet the bottom of the cube on the next layer above.

Tiny derivation:

```text
reference projected width = 128 / sqrt(2) = 90.50966799
target projected height   = 80

needed Z factor
  = target height / reference width
  = 80 / (128 / sqrt(2))
  = 80 * sqrt(2) / 128
  = 5 * sqrt(2) / 8
  = 5 / (8 * sqrt(1/2))
  = 5 / (8 * Math.SQRT1_2)
  ~= 0.8838834765
```

Compared to the pure 30 degree value:

```text
cos(30 deg) = 0.8660254038
override    = 0.8838834765
delta       = 0.0178580727  (~2.06% larger)
```

So the project has two related but distinct 30 degree notions:

1. The mathematically clean 30 degree model:
   - `Y = sin(30 deg) = 0.5`
   - `Z = cos(30 deg) = 0.8660`
2. The production `pixelArtIsometric` runtime:
   - `Y = 0.5`
   - `Z = 0.8839`

### 3.3 World/screen conversion formulas

`src/game/scene/game.ts` applies the projection like this:

```ts
worldToScreen(world):
  screen.x = world.x * X_FACTOR
  screen.y = world.y * Y_FACTOR - world.z * Z_FACTOR
```

and inverts it at a known `worldZ`:

```ts
screenToWorld(screen, worldZ):
  world.x = screen.x * X_FACTOR_INV
  world.y = (screen.y + worldZ * Z_FACTOR) * Y_FACTOR_INV
  world.z = worldZ
```

The code also stores axis-wise scale vectors:

```ts
screenToWorldRatioHorizontal = (X_FACTOR_INV, Y_FACTOR_INV, 0)
screenToWorldRatioVertical   = (X_FACTOR_INV, 0, Z_FACTOR_INV)
worldToScreenRatio           = (X_FACTOR, Y_FACTOR, Z_FACTOR)
```

These ratios are reused by bullets, shadows, crater stretching, and other screen-space effects.

### 3.4 Tile/screen conversion for isometric maps

For isometric tilemaps:

```ts
tileToScreen(tile, layer):
  screen.x = (tile.x - tile.y) * tileWidth  * 0.5 + tileWidth  * 0.5 + layer.x
  screen.y = (tile.x + tile.y) * tileHeight * 0.5 + tileHeight * 0.5 + layer.y
```

and the inverse:

```ts
screenToTile(screen, layer):
  x = screen.x - layer.x
  y = screen.y - layer.y

  tile.x = (x * halfTileWidthInv + y * halfTileHeightInv) * 0.5 - 1
  tile.y = (y * halfTileHeightInv - x * halfTileWidthInv) * 0.5
```

with:

```ts
halfTileWidthInv = 2 / map.tileWidth
halfTileHeightInv = 2 / map.tileHeight
```

### 3.5 Tile/world and terrain/world scale

`src/game/scene/game.ts` defines:

```ts
tileInWorld = map.tileWidth * Math.SQRT1_2 * X_FACTOR_INV
terrainInWorld = (1 / terrain.precision) * tileInWorld
```

Meaning:

- one diamond tile edge becomes a world-space length of `tileWidth / sqrt(2)` when `X_FACTOR = 1`
- one terrain sample is one tile divided by `precision`

When converting a tile to world coordinates:

```ts
tileToWorld(tile):
  worldZ = getTileObjectWorldZ(tileObject)
  screen = tileToScreen(tile, tileObject.layer)
  return screenToWorld(screen, worldZ)
```

So sloped tiles feed world height into the same 30 degree projection equations.

## 4. Sloped Tiles: The Fundamental Slope Constants

The slope system is built in `src/game/lib/terrain.ts`.

### 4.1 Base slope from a chosen normal

```ts
const TILE_ELEVATION_Z = 0.9801;
const TILE_ELEVATION_ANGLE = Math.acos(TILE_ELEVATION_Z);
export const TILE_ELEVATION_RATIO = Math.tan(TILE_ELEVATION_ANGLE);
```

The code comments already give the intended values:

```text
TILE_ELEVATION_Z = 0.9801
TILE_ELEVATION_ANGLE ~= 0.2 rad ~= 11.45 deg
TILE_ELEVATION_RATIO ~= 0.20253482585771954
```

Interpretation:

- `TILE_ELEVATION_Z` is the `z` component of the unit surface normal for a one-level rise across one tile width.
- `acos(z)` recovers the surface angle from vertical.
- `tan(angle)` converts that angle into rise-over-run.

So one terrain level changes height by about `0.2025` tile widths in world space.

### 4.2 Horizontal components of the slope normal

For straight cardinal slopes:

```ts
const TILE_ELEVATION_X_OR_Y = Math.sqrt(1 - TILE_ELEVATION_Z * TILE_ELEVATION_Z);
```

This is the horizontal component of a unit normal when only one horizontal axis is active.

### 4.3 Diagonal slope equivalent

For a slope spread over a half-diagonal instead of a full tile edge:

```ts
const HALF_TILE_ELEVATION_ANGLE = Math.atan(Math.SQRT2 * Math.tan(TILE_ELEVATION_ANGLE));
const HALF_TILE_ELEVATION_Z = Math.cos(HALF_TILE_ELEVATION_ANGLE);
const HALF_TILE_ELEVATION_X_AND_Y =
  Math.sqrt(Math.abs(1 - HALF_TILE_ELEVATION_Z * HALF_TILE_ELEVATION_Z) / 2);
```

The code comments give the intended values:

```text
HALF_TILE_ELEVATION_ANGLE ~= 0.277 rad ~= 15.89 deg
HALF_TILE_ELEVATION_Z ~= 0.9619
HALF_TILE_ELEVATION_X_AND_Y ~= 0.1933
```

Interpretation:

- diagonals are steeper because the same height change happens over a shorter run
- `sqrt(2)` appears because the diagonal travel distance differs from the edge distance
- diagonal normals split the horizontal component equally between `x` and `y`

### 4.4 Canonical normals used by slope tiles

The code defines these canonical unit normals:

```ts
TOP         = [0, 0, 1]
EAST        = [+d, +d, z_diag]
NORTH_EAST  = [0, +c, z_card]
NORTH       = [-d, +d, z_diag]
NORTH_WEST  = [-c, 0, z_card]
WEST        = [-d, -d, z_diag]
SOUTH_WEST  = [0, -c, z_card]
SOUTH       = [+d, -d, z_diag]
SOUTH_EAST  = [+c, 0, z_card]
```

where:

```text
c = TILE_ELEVATION_X_OR_Y
d = HALF_TILE_ELEVATION_X_AND_Y
z_card = TILE_ELEVATION_Z
z_diag = HALF_TILE_ELEVATION_Z
```

These normals are reused directly by the terrain tile catalog.

## 5. The 19 Sloped Tile Types

The repo encodes exactly `19` terrain tile families:

```ts
export const TERRAIN_TILE_COUNT = 19;
```

`scripts/lib/blender.ts` keeps the scripted Blender frame order aligned with the runtime catalog through `ORDERED_SLOPES`.

It also enforces:

```ts
new Set(ORDERED_SLOPES).size === TERRAIN_TILE_COUNT
```

and its comments record local Blender face normals such as:

```text
<0, -0.1985, 0.9801>
<0.1933, -0.1933, 0.9619>
```

Those values line up with the runtime cardinal and diagonal slope constants from `src/game/lib/terrain.ts`.

Each terrain tile stores:

- `NESW`: normalized corner-height signature
- `CENTER`: center height used for triangle interpolation
- `FLAT`: stored classification flag
- `NORMAL_NE`, `NORMAL_NW`, `NORMAL_SE`, `NORMAL_SW`: normals for the 4 sub-triangles

The complete catalog from `src/game/lib/terrain.ts` is:

| Tile | NESW | CENTER | FLAT | Face normals |
| --- | --- | --- | --- | --- |
| `SLOPE_FLAT` | `0000` | `0` | `true` | all `TOP` |
| `SLOPE_W` | `0001` | `0` | `false` | `NW=EAST`, `SW=EAST`, `NE=TOP`, `SE=TOP` |
| `SLOPE_S` | `0010` | `0` | `false` | `SE=NORTH`, `SW=NORTH`, `NE=TOP`, `NW=TOP` |
| `SLOPE_E` | `0100` | `0` | `false` | `NE=WEST`, `SE=WEST`, `NW=TOP`, `SW=TOP` |
| `SLOPE_N` | `1000` | `0` | `false` | `NE=SOUTH`, `NW=SOUTH`, `SE=TOP`, `SW=TOP` |
| `SLOPE_NW` | `1001` | `0.5` | `true` | all `SOUTH_EAST` |
| `SLOPE_SW` | `0011` | `0.5` | `true` | all `NORTH_EAST` |
| `SLOPE_SE` | `0110` | `0.5` | `true` | all `NORTH_WEST` |
| `SLOPE_NE` | `1100` | `0.5` | `true` | all `SOUTH_WEST` |
| `SLOPE_EW` | `0101` | `0` | `false` | `NW=EAST`, `SW=EAST`, `NE=WEST`, `SE=WEST` |
| `SLOPE_NS` | `1010` | `0` | `false` | `SE=NORTH`, `SW=NORTH`, `NE=SOUTH`, `NW=SOUTH` |
| `SLOPE_NWS` | `1011` | `1` | `false` | `NW=TOP`, `SW=TOP`, `NE=EAST`, `SE=EAST` |
| `SLOPE_WSE` | `0111` | `1` | `false` | `SE=TOP`, `SW=TOP`, `NE=NORTH`, `NW=NORTH` |
| `SLOPE_SEN` | `1110` | `1` | `false` | `NE=TOP`, `SE=TOP`, `NW=WEST`, `SW=WEST` |
| `SLOPE_ENW` | `1101` | `1` | `false` | `NE=TOP`, `NW=TOP`, `SE=SOUTH`, `SW=SOUTH` |
| `SLOPE_STEEP_W` | `1012` | `1` | `true` | all `EAST` |
| `SLOPE_STEEP_S` | `0121` | `1` | `true` | all `NORTH` |
| `SLOPE_STEEP_E` | `1210` | `1` | `true` | all `WEST` |
| `SLOPE_STEEP_N` | `2101` | `1` | `true` | all `SOUTH` |

What the fields mean:

- `NESW` is the corner-height signature after subtracting the tile's base layer.
- `CENTER` is the center height used to split the tile into 4 triangles.
- The 4 face normals decide how lighting and packed normalmaps represent the tile.

## 6. How Corner Heights Become Slope Types

`tileableHeightmapToTileData(...)` converts a corner-based heightmap into tile descriptors.

For each tile square:

```ts
N = tilableHeightmap[y][x]
E = tilableHeightmap[y][x + 1]
S = tilableHeightmap[y + 1][x + 1]
W = tilableHeightmap[y + 1][x]
level = min(N, E, S, W)
NESW = `${N - level}${E - level}${S - level}${W - level}`
tile = NESWToTerrainTile[NESW]
```

This is the core idea of the slope system:

- absolute height is split into:
  - `level`: the whole-number layer index
  - `NESW`: the local shape inside that layer
- the same logical slope shape can therefore be reused on many vertical levels

The converter logs the derived terrain size and includes `elevationRatio = TILE_ELEVATION_RATIO`.

## 7. How Tile Shapes Become a Dense Heightmap and Normalmap

`tileDataToTerrain(...)` rasterizes the 19 tile types into a higher-resolution terrain representation.

### 7.1 Terrain resolution

```ts
fineMapWidth = mapWidth * precision
fineMapHeight = mapHeight * precision
invSpan = 1 / precision
pxElevationRatio = TILE_ELEVATION_RATIO * precision
```

So one tile becomes a `precision x precision` micro-grid in terrain space.

### 7.2 Local triangle decomposition

Each tile is split into 4 triangles around the center point:

```text
vN = (0,   0,   N)
vE = (1,   0,   E)
vS = (1,   1,   S)
vW = (0,   1,   W)
vC = (0.5, 0.5, CENTER)
```

For each terrain pixel:

```ts
globalX = px * invSpan
globalY = py * invSpan
tx = floor(globalX)
ty = floor(globalY)
normX = globalX - tx
normY = globalY - ty
```

Triangle choice:

```ts
if (normY < 1 - normX) {
  if (normY < normX) {
    triangle = NEC
  } else {
    triangle = WNC
  }
} else {
  if (normY < normX) {
    triangle = ESC
  } else {
    triangle = SWC
  }
}
```

### 7.3 Height interpolation

Height is then computed with barycentric interpolation:

```ts
[w1, w2, w3] = barycentricWeights(normX, normY, tri_v1, tri_v2, tri_v3)
heightmap[py][px] =
  (level + w1 * tri_v1.z + w2 * tri_v2.z + w3 * tri_v3.z) * pxElevationRatio
```

And the normalmap takes the face normal chosen for that triangle:

```ts
normalmap[py][px] = normal
```

This means:

- the geometric surface is interpolated from the tile corners plus `CENTER`
- the lighting normal is piecewise constant per sub-triangle

## 8. How World Height Queries Use the Sloped Terrain

`src/game/scene/game.ts` uses the generated terrain data in three important ways.

### 8.1 World point to terrain sample

First, the code drops world `z`:

```ts
worldIgnoringZToScreen(world):
  screen.x = world.x * X_FACTOR
  screen.y = world.y * Y_FACTOR
```

Then it converts that projected ground-plane position back into tile and terrain space:

```ts
worldToTerrain(world):
  tile = screenToTile(worldIgnoringZToScreen(world), null)
  terrain.x = tile.x * precision
  terrain.y = tile.y * precision
```

Notice the design choice:

- the lookup starts from the world point projected without `z`
- terrain sampling happens in map-plane coordinates

For picking from the actual rendered view, the code also uses:

```ts
screenGroundToWorld(screen):
  tile = getTileFromScreen(screen)
  worldZ = tile ? getTileObjectWorldZ(tile) : 0
  return screenToWorld(screen, worldZ)
```

That is the inverse bridge from visible isometric screen position back into world space at terrain height.

### 8.2 Ground height query

The runtime height query uses the 4 nearby terrain samples:

```ts
h1 = terrain.heightmap[y_floor][x_floor]
h2 = terrain.heightmap[y_floor][x_floor + 1]
h3 = terrain.heightmap[y_floor + 1][x_floor]
h4 = terrain.heightmap[y_floor + 1][x_floor + 1]
```

with:

```ts
tx = x - x_floor
ty = y - y_floor
```

Then it splits the micro-cell into two triangles:

```ts
height =
  tx + ty < 1
    ? h1 + tx * (h2 - h1) + ty * (h3 - h1)
    : h4 + (1 - tx) * (h3 - h4) + (1 - ty) * (h2 - h4)
```

and finally:

```ts
worldHeight = height * terrainInWorld
```

### 8.3 Tile layer height

For whole tile objects:

```ts
worldZ = (layerLevel + centerLevel) * TILE_ELEVATION_RATIO * tileInWorld
```

where:

- `layerLevel` comes from the Tiled layer property `level`
- `centerLevel` comes from the per-tile property `CENTER`

This is how stacked isometric layers and the slope shape agree about elevation.

### 8.4 Ground normal query

Packed terrain normals are rotated back into world coordinates with a fixed 45 degree transform:

```ts
out.x = (normal[0] + normal[1]) * Math.SQRT1_2
out.y = (normal[0] - normal[1]) * Math.SQRT1_2
out.z = normal[2]
```

This compensates for the isometric diamond orientation of the map.

## 9. Tileset and Layer Geometry for Sloped Tiles

The asset pipeline encodes how much vertical offset each stacked isometric layer should get.

### 9.1 Tileset geometry

In `scripts/tileset.ts`:

```ts
elevationYOffsetPx = (tileImage.height - tileImage.width / 2) / 2
```

This expresses a visual rule:

- a 2:1 isometric tile footprint has nominal visible height `tileWidth / 2`
- any extra sprite height above that footprint is treated as vertical relief
- half of that relief becomes the layer step

`src/game/lib/tileset.ts` then stores that value as a tileset property:

```ts
properties: [{ name: "elevationYOffsetPx", value: elevationYOffsetPx }]
```

It also stores, for every tile art variant:

- `NESW`
- `CENTER`

So the art asset keeps the same terrain semantics as the runtime slope catalog.

### 9.2 Tiled map layer offsets

`src/game/lib/tilemap.ts` builds an isometric Tiled map with:

```ts
orientation = "isometric"
offsety = -(index * elevationYOffsetPx)
tileheight = tileset.tileheight - 2 * elevationYOffsetPx
tilewidth = tileset.tilewidth
```

Meaning:

- each vertical layer is shifted upward by one elevation step
- the logical map tile height excludes the extra sprite overhang used to depict relief

The tile choice itself is driven by the slope encoding:

```ts
NESW -> candidate gids
layers[cell.level][y][x] = chosenCandidate.gid
```

So:

- `cell.level` decides which stacked layer gets the tile
- `cell.tile.NESW` decides which slope shape appears on that layer

## 10. Packed Terrain Data and Shader-Side 30 Degree Reconstruction

The lighting shader does not work directly on tile objects. It works on a packed texture built from the terrain heightmap and normalmap.

### 10.1 Packing terrain for the shader

`packTerrain(...)` encodes:

```ts
R = (normal.x * 0.5 + 0.5) * 255
G = (normal.y * 0.5 + 0.5) * 255
B = (normal.z * 0.5 + 0.5) * 255
A = (height - minHeight) / (maxHeight - minHeight) * 255
```

and `unpackTerrainData(...)` reverses it:

```ts
normal = channel * (2 / 255) - 1
height = alpha / 255 * (maxHeight - minHeight) + minHeight
```

This packed texture is what the shader samples to understand sloped ground.

### 10.2 Shader uniforms tied to isometric math

`src/game/scene/LightningFilter.ts` sets:

```ts
uMapHalfTileInv = (2 / map.tileWidth, 2 / map.tileHeight)
uMapSizeInTileInv = (1 / map.width, 1 / map.height)
uSurfaceHeightImpactOnScreenY = ((5 / 4) * map.tileHeight) / precision
uProjectionYZ = (gameScene.worldToScreenRatio.y, gameScene.worldToScreenRatio.z)
```

`uSurfaceHeightImpactOnScreenY` is especially important. The code comment explains the assumption:

```text
the visual height of a cube in our perspective is tile height + layer Y offset,
which is 1/4 of the tile height
```

So the shader uses a screen-space height step of:

```text
(5 / 4) * tileHeight / precision
```

`uProjectionYZ` is the other important consistency bridge:

- `uProjectionYZ.x` is the runtime `Y_FACTOR`
- `uProjectionYZ.y` is the runtime `Z_FACTOR`

So for `pixelArtIsometric`, the shader now receives:

```text
uProjectionYZ = (0.5, 0.8838834765)
```

instead of rebuilding a pure `30 deg` view direction from `sin(30 deg)` and `cos(30 deg)`.

### 10.3 World-to-map reprojection in the shader

`lightningShader.frag` converts world coordinates back into map UVs:

```glsl
tileCoord.x = (world.x * uMapHalfTileInv.x + world.y * uMapHalfTileInv.y) * 0.5 - 1.0;
tileCoord.y = (world.y * uMapHalfTileInv.y - world.x * uMapHalfTileInv.x) * 0.5;
mapUV = tileCoord * uMapSizeInTileInv;
```

This is the shader-space equivalent of the CPU's isometric inverse tile transform.

### 10.4 Finding the visible ground under the 30 degree camera

The shader performs a binary search over possible ground `y`:

```glsl
minY = worldFloor.y;
maxY = worldFloor.y + (uSurfaceMaxHeight - uSurfaceMinHeight) * uSurfaceHeightImpactOnScreenY;
```

Loop body:

```glsl
worldGroundY = (minY + maxY) * 0.5;
surface = texture2D(iChannel0, worldToMapUV(vec2(worldFloor.x, worldGroundY)));
height = surface.a * (uSurfaceMaxHeight - uSurfaceMinHeight) + uSurfaceMinHeight;
occlusionPoint = worldGroundY - height * uSurfaceHeightImpactOnScreenY;
isOccluded = step(worldFloor.y, occlusionPoint);
maxY = mix(maxY, worldGroundY, isOccluded);
minY = mix(worldGroundY, minY, isOccluded);
```

Meaning:

- start with the visible screen-floor point
- search upward in world `y` until the terrain height projected by the 30 degree view would occlude that screen position

### 10.5 View direction in the shader

The shader now derives its view direction from the same runtime projection factors as CPU geometry:

```glsl
viewDirection = normalize(vec3(0.0, uProjectionYZ.x, uProjectionYZ.y))
```

For `pixelArtIsometric`, that means:

```text
viewDirection = normalize(0.0, 0.5, 0.8838834765)
             ~= (0.0, 0.4923659639, 0.8703882798)
```

This corresponds to an effective elevation of about `29.50 deg`. That is close to `30 deg`, but it now matches the runtime art-fit projection exactly rather than using the pure trigonometric approximation.

The shader still uses fixed 45 degree constants for map-orientation compensation:

```glsl
COS45 = 0.70710678118
SIN45 = 0.70710678118
```

and rotates packed normals back out of isometric space with:

```glsl
rotation45 = mat3(
  vec3(COS45, -SIN45, 0.0),
  vec3(SIN45,  COS45, 0.0),
  vec3(0.0,    0.0,   1.0)
)

surfaceNormal = rotation45 * (surface.rgb * 2.0 - 1.0)
```

So the shader depends on both:

- the runtime projection factors that encode the 30 degree-style ground footprint plus the art-fit vertical override
- the 45 degree map orientation

## 11. Relationship Between 30 Degree Projection and Sloped Tiles

The full chain is:

1. A corner-based heightmap defines `N`, `E`, `S`, `W` per tile.
2. `tileableHeightmapToTileData(...)` extracts:
   - `level`
   - `NESW`
   - one of 19 slope families
3. `tileDataToTerrain(...)` rasterizes that tile family into:
   - dense heights
   - dense normals
4. `packTerrain(...)` encodes that dense terrain into a texture.
5. The CPU uses 30 degree-style world/screen formulas for gameplay placement.
6. The shader reconstructs world/map relationships from the same packed terrain and uses the same runtime projection factors for view-dependent lighting.

In short:

- sloped tiles define the geometry
- the 30 degree model defines how that geometry is seen
- the project-specific `pixelArtIsometric` override adjusts the pure 30 degree math so the art still looks correct

## 12. Important Constants and Formulas in One Place

### 30 degree projection

```text
theta = 30 deg
sin(theta) = 0.5
cos(theta) = 0.8660254038
cot(theta) = 1.7320508076
```

### Runtime pixel-art override

```text
X_FACTOR = 1
Y_FACTOR = 0.5
Z_FACTOR = 5 / (8 * sqrt(1/2)) ~= 0.8838834765
```

### Projection

```text
screen.x = world.x * X_FACTOR
screen.y = world.y * Y_FACTOR - world.z * Z_FACTOR

world.x = screen.x * X_FACTOR_INV
world.y = (screen.y + world.z * Z_FACTOR) * Y_FACTOR_INV
```

### Isometric tile transforms

```text
screen.x = (tile.x - tile.y) * tileWidth  / 2 + tileWidth  / 2 + layer.x
screen.y = (tile.x + tile.y) * tileHeight / 2 + tileHeight / 2 + layer.y

tile.x = (screen.x * 2/tileWidth + screen.y * 2/tileHeight) / 2 - 1
tile.y = (screen.y * 2/tileHeight - screen.x * 2/tileWidth) / 2
```

### Slope constants

```text
TILE_ELEVATION_Z = 0.9801
TILE_ELEVATION_ANGLE = acos(0.9801) ~= 0.2 rad ~= 11.45 deg
TILE_ELEVATION_RATIO = tan(TILE_ELEVATION_ANGLE) ~= 0.20253482585771954

HALF_TILE_ELEVATION_ANGLE = atan(sqrt(2) * tan(TILE_ELEVATION_ANGLE)) ~= 0.277 rad ~= 15.89 deg
HALF_TILE_ELEVATION_Z = cos(HALF_TILE_ELEVATION_ANGLE) ~= 0.9619
```

### Tile-to-world height

```text
worldZ = (layerLevel + centerLevel) * TILE_ELEVATION_RATIO * tileInWorld
```

### Terrain rasterization

```text
pxElevationRatio = TILE_ELEVATION_RATIO * precision
height = (level + barycentric corner blend) * pxElevationRatio
```

### Layer asset geometry

```text
elevationYOffsetPx = (tileImage.height - tileImage.width / 2) / 2
offsety = -(level * elevationYOffsetPx)
tileheight = tileset.tileheight - 2 * elevationYOffsetPx
```

### Shader reprojection

```text
uSurfaceHeightImpactOnScreenY = ((5 / 4) * tileHeight) / precision
```

## 13. What Is Easy to Miss

The following details are easy to overlook, but they are central:

1. The project is described as "30 degree isometric", but the runtime `pixelArtIsometric` view does not use pure `cos(30 deg)` for vertical scaling. It uses `0.8839` to match the art.
2. Sloped tiles are not just a visual trick. They define real world height through `TILE_ELEVATION_RATIO`, `CENTER`, barycentric interpolation, and layer offsets.
3. The system uses both a 30 degree camera pitch and a separate 45 degree map rotation. Both are necessary.
4. The shader does not simply shade what the CPU places on screen. It reconstructs where the ground surface should be under the 30 degree view from packed terrain data.
5. `NESW` is the key semantic bridge across the whole pipeline:
   - heightmap analysis
   - terrain tile classification
   - tileset metadata
   - tile art lookup
