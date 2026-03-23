# Mathematical Overview

This project mixes several kinds of math: coordinate transforms, angle-based aiming, terrain slope reconstruction, procedural geometry, and shader-space lighting. The most important trigonometric work happens in the camera/projection layer, the cannon and bullet orientation code, terrain slope constants, procedural texture generation, and the lighting fragment shader.

This overview is exhaustive for inspectable TypeScript and shader code in `src/**`, `scripts/*.ts`, and `src/game/scene/lightningShader.frag`.

## Coordinate Systems, Units, and Conventions

The project uses four coordinate spaces:


| Space     | Meaning                                        | Main formulas / conventions                                                                |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tile`    | Discrete map-grid coordinates, top-left origin | Used by Phaser tilemaps and by tile-to-screen formulas in `src/game/scene/game.ts`         |
| `terrain` | Fine-grained tile-relative sampling space      | `tile * precision`, used for heightmap and normalmap lookup                                |
| `world`   | 3D simulation space                            | `x` is screen-horizontal, `y` is map depth, `z` is height; gravity is negative `z`         |
| `screen`  | 2D rendered coordinates                        | `x` is horizontal pixels, `y` is vertical pixels with height subtracted through projection |


Units and angle conventions:

- World length is scaled by `WORLD_UNIT_PER_METER = 16` in `src/game/constants.ts`.
- Angles are stored in radians in runtime code.
- Degrees appear mainly in preset definitions and are converted with `Phaser.Math.DegToRad(...)` or `PI / 180`.
- Camera angle means pitch measured downward from the horizontal plane, as documented in `src/game/constants.ts`.
- The isometric map itself is still a tilemap diamond; the extra trig determines how world `y` and world `z` contribute to screen `y`.

This document prioritizes trig and angle-bearing formulas. Other math such as interpolation, dot products, normalization, drag, noise, and binary search is included only where it explains the role of the trig.

## Trig Inventory

### Projection and Camera Math

The core camera model lives in `src/game/constants.ts` and `src/game/scene/game.ts`. The code treats the camera pitch angle `theta` as the source of two projection factors: `sin(theta)` for depth compression and `cos(theta)` for how much height moves a point upward on screen. The same theory is summarized in `Readme.md`, then specialized in code for both axonometric and floor-aligned projections.


| Location                 | Formula / Constant                                                                       | Meaning                                       | Why it matters                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/game/constants.ts`  | `screenY ~= worldY * sin(theta) - worldZ * cos(theta)`                                   | Orthographic pitch model                      | Defines the whole relation between depth, height, and on-screen vertical displacement              |
| `src/game/constants.ts`  | `cot(theta) = cos(theta) / sin(theta)`                                                   | Floor-aligned projection factor               | Lets the project keep ground-plane mapping simple while preserving the visual slant of height      |
| `src/game/constants.ts`  | `PERSPECTIVE_INDEX` values `90`, `85`, `75`, `60`, `45`, `35.264`, `30`, `10` degrees    | Named camera presets                          | Encodes top-down, three-quarter, oblique, true isometric, pixel-art isometric, and low-angle views |
| `src/game/constants.ts`  | `pixelArtIsometric: 30` with comment about `arctan(sin(30 deg)) ~= 26.565 deg`           | 2:1 pixel-art convention                      | Documents the link between true angle math and the visual 2:1 ratio used by the art                |
| `src/game/scene/game.ts` | `camRotation = DegToRad(PERSPECTIVE_INDEX[this.perspective])`                            | Degree-to-radian bridge                       | Converts human-readable camera presets into runtime trig inputs                                    |
| `src/game/scene/game.ts` | `cosCam`, `sinCam`, `cotCam = cosCam / sinCam`                                           | Projection factors                            | Become `Y_FACTOR` and `Z_FACTOR` in `worldToScreen` and `screenToWorld`                            |
| `src/game/scene/game.ts` | `worldToScreen: x = world.x * X_FACTOR`, `y = world.y * Y_FACTOR - world.z * Z_FACTOR`   | Forward projection                            | Applies the trig-derived compression to every world-space object                                   |
| `src/game/scene/game.ts` | `screenToWorld: y = (screen.y + worldZ * Z_FACTOR) * Y_FACTOR_INV`                       | Inverse projection at known height            | Needed for aiming and picking because screen coordinates alone do not determine depth              |
| `src/game/scene/game.ts` | `cubeRotation = PI / 4` for isometric maps                                               | 45 degree Z rotation                          | Aligns the debug cube with the visual diamond grid                                                 |
| `src/game/scene/game.ts` | `Z_FACTOR = 5 / (8 * SQRT1_2)` in `pixelArtIsometric`                                    | Custom override, about `0.8839`               | Replaces pure `cos(30 deg) ~= 0.8660` so projected cube height matches the tileset convention      |
| `src/game/scene/game.ts` | `out.x = (normal[0] + normal[1]) * SQRT1_2`, `out.y = (normal[0] - normal[1]) * SQRT1_2` | Inverse 45 degree rotation of terrain normals | Converts packed isometric normalmap axes back into world axes                                      |
| `Readme.md`              | `sin(theta) = 0.5000`, `cos(theta) = 0.8660` for the 30 degree view                      | Design summary                                | Confirms that the README describes the same projection implemented in code                         |


