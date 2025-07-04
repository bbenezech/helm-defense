import { type NESW, type Terrain } from "./terrain.js";
import type { Tileset } from "./tileset.js";

export type TilemapLayer = number[][];

export function getTilemap(rawLayers: number[][][], tileset: Tileset) {
  const slope = tileset.properties[0];
  if (!slope || slope.name !== "slope") throw new Error("Tileset must have a 'slope' property");
  const tilewidth = tileset.tilewidth;
  const tileheight = tileset.tileheight - 2 * slope.value;
  const layers = rawLayers.map((data, index) => ({
    id: index + 1,
    name: `slope-${index + 1}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: -(index * slope.value),
    width: data[0].length,
    height: data.length,
    data: data.flat(),
  }));
  const width = layers.reduce((max, layer) => Math.max(max, layer.width + layer.x), 0);
  const height = layers.reduce((max, layer) => Math.max(max, layer.height + layer.y), 0);

  return {
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width,
    height,
    tilesets: [{ firstgid: 1, ...tileset }],
    tileheight,
    tilewidth,
    layers,
    nextlayerid: 4,
    nextobjectid: 1,
    version: "1.10",
    tiledversion: "1.11.2",
    compressionlevel: -1,
    infinite: false,
  };
}

type NESWToGids = Record<NESW, { gid: number; probability: number }[]>;
function terrainToLayers(terrain: Terrain, tileset: Tileset): TilemapLayer[] {
  const firstgid = 1;
  const NESWToGids = tileset.tiles.reduce((acc, { id, properties, probability }) => {
    const NESW = properties.find((p) => p.name === "NESW")?.value;
    if (NESW !== undefined) (acc[NESW] ??= []).push({ gid: id + firstgid, probability });
    return acc;
  }, {} as NESWToGids);

  const layers: TilemapLayer[] = Array.from({ length: terrain.length }, () =>
    Array.from({ length: terrain[0].length }, () => Array(terrain[0][0].length).fill(0)),
  );

  for (let level = 0; level < terrain.length; level++) {
    for (let y = 0; y < terrain[level].length; y++) {
      for (let x = 0; x < terrain[level][y].length; x++) {
        const tile = terrain[level][y][x];
        if (tile === null) continue;
        const candidates = NESWToGids[tile];
        if (!candidates || candidates.length === 0)
          throw new Error(`No terrain candidates found for terrain tile "${tile}"`);
        const totalProbability = candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
        let randomPoint = Math.random() * totalProbability;
        let chosenCandidate = candidates[candidates.length - 1];
        for (const candidate of candidates) {
          if (randomPoint < candidate.probability) {
            chosenCandidate = candidate;
            break;
          }
          randomPoint -= candidate.probability;
        }

        if (chosenCandidate === undefined) throw new Error(`Could not select a valid slope tile for "${tile}"`);
        layers[level][y][x] = chosenCandidate.gid;
      }
    }
  }

  return layers;
}

export function getTilemapFromTerrain(terrain: Terrain, tileset: Tileset): Tilemap {
  return getTilemap(terrainToLayers(terrain, tileset), tileset);
}

export type Tilemap = ReturnType<typeof getTilemap>;
