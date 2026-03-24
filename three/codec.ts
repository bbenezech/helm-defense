import type { TerrainMap, TerrainTileset } from "./assets.ts";
import type { PackedTerrainStack, PackedTerrainWord, SurfaceCellGrid } from "./chunks.ts";
import type { Point2 } from "./projection.ts";

export type PainterCandidate = {
  ordinal: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  slice: number;
  d: number;
  s: number;
  key: number;
  screen: Point2;
};

export type ResolveHit = {
  word: PackedTerrainWord;
  shapeRef: number;
  tileId: number;
  biomeIndex: number;
  baseHeightLevel: number;
  mapX: number;
  mapY: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  slice: number;
  key: number;
  screen: Point2;
  localX: number;
  localY: number;
  rgba: [number, number, number, number];
};

export type ResolveTraceCandidate = PainterCandidate & {
  word: PackedTerrainWord;
  shapeRef: number;
  tileId: number | null;
  biomeIndex: number;
  baseHeightLevel: number;
  mapX: number;
  mapY: number;
  localX: number;
  localY: number;
  rgba: [number, number, number, number];
  sampledAlpha: number;
};

export type ResolveTrace = {
  winner: ResolveHit | null;
  candidates: ResolveTraceCandidate[];
};

export type ResolveColorAtlas = {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  depth: number;
};

type LayoutContract = {
  frameWidth: number;
  frameHeight: number;
  tileWidth: number;
  tileHeight: number;
  halfTileWidth: number;
  halfTileHeight: number;
  frameTopOffset: number;
  elevationStep: number;
  levelsPerOctave: 8;
};

type PackedPlacement = {
  packedX: number;
  packedY: number;
  slice: number;
  word: PackedTerrainWord;
};

type CandidateOrder = {
  shapeRef: number;
  baseHeightLevel: number;
  mapX: number;
  mapY: number;
};

export const SHAPE_REF_MASK = 0b1_1111;
export const BIOME_INDEX_SHIFT = 5;
export const BIOME_INDEX_MASK = 0xff;
export const BASE_HEIGHT_LEVEL_SHIFT = 13;
export const BASE_HEIGHT_LEVEL_MASK = 0x7f_fff;

function getLevel(layer: TerrainMap["layers"][number]): number {
  for (const property of layer.properties) {
    if (property.name === "level" && typeof property.value === "number") return property.value;
  }

  return 0;
}

function getOrderedLayers(map: TerrainMap): TerrainMap["layers"] {
  const levels = new Set<number>();
  const layers = [...map.layers];

  for (const layer of layers) {
    const level = getLevel(layer);
    if (!Number.isInteger(level) || level < 0) {
      throw new Error(`Packed terrain codec requires non-negative integer levels, received ${level}.`);
    }
    if (levels.has(level)) {
      throw new Error(`Packed terrain codec requires unique layer levels, duplicate level ${level} detected.`);
    }
    levels.add(level);
  }

  layers.sort((left, right) => getLevel(left) - getLevel(right));
  return layers;
}

function getLayoutContract(map: TerrainMap, tileset: TerrainTileset, elevationStep: number): LayoutContract {
  const frameWidth = tileset.tilewidth;
  const frameHeight = tileset.tileheight;
  const tileWidth = map.tilewidth;
  const tileHeight = map.tileheight;
  const halfTileWidth = tileWidth * 0.5;
  const halfTileHeight = tileHeight * 0.5;
  const frameTopOffset = frameHeight - tileHeight;
  const levelsPerOctave = frameWidth / elevationStep;

  if (!Number.isInteger(levelsPerOctave) || levelsPerOctave !== 8) {
    throw new Error(`Packed terrain codec requires an 8-slice contract, received ${levelsPerOctave}.`);
  }

  return {
    frameWidth,
    frameHeight,
    tileWidth,
    tileHeight,
    halfTileWidth,
    halfTileHeight,
    frameTopOffset,
    elevationStep,
    levelsPerOctave: 8,
  };
}

