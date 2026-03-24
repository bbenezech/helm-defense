/// <reference lib="dom" />

declare global {
  interface ImportMetaEnv {
    BASE_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

import * as THREE from "three/src/Three.WebGPU.js";
import { type PackedTerrainStack, type SurfaceCellGrid } from "./chunks.ts";
import { createPackedTerrainCodec, createSurfaceCellGrid, type PackedTerrainCodec } from "./codec.ts";
import { getMapBounds, type Point2, type Rect } from "./projection.ts";

export type TerrainTilesetProperty =
  | { name: "NESW"; type: string; value: string }
  | { name: "CENTER"; type: string; value: number }
  | { name: string; type: string; value: number | string };

export type TerrainTilesetTile = { id: number; probability: number; properties: TerrainTilesetProperty[] };

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

export type TerrainMapLayerProperty = { name: string; type: string; value: number | string };

export type TerrainMapLayer = {
  id: number;
  name: string;
  opacity: number;
  type: "tilelayer";
  visible: boolean;
  x: number;
  y: number;
  offsetx: number;
  offsety: number;
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

export type TileAtlasRegion = { offset: Point2; scale: Point2 };

export type BiomeManifestEntry = { id: string; atlas: string; checkerAtlas: string };

export type BiomeManifest = { biomes: BiomeManifestEntry[] };

type TerrainAtlasArray = {
  texture: THREE.DataArrayTexture;
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  depth: number;
};

export type ColorAtlasArray = TerrainAtlasArray;
export type CheckerAtlasArray = TerrainAtlasArray;

export type PackedTerrainTexture = { texture: THREE.DataArrayTexture; stack: PackedTerrainStack };
export type SurfaceCellTexture = { texture: THREE.DataTexture; grid: SurfaceCellGrid };

export type TerrainAssetBundle = {
  map: TerrainMap;
  tileset: TerrainTileset;
  bounds: Rect;
  elevationYOffsetPx: number;
  biomeManifest: BiomeManifest;
  colorAtlas: ColorAtlasArray;
  checkerAtlas: CheckerAtlasArray;
  packedTerrain: PackedTerrainTexture;
  surfaceCells: SurfaceCellTexture;
  codec: PackedTerrainCodec;
};

const DEFAULT_TILESET_NAME = "Grass_23-512x512";
const DEFAULT_MAP_NAME = "random.map.json";
const DEFAULT_BIOME_MANIFEST_NAME = "biomes.json";

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

function assertTilesetType(value: unknown): TerrainTileset["type"] {
  const tilesetType = assertString(value, "Missing tileset type");
  if (tilesetType !== "tileset") throw new Error(`Invalid tileset type "${tilesetType}"`);
  return tilesetType;
}

function assertMapType(value: unknown): TerrainMap["type"] {
  const mapType = assertString(value, "Missing map type");
  if (mapType !== "map") throw new Error(`Invalid map type "${mapType}"`);
  return mapType;
}

function assertMapOrientation(value: unknown): TerrainMap["orientation"] {
  const orientation = assertString(value, "Missing map orientation");
  if (orientation !== "isometric" && orientation !== "orthogonal") {
    throw new Error(`Invalid map orientation "${orientation}"`);
  }
  return orientation;
}

function assertLayerType(value: unknown, index: number): TerrainMapLayer["type"] {
  const layerType = assertString(value, `Missing map layer type at index ${index}`);
  if (layerType !== "tilelayer") throw new Error(`Invalid map layer type "${layerType}" at index ${index}`);
  return layerType;
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
      (property, propertyIndex) => parseTilesetProperty(property, propertyIndex),
    ),
  };
}

export function parseTerrainTileset(value: unknown): TerrainTileset {
  assertObject(value, "Invalid terrain tileset");

  return {
    type: assertTilesetType(value["type"]),
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
    tiles: assertArray(value["tiles"], "Missing tileset tiles").map((tile, index) => parseTilesetTile(tile, index)),
    version: assertString(value["version"], "Missing tileset version"),
    tiledversion: assertString(value["tiledversion"], "Missing tileset tiledversion"),
    properties: assertArray(value["properties"], "Missing tileset properties").map((property, index) =>
      parseTilesetProperty(property, index),
    ),
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
    type: assertLayerType(value["type"], index),
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
    properties: assertArray(value["properties"], `Missing map layer properties at index ${index}`).map(
      (property, propertyIndex) => parseLayerProperty(property, propertyIndex),
    ),
  };
}

export function parseTerrainMap(value: unknown): TerrainMap {
  assertObject(value, "Invalid terrain map");
  const tilesets = assertArray(value["tilesets"], "Missing map tilesets");
  if (tilesets.length !== 1) throw new Error(`Expected exactly one tileset, received ${tilesets.length}`);
  const tilesetWithFirstGid = tilesets[0];
  assertObject(tilesetWithFirstGid, "Invalid map tileset entry");

  return {
    type: assertMapType(value["type"]),
    orientation: assertMapOrientation(value["orientation"]),
    renderorder: assertString(value["renderorder"], "Missing map renderorder"),
    width: assertNumber(value["width"], "Missing map width"),
    height: assertNumber(value["height"], "Missing map height"),
    tilewidth: assertNumber(value["tilewidth"], "Missing map tilewidth"),
    tileheight: assertNumber(value["tileheight"], "Missing map tileheight"),
    layers: assertArray(value["layers"], "Missing map layers").map((layer, index) => parseMapLayer(layer, index)),
    tilesets: [
      {
        firstgid: assertNumber(tilesetWithFirstGid["firstgid"], "Missing map tileset firstgid"),
        ...parseTerrainTileset(tilesetWithFirstGid),
      },
    ],
  };
}

export function parseBiomeManifest(value: unknown): BiomeManifest {
  assertObject(value, "Invalid biome manifest");
  const biomes = assertArray(value["biomes"], "Missing biome manifest entries").map((entry, index) => {
    assertObject(entry, `Invalid biome entry at index ${index}`);

    return {
      id: assertString(entry["id"], `Missing biome id at index ${index}`),
      atlas: assertString(entry["atlas"], `Missing biome atlas at index ${index}`),
      checkerAtlas: assertString(entry["checkerAtlas"], `Missing biome checker atlas at index ${index}`),
    };
  });

  if (biomes.length === 0) throw new Error("Biome manifest must contain at least one biome.");

  return { biomes };
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

export function getAtlasRegion(tileset: TerrainTileset, tileId: number): TileAtlasRegion {
  if (tileId < 0 || tileId >= tileset.tilecount) throw new Error(`Tile id "${tileId}" is out of bounds`);
  const column = tileId % tileset.columns;
  const row = Math.floor(tileId / tileset.columns);
  const x = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
  const y = tileset.margin + row * (tileset.tileheight + tileset.spacing);

  return {
    offset: { x: x / tileset.imagewidth, y: 1 - (y + tileset.tileheight) / tileset.imageheight },
    scale: { x: tileset.tilewidth / tileset.imagewidth, y: tileset.tileheight / tileset.imageheight },
  };
}

async function loadImagePixels(url: string): Promise<{ data: Uint8Array<ArrayBuffer>; width: number; height: number }> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error(`Failed to create canvas context for ${url}`);
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, image.width, image.height);

  return { data: new Uint8Array(imageData.data), width: image.width, height: image.height };
}

