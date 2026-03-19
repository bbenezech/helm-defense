import type { TerrainMap, TerrainTileset } from "./assets.ts";
import type { Point2 } from "./projection.ts";

export type PackedTerrainWord = number;

export type PackedTerrainStack = {
  data: Uint32Array<ArrayBuffer>;
  width: number;
  height: number;
  slices: 8;
  origin: Point2;
};

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
  painterRank: number;
  packedX: number;
  packedY: number;
  textureX: number;
  textureY: number;
  slice: number;
  key: number;
  screen: Point2;
  rgba: [number, number, number, number];
};

type ResolveColorAtlas = {
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

const SHAPE_REF_MASK = 0b1_1111;
const BIOME_INDEX_SHIFT = 5;
const BIOME_INDEX_MASK = 0xff;
const PAINTER_RANK_SHIFT = 13;
const PAINTER_RANK_MASK = 524_287;

function getLevel(layer: TerrainMap["layers"][number]): number {
  for (const property of layer.properties) {
    if (property.name === "level" && typeof property.value === "number") return property.value;
  }

  return 0;
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
  painterRank = 0,
): PackedTerrainWord {
  return (painterRank << PAINTER_RANK_SHIFT) | (biomeIndex << BIOME_INDEX_SHIFT) | (shapeReference & SHAPE_REF_MASK);
}

export function decodeShapeReference(word: PackedTerrainWord): number {
  return word & SHAPE_REF_MASK;
}

export function decodeBiomeIndex(word: PackedTerrainWord): number {
  return (word >> BIOME_INDEX_SHIFT) & BIOME_INDEX_MASK;
}

export function decodePainterRank(word: PackedTerrainWord): number {
  return (word >> PAINTER_RANK_SHIFT) & PAINTER_RANK_MASK;
}

function getPackedScreen(layout: LayoutContract, packedX: number, packedY: number, slice: number): Point2 {
  return {
    x: (packedX - packedY) * layout.halfTileWidth + layout.halfTileWidth,
    y: (packedX + packedY) * layout.halfTileHeight + layout.halfTileHeight - layout.elevationStep * slice,
  };
}

type PackedPlacement = {
  packedX: number;
  packedY: number;
  slice: number;
  word: PackedTerrainWord;
};

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
  let painterRank = 0;

  for (const layer of map.layers) {
    const level = getLevel(layer);
    const octave = Math.floor(level / 8);
    const slice = level % 8;

    for (let tileY = 0; tileY < layer.height; tileY++) {
      for (let tileX = 0; tileX < layer.width; tileX++) {
        const gid = layer.data[tileY * layer.width + tileX];
        if (gid === 0 || gid === undefined) continue;
        const tileId = gid - firstgid;
        const shapeReference = tileId + 1;
        if (painterRank > PAINTER_RANK_MASK) {
          throw new Error(`Packed terrain painter rank overflow: ${painterRank} exceeds ${PAINTER_RANK_MASK}.`);
        }
        placements.push({
          packedX: tileX - 2 * octave,
          packedY: tileY - 2 * octave,
          slice,
          word: encodePackedTerrainWord(shapeReference, biomeIndex, painterRank),
        });
        painterRank++;
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

  return [red === undefined ? 0 : red, green === undefined ? 0 : green, blue === undefined ? 0 : blue, alpha === undefined ? 0 : alpha];
}

function getCandidateKey(stack: PackedTerrainStack, textureX: number, textureY: number, slice: number): number {
  return slice * stack.width * stack.height + textureY * stack.width + textureX;
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
      const baseS = Math.floor((screenY + layout.frameTopOffset + layout.elevationStep * slice) / layout.halfTileHeight);
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

  candidates.sort((left, right) => right.key - left.key);

  return candidates.map((candidate, ordinal) => ({
    ...candidate,
    ordinal,
  }));
}

export type PackedTerrainCodec = {
  stack: PackedTerrainStack;
  getCandidateByOrdinal: (screenX: number, screenY: number, ordinal: number) => PainterCandidate | null;
  resolveVisibleTile: (atlas: ResolveColorAtlas, screenX: number, screenY: number) => ResolveHit | null;
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

  return {
    stack,
    getPackedScreen: (packedX: number, packedY: number, slice: number) => getPackedScreen(layout, packedX, packedY, slice),
    enumerateCandidates,
    getCandidateByOrdinal: (screenX: number, screenY: number, ordinal: number) => {
      const candidate = enumerateCandidates(screenX, screenY)[ordinal];
      return candidate === undefined ? null : candidate;
    },
    resolveVisibleTile: (atlas, screenX, screenY) => {
      let bestHit: ResolveHit | null = null;

      for (const candidate of enumerateCandidates(screenX, screenY)) {
        const word = getStackWord(stack, candidate.textureX, candidate.textureY, candidate.slice);
        const shapeReference = decodeShapeReference(word);
        if (shapeReference === 0) continue;

        const biomeIndex = decodeBiomeIndex(word);
        const painterRank = decodePainterRank(word);
        const tileId = shapeReference - 1;
        const localX = Math.floor(screenX - candidate.d * layout.halfTileWidth);
        const localY = Math.floor(
          screenY - (candidate.s * layout.halfTileHeight - layout.frameTopOffset - candidate.slice * layout.elevationStep),
        );
        const rgba = sampleAtlasPixel(atlas, tileset, tileId, biomeIndex, localX, localY);
        if (rgba[3] === 0) continue;

        if (bestHit !== null && painterRank <= bestHit.painterRank) continue;

        bestHit = {
          word,
          shapeRef: shapeReference,
          tileId,
          biomeIndex,
          painterRank,
          packedX: candidate.packedX,
          packedY: candidate.packedY,
          textureX: candidate.textureX,
          textureY: candidate.textureY,
          slice: candidate.slice,
          key: candidate.key,
          screen: candidate.screen,
          rgba,
        };
      }

      return bestHit;
    },
  };
}