function createEmptyStack(): PackedTerrainStack {
  return {
    data: new Uint32Array(8),
    width: 1,
    height: 1,
    slices: 8,
    origin: { x: 0, y: 0 },
  };
}

export function encodePackedTerrainWord(
  shapeReference: number,
  biomeIndex: number,
  baseHeightLevel: number,
): PackedTerrainWord {
  if (shapeReference < 0 || shapeReference > SHAPE_REF_MASK) {
    throw new Error(`Packed terrain shape reference ${shapeReference} is out of bounds.`);
  }
  if (biomeIndex < 0 || biomeIndex > BIOME_INDEX_MASK) {
    throw new Error(`Packed terrain biome index ${biomeIndex} is out of bounds.`);
  }
  if (baseHeightLevel < 0 || baseHeightLevel > BASE_HEIGHT_LEVEL_MASK) {
    throw new Error(`Packed terrain base height level ${baseHeightLevel} is out of bounds.`);
  }

  return (
    ((baseHeightLevel & BASE_HEIGHT_LEVEL_MASK) << BASE_HEIGHT_LEVEL_SHIFT) |
    ((biomeIndex & BIOME_INDEX_MASK) << BIOME_INDEX_SHIFT) |
    (shapeReference & SHAPE_REF_MASK)
  );
}

export function decodeShapeReference(word: PackedTerrainWord): number {
  return word & SHAPE_REF_MASK;
}

export function decodeBiomeIndex(word: PackedTerrainWord): number {
  return (word >> BIOME_INDEX_SHIFT) & BIOME_INDEX_MASK;
}

export function decodeBaseHeightLevel(word: PackedTerrainWord): number {
  return (word >> BASE_HEIGHT_LEVEL_SHIFT) & BASE_HEIGHT_LEVEL_MASK;
}

function getPackedScreen(layout: LayoutContract, packedX: number, packedY: number, slice: number): Point2 {
  return {
    x: (packedX - packedY) * layout.halfTileWidth + layout.halfTileWidth,
    y: (packedX + packedY) * layout.halfTileHeight + layout.halfTileHeight - layout.elevationStep * slice,
  };
}

export function createPackedTerrainStack(
  map: TerrainMap,
  _tileset: TerrainTileset,
  _elevationStep: number,
  biomeIndex = 0,
): PackedTerrainStack {
  if (map.renderorder !== "right-down") {
    throw new Error(`Packed terrain codec requires Tiled renderorder "right-down", received "${map.renderorder}".`);
  }

  const placements: PackedPlacement[] = [];
  const tileset = map.tilesets[0];
  const firstgid = tileset === undefined ? 1 : tileset.firstgid;

  for (const layer of getOrderedLayers(map)) {
    const level = getLevel(layer);
    const octave = Math.floor(level / 8);
    const slice = level % 8;

    for (let tileY = 0; tileY < layer.height; tileY++) {
      for (let tileX = 0; tileX < layer.width; tileX++) {
        const gid = layer.data[tileY * layer.width + tileX];
        if (gid === 0 || gid === undefined) continue;
        const tileId = gid - firstgid;
        const shapeReference = tileId + 1;

        placements.push({
          packedX: tileX - 2 * octave,
          packedY: tileY - 2 * octave,
          slice,
          word: encodePackedTerrainWord(shapeReference, biomeIndex, level),
        });
      }
    }
  }

  if (placements.length === 0) return createEmptyStack();

  const minPackedX = Math.min(...placements.map((placement) => placement.packedX));
  const maxPackedX = Math.max(...placements.map((placement) => placement.packedX));
  const minPackedY = Math.min(...placements.map((placement) => placement.packedY));
  const maxPackedY = Math.max(...placements.map((placement) => placement.packedY));
  const origin = { x: -minPackedX, y: -minPackedY };
  const width = maxPackedX - minPackedX + 1;
  const height = maxPackedY - minPackedY + 1;
  const data = new Uint32Array(width * height * 8);

  for (const placement of placements) {
    const textureX = placement.packedX + origin.x;
    const textureY = placement.packedY + origin.y;
    const index = placement.slice * width * height + textureY * width + textureX;
    data[index] = placement.word;
  }

  return {
    data,
    width,
    height,
    slices: 8,
    origin,
  };
}

