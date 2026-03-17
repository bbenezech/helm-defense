import { getMapBounds, getLayerOffset } from "./projection.ts";
import type {
  PickedTile,
  SurfaceTextureData,
  TerrainAssetBundle,
  TerrainMap,
  TerrainMapLayer,
  TerrainTileset,
  TerrainTilesetProperty,
  TileAtlasRegion,
} from "./types.ts";

const DEFAULT_TILESET_NAME = "Grass_23-512x512";
const DEFAULT_MAP_NAME = "random.map.json";

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
}

function assertNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) throw new Error(message);
  return value;
}

function assertString(value: unknown, message: string): string {
  if (typeof value !== "string") throw new Error(message);
  return value;
}

function assertArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function parseTilesetProperty(value: unknown, index: number): TerrainTilesetProperty {
  assertObject(value, `Invalid tileset property at index ${index}`);
  return {
    name: assertString(value["name"], `Missing tileset property name at index ${index}`),
    type: assertString(value["type"], `Missing tileset property type at index ${index}`),
    value:
      typeof value["value"] === "number" || typeof value["value"] === "string"
        ? value["value"]
        : (() => {
            throw new Error(`Invalid tileset property value at index ${index}`);
          })(),
  };
}

function parseTilesetTile(value: unknown, index: number) {
  assertObject(value, `Invalid tileset tile at index ${index}`);
  return {
    id: assertNumber(value["id"], `Missing tileset tile id at index ${index}`),
    probability: assertNumber(value["probability"], `Missing tileset tile probability at index ${index}`),
    properties: assertArray(value["properties"], `Missing tileset tile properties at index ${index}`).map(
      parseTilesetProperty,
    ),
  };
}

export function parseTerrainTileset(value: unknown): TerrainTileset {
  assertObject(value, "Invalid terrain tileset");

  return {
    type: assertString(value["type"], "Missing tileset type") as TerrainTileset["type"],
    name: assertString(value["name"], "Missing tileset name"),
    image: assertString(value["image"], "Missing tileset image"),
    tilewidth: assertNumber(value["tilewidth"], "Missing tileset tilewidth"),
    tileheight: assertNumber(value["tileheight"], "Missing tileset tileheight"),
    tilecount: assertNumber(value["tilecount"], "Missing tileset tilecount"),
    rows: assertNumber(value["rows"], "Missing tileset rows"),
    columns: assertNumber(value["columns"], "Missing tileset columns"),
    spacing: assertNumber(value["spacing"], "Missing tileset spacing"),
    margin: assertNumber(value["margin"], "Missing tileset margin"),
    imagewidth: assertNumber(value["imagewidth"], "Missing tileset imagewidth"),
    imageheight: assertNumber(value["imageheight"], "Missing tileset imageheight"),
    tiles: assertArray(value["tiles"], "Missing tileset tiles").map(parseTilesetTile),
    version: assertString(value["version"], "Missing tileset version"),
    tiledversion: assertString(value["tiledversion"], "Missing tileset tiledversion"),
    properties: assertArray(value["properties"], "Missing tileset properties").map(parseTilesetProperty),
  };
}

function parseLayerProperty(value: unknown, index: number) {
  assertObject(value, `Invalid map layer property at index ${index}`);
  if (typeof value["value"] !== "number" && typeof value["value"] !== "string")
    throw new Error(`Invalid map layer property value at index ${index}`);

  return {
    name: assertString(value["name"], `Missing map layer property name at index ${index}`),
    type: assertString(value["type"], `Missing map layer property type at index ${index}`),
    value: value["value"],
  };
}