Project-specific convention:

- `world.x` is left unchanged by projection, while `world.y` and `world.z` compete for `screen.y`.
- The project uses both mathematically pure isometric constants and art-driven overrides when the sprite set demands it.

### Aiming, Firing, Recoil, and Impact Orientation

The aiming model treats cannon orientation as two angles: azimuth in the horizontal plane and altitude above that plane. `src/game/lib/trigo.ts` converts between those angles and normalized velocity vectors, while `src/game/actors/Cannon.ts` and `src/game/lib/createCraterMark.ts` use angle math again for recoil, rendering, and impact marks.


| Location                           | Formula / Constant                                                                     | Meaning                                             | Why it matters                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/game/lib/trigo.ts`            | `horizontalSpeed = cos(altitude)`                                                      | Horizontal projection of the unit direction         | Splits a 3D aim vector into flat and vertical parts                                           |
| `src/game/lib/trigo.ts`            | `x = cos(azimuth) * horizontalSpeed`                                                   | World-space `x` component                           | Converts spherical angles into Cartesian motion                                               |
| `src/game/lib/trigo.ts`            | `y = sin(azimuth) * horizontalSpeed`                                                   | World-space `y` component                           | Same conversion for map depth                                                                 |
| `src/game/lib/trigo.ts`            | `z = sin(altitude)`                                                                    | Vertical component                                  | Gives muzzle elevation its direct effect on shot arc                                          |
| `src/game/lib/trigo.ts`            | `asin(clamp(vector.z, -1, 1))`                                                         | Recover altitude from a normalized velocity         | Converts a direction vector back into an elevation angle safely                               |
| `src/game/lib/trigo.ts`            | `atan2(vector.y, vector.x)`                                                            | Recover azimuth from a velocity vector              | Produces the horizontal heading with correct quadrant handling                                |
| `src/game/actors/Cannon.ts`        | `INITIAL_ALTITUDE = DegToRad(15)`                                                      | Default muzzle elevation                            | Establishes the starting ballistic arc                                                        |
| `src/game/actors/Cannon.ts`        | `TURN_RATE_RADIANS_PER_SECOND = DegToRad(90)`                                          | Angular speed limit                                 | Keeps rotation smooth and frame-rate independent                                              |
| `src/game/actors/Cannon.ts`        | `requestedAzymuth = Phaser.Math.Angle.BetweenPoints(...)`                              | Ground-plane target angle helper                    | Uses angle-space math to aim toward the clicked world point                                   |
| `src/game/actors/Cannon.ts`        | recoil offsets use `cos(rotation + PI)` and `sin(rotation + PI)`                       | Reverse direction along the barrel axis             | Drives the visible backward kick of the barrel, shadow, and wheels                            |
| `src/game/actors/Cannon.ts`        | `azymuthVelocity = (cos(azymuth), sin(azymuth), 0)`                                    | Flat heading vector                                 | Separates pure heading from full 3D shot direction                                            |
| `src/game/actors/Cannon.ts`        | `atan2(azymuthVelocity.screen.y, azymuthVelocity.screen.x)`                            | Screen-space heading angle                          | Rotates the shadow and wheels to match the projected ground heading                           |
| `src/game/actors/Cannon.ts`        | `atan2(velocity.screen.y, velocity.screen.x)`                                          | Screen-space full barrel angle                      | Rotates the cannon sprite to match the projected 3D shot                                      |
| `src/game/constants.ts`            | `CANNON_WHEELS_SPRITE_ROTATION = PI * 1.5`                                             | Sprite zeroing offset                               | Reorients the wheel sprite so screen heading can be added directly                            |
| `src/game/actors/Bullet.ts`        | `dragConstantSI = 0.5 * rho * C_d * PI * r^2`                                          | Sphere area inside drag formula                     | Not a trig use of `PI`, but it is the key circular geometry term used by the ballistics       |
| `src/game/lib/createCraterMark.ts` | `rotation + PI`                                                                        | Rotate crater opening opposite the travel direction | Makes the open side face the impact entry direction                                           |
| `src/game/lib/createCraterMark.ts` | `openingAngle = PI / 3`, `start = openingAngle / 2`, `end = 2 * PI - openingAngle / 2` | 60 degree missing arc                               | Creates a crater mark that is not a full circle and therefore carries directional information |


Project-specific convention:

- Azimuth is measured in the world `x-y` plane.
- Altitude is measured above that plane.
- The same physical direction is converted twice: once to world velocity for simulation, then again to a projected screen angle for sprite rotation.

### Terrain Slope and Surface Direction Math

Terrain math starts from a chosen normal `z` component and derives slope angles from it. The resulting constants are reused to define cardinal and diagonal terrain normals, convert tile levels into world height, and interpret normalmaps in debug and rendering code.


| Location                    | Formula / Constant                                                                           | Meaning                                           | Why it matters                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/game/lib/terrain.ts`   | `TILE_ELEVATION_ANGLE = acos(TILE_ELEVATION_Z)`                                              | Base slope angle for a one-tile rise              | Turns a chosen normal `z` component into an explicit angle                                         |
| `src/game/lib/terrain.ts`   | `TILE_ELEVATION_RATIO = tan(TILE_ELEVATION_ANGLE)`                                           | Height gain per tile width                        | Converts angle back into a usable rise-over-run ratio for terrain heights                          |
| `src/game/lib/terrain.ts`   | `HALF_TILE_ELEVATION_ANGLE = atan(SQRT2 * tan(TILE_ELEVATION_ANGLE))`                        | Diagonal equivalent slope angle                   | Adjusts the slope when the same height change happens over a half-diagonal instead of a full edge  |
| `src/game/lib/terrain.ts`   | `HALF_TILE_ELEVATION_Z = cos(HALF_TILE_ELEVATION_ANGLE)`                                     | Diagonal normal `z` component                     | Builds a consistent normal for diagonal slopes                                                     |
| `src/game/lib/terrain.ts`   | `sqrt(1 - z^2)` and `sqrt((1 - z^2) / 2)`                                                    | Horizontal components of normalized slope vectors | Produces the precomputed `N`, `S`, `E`, `W`, and diagonal normals used by terrain tiles            |
| `src/game/lib/terrain.ts`   | `height = (level + barycentric blend of corner z values) * pxElevationRatio`                 | Triangle-based interpolation                      | Not trig itself, but this is where the angle-derived elevation ratio becomes actual terrain height |
| `src/game/scene/game.ts`    | `getTileObjectWorldZ(...) = (layerLevel + centerLevel) * TILE_ELEVATION_RATIO * tileInWorld` | Tile-layer height lift                            | Bridges tile metadata to world `z` using the trig-derived slope ratio                              |
| `src/game/scene/game.ts`    | inverse 45 degree normal rotation with `SQRT1_2`                                             | Map normal to world normal                        | Keeps lighting and gameplay normals aligned with the simulation axes                               |
| `src/game/lib/heightmap.ts` | `angle = atan2(ny, nx)`                                                                      | 2D direction of a normal                          | Converts a normalmap sample into a compass direction for debug output                              |
| `src/game/lib/heightmap.ts` | `if (angle < 0) angle += 2 * PI`                                                             | Normalize to `[0, 2PI)`                           | Makes directional bucketing stable                                                                 |
| `src/game/lib/heightmap.ts` | `slice = PI / 4`, `index = round(angle / slice) % 8`                                         | 8-way directional quantization                    | Maps continuous normal directions to arrows `->`, `up`, `left`, and diagonals                      |