type LoadedAtlasImage = { data: Uint8Array<ArrayBuffer>; width: number; height: number; pathname: string };

function getAtlasLayout(images: LoadedAtlasImage[], label: string): { width: number; height: number; depth: number } {
  const firstImage = images[0];
  if (firstImage === undefined) throw new Error(`${label} did not produce any atlas images.`);

  const layout = { width: firstImage.width, height: firstImage.height, depth: images.length };

  for (const [index, image] of images.entries()) {
    if (image.width !== layout.width || image.height !== layout.height) {
      throw new Error(
        `${label} mismatch at index ${index} (${image.pathname}): expected ${layout.width}x${layout.height}, received ${image.width}x${image.height}.`,
      );
    }
  }

  return layout;
}

function createAtlasArray(images: LoadedAtlasImage[], label: string): TerrainAtlasArray {
  const layout = getAtlasLayout(images, label);
  const data = new Uint8Array(layout.width * layout.height * layout.depth * 4);
  const layerStride = layout.width * layout.height * 4;

  for (const [index, image] of images.entries()) data.set(image.data, index * layerStride);

  const texture = new THREE.DataArrayTexture(data, layout.width, layout.height, layout.depth);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { texture, data, width: layout.width, height: layout.height, depth: layout.depth };
}

async function loadAtlasArray(
  tilesetName: string,
  manifest: BiomeManifest,
  selector: (biome: BiomeManifestEntry) => string,
  label: string,
): Promise<TerrainAtlasArray> {
  const images = await Promise.all(
    manifest.biomes.map(async (biome) => {
      const pathname = selector(biome);
      const image = await loadImagePixels(getAssetUrl(`${tilesetName}/${pathname}`));
      return { ...image, pathname };
    }),
  );

  return createAtlasArray(images, label);
}