function parseMapLayer(value: unknown, index: number): TerrainMapLayer {
  assertObject(value, `Invalid map layer at index ${index}`);

  return {
    id: assertNumber(value["id"], `Missing map layer id at index ${index}`),
    name: assertString(value["name"], `Missing map layer name at index ${index}`),
    opacity: assertNumber(value["opacity"], `Missing map layer opacity at index ${index}`),
    type: assertString(value["type"], `Missing map layer type at index ${index}`) as TerrainMapLayer["type"],
    visible: value["visible"] === true,
    x: assertNumber(value["x"], `Missing map layer x at index ${index}`),
    y: assertNumber(value["y"], `Missing map layer y at index ${index}`),
    offsetx: typeof value["offsetx"] === "number" ? value["offsetx"] : 0,
    offsety: typeof value["offsety"] === "number" ? value["offsety"] : 0,
    height: assertNumber(value["height"], `Missing map layer height at index ${index}`),
    width: assertNumber(value["width"], `Missing map layer width at index ${index}`),
    data: assertArray(value["data"], `Missing map layer data at index ${index}`).map((gid, gidIndex) =>
      assertNumber(gid, `Invalid gid at index ${gidIndex} in layer ${index}`),
    ),
    properties: assertArray(value["properties"], `Missing map layer properties at index ${index}`).map(parseLayerProperty),
  };
}

export function parseTerrainMap(value: unknown): TerrainMap {
  assertObject(value, "Invalid terrain map");
  const tilesets = assertArray(value["tilesets"], "Missing map tilesets");
  if (tilesets.length !== 1) throw new Error(`Expected exactly one tileset, received ${tilesets.length}`);
  const tilesetWithFirstGid = tilesets[0];
  assertObject(tilesetWithFirstGid, "Invalid map tileset entry");

  return {
    type: assertString(value["type"], "Missing map type") as TerrainMap["type"],
    orientation: assertString(value["orientation"], "Missing map orientation") as TerrainMap["orientation"],
    renderorder: assertString(value["renderorder"], "Missing map renderorder"),
    width: assertNumber(value["width"], "Missing map width"),
    height: assertNumber(value["height"], "Missing map height"),
    tilewidth: assertNumber(value["tilewidth"], "Missing map tilewidth"),
    tileheight: assertNumber(value["tileheight"], "Missing map tileheight"),
    layers: assertArray(value["layers"], "Missing map layers").map(parseMapLayer),
    tilesets: [
      {
        firstgid: assertNumber(tilesetWithFirstGid["firstgid"], "Missing map tileset firstgid"),
        ...parseTerrainTileset(tilesetWithFirstGid),
      },
    ],
  };
}