Supporting math around the trig:

- `heightmapToNormalmap(...)` in `src/game/lib/heightmap.ts` uses finite differences plus normalization, not trig, to derive normals from sampled heights.
- `addTileNormalmapToGlobalNormalmap(...)` builds a tangent-bitangent-normal basis and transforms detail normals into world space. It is important to the project's surface math, but its core operations are linear algebra, not trig.

### Geometry Generation and Sprite Construction

The project also uses trig to procedurally build shapes. `src/game/actors/Cube.ts` rotates local vertices around the `z` axis, while the cannon texture generators approximate a semicircle by sampling points along an angular sweep.


| Location                           | Formula / Constant                                                 | Meaning                                    | Why it matters                                                               |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/game/actors/Cube.ts`          | `cosR = cos(worldRotationZ)`, `sinR = sin(worldRotationZ)`         | Rotation matrix inputs                     | Lets the debug cuboid be rotated around vertical world `z`                   |
| `src/game/actors/Cube.ts`          | `rotatedX = x * cosR - y * sinR`, `rotatedY = x * sinR + y * cosR` | Standard 2D rotation                       | Applies a `z`-axis rotation to every top and bottom vertex before projection |
| `src/game/scene/game.ts`           | `worldRotationZ = PI / 4` for isometric cubes                      | 45 degree diamond alignment                | Makes the cuboid match the orientation of isometric tiles                    |
| `src/game/texture/cannon.ts`       | `startAngle = DegToRad(90)`, `angleStep = PI / arcPointsCount`     | Semicircle parameterization                | Defines a 180 degree counter-clockwise sweep for the cannon breech           |
| `src/game/texture/cannon.ts`       | `px = cx + r * cos(angle)`, `py = cy + r * sin(angle)`             | Circle sampling                            | Converts angle samples into polygon points for the procedural cannon outline |
| `src/game/texture/pixel-cannon.ts` | same semicircle sweep and `cos` / `sin` sampling                   | Pixel-art version of the same construction | Reuses the same geometry idea for the low-resolution cannon texture          |


Project-specific convention:

- Both cannon texture builders generate only a half-circle and join it to a rectangle, because the visual model is a barrel plus a rounded breech.
- The shape is not defined by an analytic curve at render time; it is baked into polygon points first.

### Shader-Space Lighting and Map Reprojection

The fragment shader reconstructs surface information from packed terrain textures, derives its view direction from the same runtime projection factors used by CPU geometry, rotates normals back from map space, and uses dot-product lighting. The trig here is small in surface area but central to how the terrain shading stays consistent with the camera model.


| Location                              | Formula / Constant                                                                                             | Meaning                                        | Why it matters                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/game/scene/LightningFilter.ts`   | `uProjectionYZ = (gameScene.worldToScreenRatio.y, gameScene.worldToScreenRatio.z)`                            | Runtime projection factors sent to shader      | Keeps shader lighting aligned with the exact `Y/Z` projection used by CPU geometry, including the pixel-art override |
| `src/game/scene/lightningShader.frag` | `viewDirection = normalize(vec3(0.0, uProjectionYZ.x, uProjectionYZ.y))`                                      | Camera-facing vector in surface space          | Uses the runtime projection model directly instead of reconstructing a pure-angle approximation                       |
| `src/game/scene/lightningShader.frag` | `COS45`, `SIN45`, `rotation45` matrix                                                                          | Fixed 45 degree rotation                       | Rotates sampled normals out of isometric texture orientation and back into world-like lighting space                |
| `src/game/scene/lightningShader.frag` | `worldToMapUV(...)` with half-tile inverses                                                                    | Isometric world-to-texture reprojection        | Not trig directly, but this coordinate conversion is what makes packed terrain samples line up with world positions |
| `src/game/scene/LightningFilter.ts`   | `uMapHalfTileInv = (2 / tileWidth, 2 / tileHeight)`                                                            | Inverse tile dimensions for the shader         | Supplies the constants required by the reprojection formula                                                         |
| `src/game/scene/LightningFilter.ts`   | `uMapSizeInTileInv = (1 / map.width, 1 / map.height)`                                                          | Map-size normalization factor                  | Converts tile coordinates into UV-space so the shader samples the correct texel in packed terrain data              |
| `src/game/scene/LightningFilter.ts`   | `uSurfaceHeightImpactOnScreenY = ((5 / 4) * tileHeight) / precision`                                           | Height-to-screen scaling                       | Encodes the art-driven cube-height convention that the shader uses during occlusion search                          |
| `src/game/scene/lightningShader.frag` | binary search over `worldGroundY` and `occlusionPoint = worldGroundY - height * uSurfaceHeightImpactOnScreenY` | Height-aware reprojection                      | Not trig itself, but it is the bridge between height data and the camera-dependent screen interpretation            |
| `src/game/scene/lightningShader.frag` | `rimDot = 1 - abs(dot(viewDirection, surfaceNormal))`, `diffuse = max(dot(surfaceNormal, sunDirection), 0)`    | View-dependent rim light and sun diffuse light | Uses the trig-derived `viewDirection` to create shading that respects the current camera angle                      |