export function createSurfaceCellGrid(map: TerrainMap, biomeIndex = 0): SurfaceCellGrid {
  if (map.renderorder !== "right-down") {
    throw new Error(`Surface cell grid requires Tiled renderorder "right-down", received "${map.renderorder}".`);
  }

  const data = new Uint32Array(map.width * map.height);
  const tileset = map.tilesets[0];
  const firstgid = tileset === undefined ? 1 : tileset.firstgid;

  for (const layer of getOrderedLayers(map)) {
    const level = getLevel(layer);

    for (let tileY = 0; tileY < layer.height; tileY++) {
      for (let tileX = 0; tileX < layer.width; tileX++) {
        const gid = layer.data[tileY * layer.width + tileX];
        if (gid === 0 || gid === undefined) continue;
        const tileId = gid - firstgid;
        const shapeReference = tileId + 1;
        data[tileY * map.width + tileX] = encodePackedTerrainWord(shapeReference, biomeIndex, level);
      }
    }
  }

  return {
    data,
    width: map.width,
    height: map.height,
  };
}

function getStackWord(stack: PackedTerrainStack, textureX: number, textureY: number, slice: number): PackedTerrainWord {
  if (slice < 0 || slice >= stack.slices) return 0;
  if (textureX < 0 || textureY < 0 || textureX >= stack.width || textureY >= stack.height) return 0;
  const word = stack.data[slice * stack.width * stack.height + textureY * stack.width + textureX];
  return word === undefined ? 0 : word;
}

function sampleAtlasPixel(
  atlas: ResolveColorAtlas,
  tileset: TerrainTileset,
  tileId: number,
  biomeIndex: number,
  localX: number,
  localY: number,
): [number, number, number, number] {
  if (biomeIndex < 0 || biomeIndex >= atlas.depth) return [0, 0, 0, 0];
  if (localX < 0 || localY < 0 || localX >= tileset.tilewidth || localY >= tileset.tileheight) return [0, 0, 0, 0];
  const column = tileId % tileset.columns;
  const row = Math.floor(tileId / tileset.columns);
  const atlasX = tileset.margin + column * (tileset.tilewidth + tileset.spacing) + localX;
  const atlasY = tileset.margin + row * (tileset.tileheight + tileset.spacing) + localY;
  if (atlasX < 0 || atlasY < 0 || atlasX >= atlas.width || atlasY >= atlas.height) return [0, 0, 0, 0];

  const layerStride = atlas.width * atlas.height * 4;
  const index = biomeIndex * layerStride + (atlasY * atlas.width + atlasX) * 4;
  const red = atlas.data[index];
  const green = atlas.data[index + 1];
  const blue = atlas.data[index + 2];
  const alpha = atlas.data[index + 3];

  return [
    red === undefined ? 0 : red,
    green === undefined ? 0 : green,
    blue === undefined ? 0 : blue,
    alpha === undefined ? 0 : alpha,
  ];
}

function getCandidateKey(stack: PackedTerrainStack, textureX: number, textureY: number, slice: number): number {
  return slice * stack.width * stack.height + textureY * stack.width + textureX;
}

function getLocalCoordinates(
  layout: LayoutContract,
  candidate: PainterCandidate,
  screenX: number,
  screenY: number,
): Point2 {
  const frameTop = candidate.s * layout.halfTileHeight - layout.halfTileHeight - candidate.slice * layout.elevationStep;

  return {
    x: Math.floor(screenX - candidate.d * layout.halfTileWidth),
    y: Math.floor(screenY - frameTop),
  };
}

