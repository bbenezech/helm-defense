# Helm Defense

## Status

Not much to see, mostly a tech demo

## Keywords

electron phaser game react top-down edge-scrolling full-screen

## Setup

```
brew install nvm imagemagick
nvm use
npm install yarn -g
yarn
cp .env.example .env
./scripts/tile.ts ./assets/textures/compass.png
```

## Run server

```
yarn start
```

## Tech Roadmap

- [x] Repo setup
- [x] Phaser setup
- [x] Tiled setup
- [x] scene setup
- [x] camera setup
- [x] 3d projection rules (top-down)
- [x] balistic trigonometry
- [x] cannon rotation
- [x] cannon 3d rendering
- [x] balistic 3d rendering
- [x] particles
- [x] flames
- [x] shadow rendering
- [x] shadow occlusion
- [x] move to Vite
- [x] add React
- [x] add electron
- [x] implement edge scrolling
- [x] implement pan/zoom
- [x] tile heightmap
- [x] sloped tile rendering
- [ ] height rendering
- [ ] tile collision
- [ ] sprite collision
- [ ] sprite animations
- [ ] collisions
- [ ] sprite physics
- [ ] sprite pooling
- [ ] AI basics (groups with tensors)
- [ ] pathfinding
- [ ] pathfinding map metadata
- [ ] procedural map generation/variation

## Game Roadmap

- [x] find tiles for map
- [x] make a fun cannon
- [x] make fun projectiles
- [ ] basic good first map with 3 cannons
- [ ] ennemy animated sprites
- [ ] basic game loop start/points/end
- [ ] find nice tiles for map
- [ ] make a fun map
- [ ] make defenders
- [ ] make defenders and ennemies send projectiles
- [ ] make cannons prettier
- [ ] make projectiles prettier
- [ ] make ennemies climb the castle with ladders
- [ ] make defenders attack the ennemies on the wall

## License

[MIT License](https://github.com/ourcade/phaser3-vite-template/blob/master/LICENSE)

In a Phaser.js isometric game.
Terrain is generated.
The terrain is:

- A width x height table of tiles (called the tilemap)
- A (width x resolution) x (height x resolution) table of height (called the heightmap)
  Tiles are displayed in a big diamond from the top (x=0, y=0) then next on the right (x=1, y=0), etc. down to (x=width-1, y=height-1) at the bottom.
  Tiles have slopes, that represent visually the height contained in the heightmap.
  There are 4 coordinate systems:
- 2d tile coordinates (origin top-left)
- 3d world coordinates that represent the simulation
- 2d screen coordinates that represent what the 30 degree projection. worldX and screenX are the same, the ratios between worldY, worldZ and screenY are described by an orthogonal 30 degree isometric game projection :
  - Y-Compression (sin θ) = 0.5000
  - Z-Influence (cos θ) = 0.8660
  - Y compressed by half. Very high Z influence.

```
  screenToWorld(screen: Phaser.Math.Vector2, worldZ: number, out = this._tmpVector3) {
    out.x = screen.x * this.X_FACTOR_INV;
    out.y = (screen.y + worldZ * this.Z_FACTOR) * this.Y_FACTOR_INV;
    out.z = worldZ;
    return out;
  }

  worldToScreen(world: Phaser.Math.Vector3, out = this._tmpVector2): Phaser.Math.Vector2 {
    out.x = world.x * this.X_FACTOR;
    out.y = world.y * this.Y_FACTOR - world.z * this.Z_FACTOR;
    return out;
  }
```

- 2d terrain coordinates for the heightmap that are similar to tile coordinate, with a finer resolution (resolution: number)

The height unit in the heightmap is consistent with the coordinates.

The terrain heightmap correctly describes the height of each part of the map seen from the very top (world coordinates), but the issue is I need the height of each part of the map seen from the 30 degree projection (screen coordinates).

I need a function projectHeightmapToScreen(heightmap: number[][]): number[][]
Please ask me any necessary question that can help.
