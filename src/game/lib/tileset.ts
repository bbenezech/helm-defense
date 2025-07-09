import { TERRAIN_TILE_INDEX, type TerrainTileName } from "./terrain.js";

export function getTileset({
  imageFilename,
  name,
  tileheight,
  tilewidth,
  slopeheight,
  terrainTileNames,
  tileMargin,
  tilesetMargin,
}: {
  name: string;
  imageFilename: string;
  tilewidth: number;
  tileheight: number;
  slopeheight: number;
  terrainTileNames: TerrainTileName[];
  tileMargin: number;
  tilesetMargin: number;
}) {
  const tilecount = terrainTileNames.length;
  const columns = Math.min(4, tilecount);
  const rows = Math.ceil(tilecount / columns);
  const spacing = tileMargin * 2;
  const margin = tilesetMargin + tileMargin;
  const imagewidth = (tilewidth + 2 * tileMargin) * columns + tilesetMargin * 2;
  const imageheight = (tileheight + 2 * tileMargin) * rows + tilesetMargin * 2;

  const tiles = Array.from({ length: tilecount }, (_, i) => {
    const tileName = terrainTileNames[i];
    const terrain = TERRAIN_TILE_INDEX[tileName];
    return {
      id: i,
      probability: 1,
      properties: [{ name: "NESW" as const, type: "string" as const, value: terrain.NESW }],
    };
  });

  return {
    type: "tileset",
    name,
    image: imageFilename,
    tilewidth,
    tileheight,
    tilecount,
    rows,
    columns,
    spacing,
    margin,
    imagewidth,
    imageheight,
    tiles,
    version: "1.10",
    tiledversion: "1.11.2",
    properties: [{ name: "slope" as const, type: "int" as const, value: slopeheight }],
  } as const;
}

export type Tileset = ReturnType<typeof getTileset>;
