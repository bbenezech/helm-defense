import { TERRAIN_TILE_INDEX, type TerrainTileName } from "./terrain.ts";

export function getTileset({
  imageFilename,
  name,
  tileheight,
  tilewidth,
  elevationYOffsetPx,
  terrainTileNames,
  tileMargin,
  tilesetMargin,
}: {
  name: string;
  imageFilename: string;
  tilewidth: number;
  tileheight: number;
  elevationYOffsetPx: number;
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

  const tiles = Array.from({ length: tilecount }, (_, index) => {
    const tileName = terrainTileNames[index];
    const terrain = TERRAIN_TILE_INDEX[tileName];
    return {
      id: index,
      probability: 1,
      properties: [
        { name: "NESW" as const, type: "string" as const, value: terrain.NESW },
        { name: "CENTER" as const, type: "float" as const, value: terrain.CENTER },
      ],
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
    properties: [{ name: "elevationYOffsetPx" as const, type: "int" as const, value: elevationYOffsetPx }],
  } as const;
}

export type Tileset = ReturnType<typeof getTileset>;
