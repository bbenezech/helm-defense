import { type NESW, type Terrain } from "./terrain.js";
import type { Tileset } from "./tileset.js";

export type TilemapLayer = number[][];
export type Tilemap = ReturnType<typeof getTilemap>;

export function getTilemap(rawLayers: number[][][], tileset: Tileset) {
  const elevationYOffsetPx = tileset.properties.find((p) => p.name === "elevationYOffsetPx");
  if (elevationYOffsetPx === undefined) throw new Error("Tileset must have a 'slopeYOffsetPx' property");
  const layers = rawLayers.map((data, index) => ({
    id: index + 1,
    name: `level-${index}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: -(index * elevationYOffsetPx.value),
    height: data.length,
    width: data[0].length,
    data: data.flat(),
    properties: [{ name: "level", type: "int", value: index }],
  }));
  const height = layers.reduce((max, layer) => Math.max(max, layer.height + layer.y), 0);
  const width = layers.reduce((max, layer) => Math.max(max, layer.width + layer.x), 0);
  const tileheight = tileset.tileheight - 2 * elevationYOffsetPx.value;
  const tilewidth = tileset.tilewidth;

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
export function terrainToLayers(terrain: Terrain, tileset: Tileset): TilemapLayer[] {
  const firstgid = 1;
  const NESWToGids = tileset.tiles.reduce((accumulator, { id, properties, probability }) => {
    const NESW = properties.find((p) => p.name === "NESW")?.value;
    if (NESW !== undefined) (accumulator[NESW] ??= []).push({ gid: id + firstgid, probability });
    return accumulator;
  }, {} as NESWToGids);

  const maxHeight = Math.max(...terrain.flat().map((t) => t.level));
  const layers: TilemapLayer[] = Array.from({ length: maxHeight + 1 }, () =>
    Array.from({ length: terrain.length }, () => Array.from({ length: terrain[0].length })),
  );

  for (const [y, element] of terrain.entries()) {
    for (const [x, cell] of element.entries()) {
      const candidates = NESWToGids[cell.tile.NESW];
      if (!candidates || candidates.length === 0)
        throw new Error(`No terrain candidates found for terrain tile "${cell.tile.NESW}" at (${x}, ${y})`);
      const totalProbability = candidates.reduce((sum, candidate) => sum + candidate.probability, 0);
      let randomPoint = Math.random() * totalProbability;
      let chosenCandidate = candidates.at(-1);
      for (const candidate of candidates) {
        if (randomPoint < candidate.probability) {
          chosenCandidate = candidate;
          break;
        }
        randomPoint -= candidate.probability;
      }

      if (chosenCandidate === undefined)
        throw new Error(`Could not select a valid tile for "${cell.tile.NESW}" at (${x}, ${y})`);
      layers[cell.level][y][x] = chosenCandidate.gid;
    }
  }

  return layers;
}
