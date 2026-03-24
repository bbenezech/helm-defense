import { TERRAIN_TILE_INDEX, TILE_ELEVATION_RATIO } from "../src/game/lib/terrain.ts";
import { barycentricWeights, type Vector3 } from "../src/game/lib/vector.ts";
import { decodeBaseHeightLevel, decodeShapeReference } from "./codec.ts";
import type { SurfaceCellGrid } from "./chunks.ts";
import type { Point2 } from "./projection.ts";
import type { TerrainTileset, TerrainTilesetTile } from "./assets.ts";

type SurfaceShape = {
  north: number;
  east: number;
  south: number;
  west: number;
  center: number;
  terrainNormalNE: Vector3;
  terrainNormalNW: Vector3;
  terrainNormalSE: Vector3;
  terrainNormalSW: Vector3;
  worldNormalNE: Vector3;
  worldNormalNW: Vector3;
  worldNormalSE: Vector3;
  worldNormalSW: Vector3;
};

export type SurfaceShapeLookup = SurfaceShape[];

export type SurfaceSample = {
  localHeightLevel: number;
  worldHeight: number;
  terrainNormal: Vector3;
  worldNormal: Vector3;
};

export type SurfaceWinner = {
  shapeReference: number;
  baseHeightLevel: number;
  mapX: number;
  mapY: number;
};

export type SurfaceLightingNormalResult =
  | { kind: "exact"; worldNormal: Vector3 }
  | { kind: "smoothed"; worldNormal: Vector3 };

type SurfaceHeightSample = { kind: "missing" } | { kind: "sample"; worldHeight: number };

type SurfaceVertex = {
  x: number;
  y: number;
  z: number;
};

const COS_45 = Math.SQRT1_2;
const SIN_45 = Math.SQRT1_2;
const EMPTY_NORMAL: Vector3 = [0, 0, 1];
export const SURFACE_NORMAL_FILTER_RADIUS_TILES = 1 / 16;
const EMPTY_SHAPE: SurfaceShape = {
  north: 0,
  east: 0,
  south: 0,
  west: 0,
  center: 0,
  terrainNormalNE: EMPTY_NORMAL,
  terrainNormalNW: EMPTY_NORMAL,
  terrainNormalSE: EMPTY_NORMAL,
  terrainNormalSW: EMPTY_NORMAL,
  worldNormalNE: EMPTY_NORMAL,
  worldNormalNW: EMPTY_NORMAL,
  worldNormalSE: EMPTY_NORMAL,
  worldNormalSW: EMPTY_NORMAL,
};

function getTileStringProperty(tile: TerrainTilesetTile, name: string): string {
  for (const property of tile.properties) {
    if (property.name === name && typeof property.value === "string") return property.value;
  }

  throw new Error(`Missing string tileset tile property "${name}" for tile ${tile.id}.`);
}

function getTileNumberProperty(tile: TerrainTilesetTile, name: string): number {
  for (const property of tile.properties) {
    if (property.name === name && typeof property.value === "number") return property.value;
  }

  throw new Error(`Missing numeric tileset tile property "${name}" for tile ${tile.id}.`);
}

export function rotateTerrainNormalToWorld(normal: Vector3): Vector3 {
  // Match the legacy packed-surface shader exactly.
  // GLSL mat3 constructors are column-major, so the historical rotation45 matrix
  // applied a -45 degree Z rotation when converting terrain-space normals to world-space.
  return [
    COS_45 * normal[0] + SIN_45 * normal[1],
    -SIN_45 * normal[0] + COS_45 * normal[1],
    normal[2],
  ];
}