function getAssetUrl(pathname: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  return new URL(pathname.replace(/^\//u, ""), baseUrl).toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return response.json();
}

function getTilesetNumberProperty(tileset: TerrainTileset, name: string): number {
  const property = tileset.properties.find((entry) => entry.name === name && typeof entry.value === "number");
  if (!property || typeof property.value !== "number") throw new Error(`Missing tileset property "${name}"`);
  return property.value;
}

function getTileNumberProperty(tileset: TerrainTileset, tileId: number, name: string): number {
  const tile = tileset.tiles.find((entry) => entry.id === tileId);
  if (!tile) throw new Error(`Unknown tile id "${tileId}"`);
  const property = tile.properties.find((entry) => entry.name === name && typeof entry.value === "number");
  if (!property || typeof property.value !== "number") throw new Error(`Missing tile property "${name}" on tile "${tileId}"`);
  return property.value;
}

function getTileStringProperty(tileset: TerrainTileset, tileId: number, name: string): string {
  const tile = tileset.tiles.find((entry) => entry.id === tileId);
  if (!tile) throw new Error(`Unknown tile id "${tileId}"`);
  const property = tile.properties.find((entry) => entry.name === name && typeof entry.value === "string");
  if (!property || typeof property.value !== "string") throw new Error(`Missing tile property "${name}" on tile "${tileId}"`);
  return property.value;
}

export function getAtlasRegion(tileset: TerrainTileset, tileId: number): TileAtlasRegion {
  if (tileId < 0 || tileId >= tileset.tilecount) throw new Error(`Tile id "${tileId}" is out of bounds`);
  const column = tileId % tileset.columns;
  const row = Math.floor(tileId / tileset.columns);
  const x = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
  const y = tileset.margin + row * (tileset.tileheight + tileset.spacing);

  return {
    offset: {
      x: x / tileset.imagewidth,
      y: 1 - (y + tileset.tileheight) / tileset.imageheight,
    },
    scale: {
      x: tileset.tilewidth / tileset.imagewidth,
      y: tileset.tileheight / tileset.imageheight,
    },
  };
}

function normalizeVector(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function getApproximateNormal(nesw: string): [number, number, number] {
  const north = Number.parseInt(nesw[0] ?? "0", 10) || 0;
  const east = Number.parseInt(nesw[1] ?? "0", 10) || 0;
  const south = Number.parseInt(nesw[2] ?? "0", 10) || 0;
  const west = Number.parseInt(nesw[3] ?? "0", 10) || 0;

  return normalizeVector((west - east) * 0.7, (north - south) * 0.7, 2);
}

function getTopTile(map: TerrainMap, tileX: number, tileY: number): PickedTile | null {
  const tileset = map.tilesets[0];
  for (const [index, layer] of map.layers.toReversed().entries()) {
    const gid = layer.data[tileY * layer.width + tileX];
    if (gid === 0 || gid === undefined) continue;

    const level = Number(
      layer.properties.find((property) => property.name === "level" && typeof property.value === "number")?.value ?? 0,
    );

    return {
      gid,
      tileId: gid - tileset.firstgid,
      tileX,
      tileY,
      level,
      layerIndex: map.layers.length - index - 1,
      offset: getLayerOffset(layer),
    };
  }

  return null;
}

function createSurfaceTextureData(map: TerrainMap, tileset: TerrainTileset): SurfaceTextureData {
  const heights: number[] = [];
  const surfaceEntries: Array<{
    normal: [number, number, number];
    height: number;
  } | null> = [];

  for (let tileY = 0; tileY < map.height; tileY++) {
    for (let tileX = 0; tileX < map.width; tileX++) {
      const topTile = getTopTile(map, tileX, tileY);
      if (topTile === null) {
        surfaceEntries.push(null);
        continue;
      }

      const center = getTileNumberProperty(tileset, topTile.tileId, "CENTER");
      const nesw = getTileStringProperty(tileset, topTile.tileId, "NESW");
      const height = topTile.level + center;
      heights.push(height);
      surfaceEntries.push({
        normal: getApproximateNormal(nesw),
        height,
      });
    }
  }

  const minHeight = heights.length === 0 ? 0 : Math.min(...heights);
  const maxHeight = heights.length === 0 ? 1 : Math.max(...heights);
  const heightRange = maxHeight - minHeight || 1;
  const data = new Uint8Array(map.width * map.height * 4);

  for (const [index, entry] of surfaceEntries.entries()) {
    const bufferIndex = index * 4;
    if (entry === null) {
      data[bufferIndex] = 128;
      data[bufferIndex + 1] = 128;
      data[bufferIndex + 2] = 255;
      data[bufferIndex + 3] = 0;
      continue;
    }

    data[bufferIndex] = Math.round((entry.normal[0] * 0.5 + 0.5) * 255);
    data[bufferIndex + 1] = Math.round((entry.normal[1] * 0.5 + 0.5) * 255);
    data[bufferIndex + 2] = Math.round((entry.normal[2] * 0.5 + 0.5) * 255);
    data[bufferIndex + 3] = Math.round(((entry.height - minHeight) / heightRange) * 255);
  }

  return {
    data,
    width: map.width,
    height: map.height,
    minHeight,
    maxHeight,
  };
}

export async function loadTerrainAssetBundle(tilesetName = DEFAULT_TILESET_NAME): Promise<TerrainAssetBundle> {
  const tilesetUrl = getAssetUrl(`${tilesetName}/tileset.json`);
  const mapUrl = getAssetUrl(`${tilesetName}/${DEFAULT_MAP_NAME}`);
  const [tilesetJson, mapJson] = await Promise.all([fetchJson(tilesetUrl), fetchJson(mapUrl)]);
  const tileset = parseTerrainTileset(tilesetJson);
  const map = parseTerrainMap(mapJson);
  const atlasRegions = new Map<number, TileAtlasRegion>();
  for (const tile of tileset.tiles) atlasRegions.set(tile.id, getAtlasRegion(tileset, tile.id));

  return {
    map,
    tileset,
    atlasUrl: getAssetUrl(`${tilesetName}/${tileset.image}`),
    bounds: getMapBounds(map),
    elevationYOffsetPx: getTilesetNumberProperty(tileset, "elevationYOffsetPx"),
    atlasRegions,
    surface: createSurfaceTextureData(map, tileset),
  };
}