function getCandidateOrder(candidate: PainterCandidate, stack: PackedTerrainStack): CandidateOrder {
  const word = getStackWord(stack, candidate.textureX, candidate.textureY, candidate.slice);
  const shapeRef = decodeShapeReference(word);

  if (shapeRef === 0) {
    return {
      shapeRef,
      baseHeightLevel: -1,
      mapX: candidate.packedX,
      mapY: candidate.packedY,
    };
  }

  const baseHeightLevel = decodeBaseHeightLevel(word);
  const octave = Math.floor(baseHeightLevel / 8);

  return {
    shapeRef,
    baseHeightLevel,
    mapX: candidate.packedX + 2 * octave,
    mapY: candidate.packedY + 2 * octave,
  };
}

function compareCandidateOrder(left: PainterCandidate, right: PainterCandidate, stack: PackedTerrainStack): number {
  const leftOrder = getCandidateOrder(left, stack);
  const rightOrder = getCandidateOrder(right, stack);

  if (leftOrder.shapeRef === 0 && rightOrder.shapeRef !== 0) {
    return 1;
  }
  if (leftOrder.shapeRef !== 0 && rightOrder.shapeRef === 0) {
    return -1;
  }
  if (leftOrder.baseHeightLevel !== rightOrder.baseHeightLevel) {
    return rightOrder.baseHeightLevel - leftOrder.baseHeightLevel;
  }
  if (leftOrder.mapY !== rightOrder.mapY) {
    return rightOrder.mapY - leftOrder.mapY;
  }
  if (leftOrder.mapX !== rightOrder.mapX) {
    return rightOrder.mapX - leftOrder.mapX;
  }
  return right.key - left.key;
}

function enumerateCandidateSlots(
  screenX: number,
  screenY: number,
  stack: PackedTerrainStack,
  layout: LayoutContract,
): PainterCandidate[] {
  const stripeRight = Math.floor(screenX / layout.halfTileWidth);
  const candidates: PainterCandidate[] = [];

  for (let stripeIndex = 0; stripeIndex < 2; stripeIndex++) {
    const d = stripeRight + stripeIndex - 1;
    for (let slice = 0; slice < stack.slices; slice++) {
      const baseS = Math.floor((screenY + layout.halfTileHeight + layout.elevationStep * slice) / layout.halfTileHeight);
      for (let delta = 0; delta < 3; delta++) {
        const s = baseS - delta;
        if (((s - d) & 1) !== 0) continue;

        const packedX = (s + d) / 2;
        const packedY = (s - d) / 2;
        const textureX = packedX + stack.origin.x;
        const textureY = packedY + stack.origin.y;

        if (textureX < 0 || textureY < 0 || textureX >= stack.width || textureY >= stack.height) continue;

        candidates.push({
          ordinal: -1,
          packedX,
          packedY,
          textureX,
          textureY,
          slice,
          d,
          s,
          key: getCandidateKey(stack, textureX, textureY, slice),
          screen: getPackedScreen(layout, packedX, packedY, slice),
        });
      }
    }
  }

  candidates.sort((left, right) => compareCandidateOrder(left, right, stack));

  return candidates.map((candidate, ordinal) => ({
    ...candidate,
    ordinal,
  }));
}

export type PackedTerrainCodec = {
  stack: PackedTerrainStack;
  getCandidateByOrdinal: (screenX: number, screenY: number, ordinal: number) => PainterCandidate | null;
  resolveVisibleTile: (atlas: ResolveColorAtlas, screenX: number, screenY: number) => ResolveHit | null;
  traceVisibleTile: (atlas: ResolveColorAtlas, screenX: number, screenY: number) => ResolveTrace;
  enumerateCandidates: (screenX: number, screenY: number) => PainterCandidate[];
  getPackedScreen: (packedX: number, packedY: number, slice: number) => Point2;
};