async function loadColorAtlasArray(tilesetName: string, manifest: BiomeManifest): Promise<ColorAtlasArray> {
  return loadAtlasArray(tilesetName, manifest, (biome) => biome.atlas, "Biome color atlas");
}

async function loadCheckerAtlasArray(tilesetName: string, manifest: BiomeManifest): Promise<CheckerAtlasArray> {
  return loadAtlasArray(tilesetName, manifest, (biome) => biome.checkerAtlas, "Biome checker atlas");
}

function assertAtlasArrayLayoutsMatch(colorAtlas: ColorAtlasArray, checkerAtlas: CheckerAtlasArray) {
  if (
    colorAtlas.width !== checkerAtlas.width ||
    colorAtlas.height !== checkerAtlas.height ||
    colorAtlas.depth !== checkerAtlas.depth
  ) {
    throw new Error(
      `Biome atlas layout mismatch: color atlas is ${colorAtlas.width}x${colorAtlas.height}x${colorAtlas.depth}, checker atlas is ${checkerAtlas.width}x${checkerAtlas.height}x${checkerAtlas.depth}.`,
    );
  }
}

function encodeTerrainWordTextureData(words: Uint32Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(words.length * 4);

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (word === undefined) throw new Error(`Missing packed terrain word at index ${index}.`);
    const dataOffset = index * 4;
    data[dataOffset] = word & 0xff;
    data[dataOffset + 1] = (word >> 8) & 0xff;
    data[dataOffset + 2] = (word >> 16) & 0xff;
    data[dataOffset + 3] = (word >>> 24) & 0xff;
  }

  return data;
}

export function encodePackedTerrainTextureData(stack: PackedTerrainStack): Uint8Array<ArrayBuffer> {
  return encodeTerrainWordTextureData(stack.data);
}

export function encodeSurfaceCellTextureData(grid: SurfaceCellGrid): Uint8Array<ArrayBuffer> {
  return encodeTerrainWordTextureData(grid.data);
}

function createPackedTerrainTexture(stack: PackedTerrainStack): PackedTerrainTexture {
  const textureData = encodePackedTerrainTextureData(stack);
  const texture = new THREE.DataArrayTexture(textureData, stack.width, stack.height, stack.slices);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { texture, stack };
}

function createSurfaceCellTexture(grid: SurfaceCellGrid): SurfaceCellTexture {
  const textureData = encodeSurfaceCellTextureData(grid);
  const texture = new THREE.DataTexture(textureData, grid.width, grid.height);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return { texture, grid };
}

export async function loadTerrainAssetBundle(tilesetName = DEFAULT_TILESET_NAME): Promise<TerrainAssetBundle> {
  const tilesetUrl = getAssetUrl(`${tilesetName}/tileset.json`);
  const mapUrl = getAssetUrl(`${tilesetName}/${DEFAULT_MAP_NAME}`);
  const biomeManifestUrl = getAssetUrl(`${tilesetName}/${DEFAULT_BIOME_MANIFEST_NAME}`);
  const [tilesetJson, mapJson, biomeManifestJson] = await Promise.all([
    fetchJson(tilesetUrl),
    fetchJson(mapUrl),
    fetchJson(biomeManifestUrl),
  ]);
  const tileset = parseTerrainTileset(tilesetJson);
  const map = parseTerrainMap(mapJson);
  const biomeManifest = parseBiomeManifest(biomeManifestJson);
  const elevationYOffsetPx = getTilesetNumberProperty(tileset, "elevationYOffsetPx");
  const [colorAtlas, checkerAtlas] = await Promise.all([
    loadColorAtlasArray(tilesetName, biomeManifest),
    loadCheckerAtlasArray(tilesetName, biomeManifest),
  ]);
  assertAtlasArrayLayoutsMatch(colorAtlas, checkerAtlas);
  const codec = createPackedTerrainCodec(map, tileset, elevationYOffsetPx, 0);
  const packedTerrain = createPackedTerrainTexture(codec.stack);
  const surfaceCells = createSurfaceCellTexture(createSurfaceCellGrid(map, 0));

  return {
    map,
    tileset,
    bounds: getMapBounds(map),
    elevationYOffsetPx,
    biomeManifest,
    colorAtlas,
    checkerAtlas,
    packedTerrain,
    surfaceCells,
    codec,
  };
}
