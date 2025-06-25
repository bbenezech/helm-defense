import { getTilemapLayer as getTilemapSlopeLayer } from "./tilemap-layer.js";
import type { Tileset } from "./tileset.js";

export function getTilemap({ type, ...tileset }: Tileset, layerDatas: number[][][]) {
  const slopeheight = tileset.properties[0].value;
  const tilewidth = tileset.tilewidth;
  const tileheight = tileset.tileheight - 2 * slopeheight;
  const layers = layerDatas.map((data, index) => getTilemapSlopeLayer(index, slopeheight, data));
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

export type Tilemap = ReturnType<typeof getTilemap>;