export function createPackedTerrainCodec(
  map: TerrainMap,
  tileset: TerrainTileset,
  elevationStep: number,
  biomeIndex = 0,
): PackedTerrainCodec {
  const layout = getLayoutContract(map, tileset, elevationStep);
  const stack = createPackedTerrainStack(map, tileset, elevationStep, biomeIndex);

  const enumerateCandidates = (screenX: number, screenY: number) => enumerateCandidateSlots(screenX, screenY, stack, layout);
  const traceVisibleTile = (atlas: ResolveColorAtlas, screenX: number, screenY: number): ResolveTrace => {
    let winner: ResolveHit | null = null;
    const candidates: ResolveTraceCandidate[] = [];

    for (const candidate of enumerateCandidates(screenX, screenY)) {
      const word = getStackWord(stack, candidate.textureX, candidate.textureY, candidate.slice);
      const shapeReference = decodeShapeReference(word);
      const tileId = shapeReference === 0 ? null : shapeReference - 1;
      const local = getLocalCoordinates(layout, candidate, screenX, screenY);
      const resolvedBiomeIndex = decodeBiomeIndex(word);
      const baseHeightLevel = shapeReference === 0 ? -1 : decodeBaseHeightLevel(word);
      const octave = baseHeightLevel < 0 ? 0 : Math.floor(baseHeightLevel / 8);
      const mapX = candidate.packedX + 2 * octave;
      const mapY = candidate.packedY + 2 * octave;
      const rgba: [number, number, number, number] =
        tileId === null ? [0, 0, 0, 0] : sampleAtlasPixel(atlas, tileset, tileId, resolvedBiomeIndex, local.x, local.y);
      const sampledAlpha = rgba[3];

      candidates.push({
        ...candidate,
        word,
        shapeRef: shapeReference,
        tileId,
        biomeIndex: resolvedBiomeIndex,
        baseHeightLevel,
        mapX,
        mapY,
        localX: local.x,
        localY: local.y,
        rgba,
        sampledAlpha,
      });

      if (winner !== null || shapeReference === 0 || sampledAlpha === 0 || tileId === null) continue;

      winner = {
        word,
        shapeRef: shapeReference,
        tileId,
        biomeIndex: resolvedBiomeIndex,
        baseHeightLevel,
        mapX,
        mapY,
        packedX: candidate.packedX,
        packedY: candidate.packedY,
        textureX: candidate.textureX,
        textureY: candidate.textureY,
        slice: candidate.slice,
        key: candidate.key,
        screen: candidate.screen,
        localX: local.x,
        localY: local.y,
        rgba,
      };
    }

    return { winner, candidates };
  };

  const resolveVisibleTile = (atlas: ResolveColorAtlas, screenX: number, screenY: number): ResolveHit | null => {
    for (const candidate of enumerateCandidates(screenX, screenY)) {
      const word = getStackWord(stack, candidate.textureX, candidate.textureY, candidate.slice);
      const shapeReference = decodeShapeReference(word);
      if (shapeReference === 0) continue;

      const tileId = shapeReference - 1;
      const local = getLocalCoordinates(layout, candidate, screenX, screenY);
      const resolvedBiomeIndex = decodeBiomeIndex(word);
      const rgba = sampleAtlasPixel(atlas, tileset, tileId, resolvedBiomeIndex, local.x, local.y);
      if (rgba[3] === 0) continue;

      const baseHeightLevel = decodeBaseHeightLevel(word);
      const octave = Math.floor(baseHeightLevel / 8);

      return {
        word,
        shapeRef: shapeReference,
        tileId,
        biomeIndex: resolvedBiomeIndex,
        baseHeightLevel,
        mapX: candidate.packedX + 2 * octave,
        mapY: candidate.packedY + 2 * octave,
        packedX: candidate.packedX,
        packedY: candidate.packedY,
        textureX: candidate.textureX,
        textureY: candidate.textureY,
        slice: candidate.slice,
        key: candidate.key,
        screen: candidate.screen,
        localX: local.x,
        localY: local.y,
        rgba,
      };
    }

    return null;
  };

  return {
    stack,
    getPackedScreen: (packedX: number, packedY: number, slice: number) => getPackedScreen(layout, packedX, packedY, slice),
    enumerateCandidates,
    traceVisibleTile,
    getCandidateByOrdinal: (screenX: number, screenY: number, ordinal: number) => {
      const candidate = enumerateCandidates(screenX, screenY)[ordinal];
      return candidate === undefined ? null : candidate;
    },
    resolveVisibleTile,
  };
}
