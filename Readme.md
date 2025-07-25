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
