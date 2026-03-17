export type RendererMode = "phaser" | "three";

export type Point2 = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type TerrainTilesetProperty =
  | { name: "NESW"; type: string; value: string }
  | { name: "CENTER"; type: string; value: number }
  | { name: string; type: string; value: number | string };

export type TerrainTilesetTile = {
  id: number;
  probability: number;
  properties: TerrainTilesetProperty[];
};

export type TerrainTileset = {
  type: "tileset";
  name: string;
  image: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  rows: number;
  columns: number;
  spacing: number;
  margin: number;
  imagewidth: number;
  imageheight: number;
  tiles: TerrainTilesetTile[];
  version: string;
  tiledversion: string;
  properties: TerrainTilesetProperty[];
};

export type TerrainMapLayerProperty = {
  name: string;
  type: string;
  value: number | string;
};

export type TerrainMapLayer = {
  id: number;
  name: string;
  opacity: number;
  type: "tilelayer";
  visible: boolean;
  x: number;
  y: number;
  offsetx?: number;
  offsety?: number;
  height: number;
  width: number;
  data: number[];
  properties: TerrainMapLayerProperty[];
};

export type TerrainMap = {
  type: "map";
  orientation: "isometric" | "orthogonal";
  renderorder: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TerrainMapLayer[];
  tilesets: Array<{ firstgid: number } & TerrainTileset>;
};

export type TileAtlasRegion = {
  offset: Point2;
  scale: Point2;
};

export type SurfaceTextureData = {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  minHeight: number;
  maxHeight: number;
};

export type PickedTile = {
  gid: number;
  tileId: number;
  tileX: number;
  tileY: number;
  level: number;
  layerIndex: number;
  offset: Point2;
};

export type TerrainAssetBundle = {
  map: TerrainMap;
  tileset: TerrainTileset;
  atlasUrl: string;
  bounds: Rect;
  elevationYOffsetPx: number;
  atlasRegions: Map<number, TileAtlasRegion>;
  surface: SurfaceTextureData;
};

export type TileInstanceData = {
  gid: number;
  tileId: number;
  tileX: number;
  tileY: number;
  chunkX: number;
  chunkY: number;
  screen: Point2;
  level: number;
  depth: number;
  atlasRegion: TileAtlasRegion;
};

export type TerrainChunk = {
  chunkX: number;
  chunkY: number;
  instances: TileInstanceData[];
};

export type ThreeTerrainApp = {
  destroy: () => void;
  resize: (width: number, height: number) => void;
  setPaused: (paused: boolean) => void;
};
