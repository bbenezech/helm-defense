import { type NESW, type TileData } from "./terrain.ts";

export type TilemapLayer = number[][];
export type Tilemap = ReturnType<typeof getTilemap>;

type TilemapTilesetProperty = {
  name: string;
  type: string;
  value: number | string;
};

type TilemapTilesetTile = {
  id: number;
  probability: number;
  properties: readonly TilemapTilesetProperty[];
};

type TilemapTileset = {
  type: string;
  name: string;
  image: string;
  tileheight: number;
  tilewidth: number;
  tilecount: number;
  rows: number;
  columns: number;
  spacing: number;
  margin: number;
  imagewidth: number;
  imageheight: number;
  version: string;
  tiledversion: string;
  properties: readonly TilemapTilesetProperty[];
  tiles: readonly TilemapTilesetTile[];
};

export function getTilemap(rawLayers: number[][][], tileset: TilemapTileset) {
  const elevationYOffsetPxProperty = tileset.properties.find((property) => property.name === "elevationYOffsetPx");
  if (elevationYOffsetPxProperty === undefined || typeof elevationYOffsetPxProperty.value !== "number") {
    throw new Error("Tileset must have an 'elevationYOffsetPx' property.");
  }
  const elevationYOffsetPx = elevationYOffsetPxProperty.value;
  const layers = rawLayers.map((data, index) => ({
    id: index + 1,
    name: `level-${index}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: -(index * elevationYOffsetPx),
    height: data.length,
    width: data[0].length,
    data: data.flat(),
    properties: [{ name: "level", type: "int", value: index }],
  }));
  const height = layers.reduce((max, layer) => Math.max(max, layer.height + layer.y), 0);
  const width = layers.reduce((max, layer) => Math.max(max, layer.width + layer.x), 0);
  const tileheight = tileset.tileheight - 2 * elevationYOffsetPx;
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

type TerrainShapeKey = `${NESW}:${0 | 0.5 | 1}`;

function parseTilesetNESW(value: string): NESW {
  switch (value) {
    case "0000":
    case "0001":
    case "0010":
    case "0011":
    case "0100":
    case "0101":
    case "0110":
    case "0111":
    case "0121":
    case "1000":
    case "1001":
    case "1010":
    case "1011":
    case "1012":
    case "1100":
    case "1101":
    case "1110":
    case "1210":
    case "2101":
      return value;
    default:
      throw new Error(`Invalid tileset NESW "${value}".`);
  }
}

function parseTilesetCenter(value: number): 0 | 0.5 | 1 {
  if (value === 0 || value === 0.5 || value === 1) return value;
  throw new Error(`Invalid tileset CENTER "${value}".`);
}

function getTerrainShapeKey(NESW: NESW, CENTER: 0 | 0.5 | 1): TerrainShapeKey {
  return `${NESW}:${CENTER}`;
}

export function terrainToLayers(terrain: TileData[][], tileset: TilemapTileset): TilemapLayer[] {
  const firstgid = 1;
  const terrainShapeToGid: Partial<Record<TerrainShapeKey, { gid: number; probability: number }>> = {};

  for (const { id, properties, probability } of tileset.tiles) {
    const NESW = properties.find((property) => property.name === "NESW");
    const CENTER = properties.find((property) => property.name === "CENTER");
    if (NESW === undefined || typeof NESW.value !== "string") {
      throw new Error(`Tileset tile ${id} is missing its NESW property.`);
    }
    if (CENTER === undefined || typeof CENTER.value !== "number") {
      throw new Error(`Tileset tile ${id} is missing its CENTER property.`);
    }

    const shapeKey = getTerrainShapeKey(parseTilesetNESW(NESW.value), parseTilesetCenter(CENTER.value));
    if (terrainShapeToGid[shapeKey] !== undefined) {
      throw new Error(`Duplicate tileset terrain shape "${shapeKey}" for tile ${id}.`);
    }

    terrainShapeToGid[shapeKey] = { gid: id + firstgid, probability };
  }

  const maxHeight = Math.max(...terrain.flat().map((t) => t.level));
  const layers: TilemapLayer[] = Array.from({ length: maxHeight + 1 }, () =>
    Array.from({ length: terrain.length }, () => Array.from({ length: terrain[0].length }, () => 0)),
  );

  for (const [y, element] of terrain.entries()) {
    for (const [x, cell] of element.entries()) {
      const terrainShape = terrainShapeToGid[getTerrainShapeKey(cell.tile.NESW, cell.tile.CENTER)];
      if (terrainShape === undefined) {
        throw new Error(
          `No tileset terrain shape found for "${cell.tile.NESW}" with center ${cell.tile.CENTER} at (${x}, ${y}).`,
        );
      }
      if (terrainShape.probability <= 0) {
        throw new Error(`Tileset terrain shape "${cell.tile.NESW}:${cell.tile.CENTER}" has non-positive probability.`);
      }

      layers[cell.level][y][x] = terrainShape.gid;
    }
  }

  return layers;
}