function normalizeVector3(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);

  if (length === 0) {
    throw new Error("Surface lighting normal must not be degenerate.");
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function findSurfaceShape(tile: TerrainTilesetTile): SurfaceShape {
  const nesw = getTileStringProperty(tile, "NESW");
  const center = getTileNumberProperty(tile, "CENTER");

  for (const terrainTile of Object.values(TERRAIN_TILE_INDEX)) {
    if (terrainTile.NESW !== nesw || terrainTile.CENTER !== center) continue;

    return {
      north: terrainTile.N,
      east: terrainTile.E,
      south: terrainTile.S,
      west: terrainTile.W,
      center: terrainTile.CENTER,
      terrainNormalNE: terrainTile.NORMAL_NE,
      terrainNormalNW: terrainTile.NORMAL_NW,
      terrainNormalSE: terrainTile.NORMAL_SE,
      terrainNormalSW: terrainTile.NORMAL_SW,
      worldNormalNE: rotateTerrainNormalToWorld(terrainTile.NORMAL_NE),
      worldNormalNW: rotateTerrainNormalToWorld(terrainTile.NORMAL_NW),
      worldNormalSE: rotateTerrainNormalToWorld(terrainTile.NORMAL_SE),
      worldNormalSW: rotateTerrainNormalToWorld(terrainTile.NORMAL_SW),
    };
  }

  throw new Error(`Could not match tileset tile ${tile.id} to a canonical terrain pose (${nesw}, center=${center}).`);
}

function getTilesById(tileset: TerrainTileset): Map<number, TerrainTilesetTile> {
  const tilesById = new Map<number, TerrainTilesetTile>();

  for (const tile of tileset.tiles) {
    if (tilesById.has(tile.id)) throw new Error(`Duplicate tileset tile id ${tile.id}.`);
    tilesById.set(tile.id, tile);
  }

  return tilesById;
}

export function createSurfaceShapeLookup(tileset: TerrainTileset): SurfaceShapeLookup {
  const tilesById = getTilesById(tileset);
  const lookup = Array.from({ length: tileset.tilecount + 1 }, () => EMPTY_SHAPE);

  for (let tileId = 0; tileId < tileset.tilecount; tileId++) {
    const tile = tilesById.get(tileId);
    if (tile === undefined) throw new Error(`Missing tileset tile ${tileId}.`);
    lookup[tileId + 1] = findSurfaceShape(tile);
  }

  return lookup;
}

export function getWorldHeightFromLevel(level: number): number {
  return level * TILE_ELEVATION_RATIO;
}

export function getSurfaceHeightImpactOnScreenY(mapTileHeight: number): number {
  if (mapTileHeight <= 0) {
    throw new Error(`Terrain map tile height must be greater than zero, received ${mapTileHeight}.`);
  }

  return (5 / 4) * mapTileHeight;
}

export function evaluateSurfaceSample(
  lookup: SurfaceShapeLookup,
  shapeReference: number,
  baseHeightLevel: number,
  localX: number,
  localY: number,
): SurfaceSample {
  const shape = lookup[shapeReference];
  if (shape === undefined) {
    throw new Error(`Missing analytic surface lookup entry for shape reference ${shapeReference}.`);
  }
  if (localX < 0 || localX > 1 || localY < 0 || localY > 1) {
    throw new Error(`Analytic surface local coordinates must stay within [0, 1], received (${localX}, ${localY}).`);
  }

  const north: SurfaceVertex = { x: 0, y: 0, z: shape.north };
  const east: SurfaceVertex = { x: 1, y: 0, z: shape.east };
  const south: SurfaceVertex = { x: 1, y: 1, z: shape.south };
  const west: SurfaceVertex = { x: 0, y: 1, z: shape.west };
  const center: SurfaceVertex = { x: 0.5, y: 0.5, z: shape.center };

  let vertexA = north;
  let vertexB = east;
  let vertexC = center;
  let terrainNormal = shape.terrainNormalNE;
  let worldNormal = shape.worldNormalNE;

  if (localY < 1 - localX) {
    if (localY < localX) {
      vertexA = north;
      vertexB = east;
      vertexC = center;
      terrainNormal = shape.terrainNormalNE;
      worldNormal = shape.worldNormalNE;
    } else {
      vertexA = west;
      vertexB = north;
      vertexC = center;
      terrainNormal = shape.terrainNormalNW;
      worldNormal = shape.worldNormalNW;
    }
  } else if (localY < localX) {
    vertexA = east;
    vertexB = south;
    vertexC = center;
    terrainNormal = shape.terrainNormalSE;
    worldNormal = shape.worldNormalSE;
  } else {
    vertexA = south;
    vertexB = west;
    vertexC = center;
    terrainNormal = shape.terrainNormalSW;
    worldNormal = shape.worldNormalSW;
  }

  const weights = barycentricWeights(localX, localY, vertexA, vertexB, vertexC, [0, 0, 0]);
  const localHeightLevel = weights[0] * vertexA.z + weights[1] * vertexB.z + weights[2] * vertexC.z + baseHeightLevel;

  return {
    localHeightLevel,
    worldHeight: getWorldHeightFromLevel(localHeightLevel),
    terrainNormal,
    worldNormal,
  };
}

function getSurfaceCellWord(surfaceCells: SurfaceCellGrid, mapX: number, mapY: number): number {
  if (mapX < 0 || mapY < 0 || mapX >= surfaceCells.width || mapY >= surfaceCells.height) {
    return 0;
  }

  const word = surfaceCells.data[mapY * surfaceCells.width + mapX];
  return word === undefined ? 0 : word;
}

function sampleSurfaceCellWorldHeight(
  lookup: SurfaceShapeLookup,
  surfaceCells: SurfaceCellGrid,
  tileCoord: Point2,
): SurfaceHeightSample {
  const mapX = Math.floor(tileCoord.x);
  const mapY = Math.floor(tileCoord.y);
  const word = getSurfaceCellWord(surfaceCells, mapX, mapY);
  const shapeReference = decodeShapeReference(word);

  if (shapeReference === 0) {
    return { kind: "missing" };
  }

  return {
    kind: "sample",
    worldHeight: evaluateSurfaceSample(
      lookup,
      shapeReference,
      decodeBaseHeightLevel(word),
      tileCoord.x - mapX,
      tileCoord.y - mapY,
    ).worldHeight,
  };
}

export function deriveAdaptiveHeightGradient(
  centerHeight: number,
  negativeHeight: number | null,
  positiveHeight: number | null,
  radiusTiles: number,
): number | null {
  if (radiusTiles <= 0) {
    throw new Error(`Surface normal filter radius must be greater than zero, received ${radiusTiles}.`);
  }

  if (negativeHeight !== null && positiveHeight !== null) {
    return (positiveHeight - negativeHeight) / (2 * radiusTiles);
  }
  if (positiveHeight !== null) {
    return (positiveHeight - centerHeight) / radiusTiles;
  }
  if (negativeHeight !== null) {
    return (centerHeight - negativeHeight) / radiusTiles;
  }

  return null;
}

export function deriveLightingNormalFromHeightGradients(dHeightDx: number, dHeightDy: number): Vector3 {
  // Tile-local Y grows from north to west/south-west in the terrain contract,
  // so its slope sign is inverted relative to the canonical terrain-normal basis.
  return rotateTerrainNormalToWorld(normalizeVector3([-dHeightDx, dHeightDy, 1]));
}

export function evaluateSurfaceLightingNormalFromCells(
  lookup: SurfaceShapeLookup,
  surfaceCells: SurfaceCellGrid,
  winner: SurfaceWinner,
  tileCoord: Point2,
  radiusTiles: number,
): SurfaceLightingNormalResult {
  const exactSample = evaluateSurfaceSample(
    lookup,
    winner.shapeReference,
    winner.baseHeightLevel,
    tileCoord.x - winner.mapX,
    tileCoord.y - winner.mapY,
  );
  const topSurfaceWord = getSurfaceCellWord(surfaceCells, winner.mapX, winner.mapY);

  if (decodeShapeReference(topSurfaceWord) !== winner.shapeReference) {
    return { kind: "exact", worldNormal: exactSample.worldNormal };
  }
  if (decodeBaseHeightLevel(topSurfaceWord) !== winner.baseHeightLevel) {
    return { kind: "exact", worldNormal: exactSample.worldNormal };
  }

  const negativeXSample = sampleSurfaceCellWorldHeight(lookup, surfaceCells, {
    x: tileCoord.x - radiusTiles,
    y: tileCoord.y,
  });
  const positiveXSample = sampleSurfaceCellWorldHeight(lookup, surfaceCells, {
    x: tileCoord.x + radiusTiles,
    y: tileCoord.y,
  });
  const negativeYSample = sampleSurfaceCellWorldHeight(lookup, surfaceCells, {
    x: tileCoord.x,
    y: tileCoord.y - radiusTiles,
  });
  const positiveYSample = sampleSurfaceCellWorldHeight(lookup, surfaceCells, {
    x: tileCoord.x,
    y: tileCoord.y + radiusTiles,
  });
  const dHeightDx = deriveAdaptiveHeightGradient(
    exactSample.worldHeight,
    negativeXSample.kind === "sample" ? negativeXSample.worldHeight : null,
    positiveXSample.kind === "sample" ? positiveXSample.worldHeight : null,
    radiusTiles,
  );
  const dHeightDy = deriveAdaptiveHeightGradient(
    exactSample.worldHeight,
    negativeYSample.kind === "sample" ? negativeYSample.worldHeight : null,
    positiveYSample.kind === "sample" ? positiveYSample.worldHeight : null,
    radiusTiles,
  );

  if (dHeightDx === null || dHeightDy === null) {
    return { kind: "exact", worldNormal: exactSample.worldNormal };
  }

  return {
    kind: "smoothed",
    worldNormal: deriveLightingNormalFromHeightGradients(dHeightDx, dHeightDy),
  };
}

function formatWgslFloat(value: number): string {
  return value.toFixed(8);
}

function formatWgslVector3(value: Vector3): string {
  return `vec3<f32>(${formatWgslFloat(value[0])}, ${formatWgslFloat(value[1])}, ${formatWgslFloat(value[2])})`;
}

export function createSurfaceShaderTables(tileset: TerrainTileset): string {
  const lookup = createSurfaceShapeLookup(tileset);

  return [
    `const SURFACE_NORTH = array<f32, ${lookup.length}>(${lookup.map((shape) => formatWgslFloat(shape.north)).join(", ")});`,
    `const SURFACE_EAST = array<f32, ${lookup.length}>(${lookup.map((shape) => formatWgslFloat(shape.east)).join(", ")});`,
    `const SURFACE_SOUTH = array<f32, ${lookup.length}>(${lookup.map((shape) => formatWgslFloat(shape.south)).join(", ")});`,
    `const SURFACE_WEST = array<f32, ${lookup.length}>(${lookup.map((shape) => formatWgslFloat(shape.west)).join(", ")});`,
    `const SURFACE_CENTER = array<f32, ${lookup.length}>(${lookup.map((shape) => formatWgslFloat(shape.center)).join(", ")});`,
    `const SURFACE_WORLD_NORMAL_NE = array<vec3<f32>, ${lookup.length}>(${lookup
      .map((shape) => formatWgslVector3(shape.worldNormalNE))
      .join(", ")});`,
    `const SURFACE_WORLD_NORMAL_NW = array<vec3<f32>, ${lookup.length}>(${lookup
      .map((shape) => formatWgslVector3(shape.worldNormalNW))
      .join(", ")});`,
    `const SURFACE_WORLD_NORMAL_SE = array<vec3<f32>, ${lookup.length}>(${lookup
      .map((shape) => formatWgslVector3(shape.worldNormalSE))
      .join(", ")});`,
    `const SURFACE_WORLD_NORMAL_SW = array<vec3<f32>, ${lookup.length}>(${lookup
      .map((shape) => formatWgslVector3(shape.worldNormalSW))
      .join(", ")});`,
    `const SURFACE_WORLD_HEIGHT_SCALE = ${formatWgslFloat(TILE_ELEVATION_RATIO)};`,
  ].join("\n");
}