Related but non-trig shader math:

- The included simplex and Voronoi functions are math-heavy procedural primitives, but they do not currently introduce additional trigonometric calculations.
- Most of the lighting after the view-direction step is linear algebra and tone-mapping rather than angle conversion.

## Scripts

The executable TypeScript files in `scripts/` are orchestration layers, not new sources of trig:


| Location | Role | Mathematical note |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/heightmap.ts` | Runs the terrain/normalmap generation pipeline | Calls shared math in `src/game/lib/heightmap.ts` and `src/game/lib/terrain.ts`; no meaningful local trig |
| `scripts/tileset.ts` | Rasterizes the terrain tileset bundle and assembles derived assets | Mostly pipeline geometry and image processing; no meaningful local trig, but it does encode project-specific proportions such as `elevationYOffsetPx` |
| `scripts/lib/terrain-raster.ts` | Rasterizes beauty terrain frames directly from scene-spec UVs | Uses deterministic screen-space projection, nearest-neighbor texture sampling, UV rotation, clamp-to-edge addressing, and ownership flood fill |
| `scripts/lib/terrain-ownership.ts` | Rasterizes exact native ownership masks and analytic checker frames from the shared scene/tile contract | Uses deterministic screen-space projection and half-open tile ownership to make the terrain atlas provably hole-free and overlap-free at native resolution |


Scope note:

- This review is exhaustive for inspectable TypeScript and shader code in the active pipeline.

## Recurring Mathematical Patterns

Several patterns appear repeatedly across the project:

1. The same camera pitch is decomposed into `sin(theta)` and `cos(theta)` everywhere projection or lighting needs to understand depth versus height.
2. A 45 degree rotation is a recurring special case because the map is visually diamond-aligned. On the CPU it appears as `PI / 4` or `SQRT1_2`; in the shader it appears as `COS45`, `SIN45`, and `rotation45`.
3. Terrain slopes are defined from normals first, then converted back into angle or rise/run terms with `acos`, `tan`, and `atan`.
4. Directional gameplay features use `atan2` whenever a vector must be converted back into a stable angle with correct quadrant handling.
5. Circular or arc-shaped geometry uses `PI`, `cos`, and `sin` to sample points rather than storing hand-authored outlines.
