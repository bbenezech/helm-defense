import { BLENDER_RENDER_CONTRACT, ORDERED_SLOPES } from "./blender.ts";
import { terrainSceneSpec } from "./terrain-scene-spec.ts";
import { EXAMPLE_TILE_GID_LAYERS, STRESS_HEIGHTMAP_FIXTURES, type TileGidLayers } from "./terrain-fixtures.ts";
import { generateTilableHeightmap } from "../../src/game/lib/heightmap.ts";
import { tileableHeightmapToTileData } from "../../src/game/lib/terrain.ts";
import { terrainToLayers } from "../../src/game/lib/tilemap.ts";
import { getTileset } from "../../src/game/lib/tileset.ts";
import type { BinaryFrame } from "./terrain-ownership.ts";

export type CoverageTilesetProperty = {
  name: string;
  type: string;
  value: number | string;
};

export type CoverageTilesetTile = {
  id: number;
  probability: number;
  properties: readonly CoverageTilesetProperty[];
};

export type CoverageTileset = {
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
  tiles: readonly CoverageTilesetTile[];
  version: string;
  tiledversion: string;
  properties: readonly CoverageTilesetProperty[];
};

export type CoverageLayer = {
  rows: number[][];
  offsetY: number;
};

export type Placement = {
  placementId: number;
  tileIndex: number;
  gid: number;
  layerIndex: number;
  mapX: number;
  mapY: number;
  left: number;
  top: number;
  label: string;
};

export type CanvasBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type CoverageImage = {
  width: number;
  height: number;
  counts: Uint16Array<ArrayBuffer>;
  ownerIds: Int32Array<ArrayBuffer>;
};

export type CoverageCounts = {
  oracleOverlap: number;
  uncovered: number;
  actualOverlap: number;
  stray: number;
  wrongOwner: number;
};

export type CoverageFixture = {
  name: string;
  layers: CoverageLayer[];
};

export type CoverageFixtureResult = {
  fixture: CoverageFixture;
  width: number;
  height: number;
  counts: CoverageCounts;
  oracleCoverage: CoverageImage;
  actualCoverage: CoverageImage;
};

type TerrainMapLikeLayer = {
  width: number;
  height: number;
  data: number[];
  offsety: number;
};

export function getElevationYOffsetPx(tileset: CoverageTileset) {
  for (const property of tileset.properties) {
    if (property.name === "elevationYOffsetPx" && typeof property.value === "number") return property.value;
  }

  throw new Error(`Tileset "${tileset.name}" is missing elevationYOffsetPx`);
}

export function getCanonicalTileset(actualTileset: CoverageTileset) {
  const elevationYOffsetPx = getElevationYOffsetPx(actualTileset);
  return getTileset({
    name: "coverage-proof",
    imageFilename: actualTileset.image,
    tilewidth: actualTileset.tilewidth,
    tileheight: actualTileset.tileheight,
    elevationYOffsetPx,
    terrainTileNames: ORDERED_SLOPES,
    tileMargin: actualTileset.spacing / 2,
    tilesetMargin: actualTileset.margin - actualTileset.spacing / 2,
  });
}

export function assertSceneAndTilesetContracts(actualTileset: CoverageTileset, canonicalTileset: CoverageTileset) {
  if (terrainSceneSpec.order.length !== ORDERED_SLOPES.length)
    throw new Error(
      `Scene spec order mismatch: expected ${ORDERED_SLOPES.length}, got ${terrainSceneSpec.order.length}`,
    );
  if (terrainSceneSpec.poses.length !== ORDERED_SLOPES.length)
    throw new Error(
      `Scene spec pose mismatch: expected ${ORDERED_SLOPES.length}, got ${terrainSceneSpec.poses.length}`,
    );
  if (actualTileset.tilecount !== ORDERED_SLOPES.length)
    throw new Error(`Tileset tilecount mismatch: expected ${ORDERED_SLOPES.length}, got ${actualTileset.tilecount}`);
  if (actualTileset.tilewidth !== BLENDER_RENDER_CONTRACT.resolution.width)
    throw new Error(
      `Tileset tilewidth mismatch: expected ${BLENDER_RENDER_CONTRACT.resolution.width}, got ${actualTileset.tilewidth}`,
    );
  if (actualTileset.tileheight !== BLENDER_RENDER_CONTRACT.resolution.height)
    throw new Error(
      `Tileset tileheight mismatch: expected ${BLENDER_RENDER_CONTRACT.resolution.height}, got ${actualTileset.tileheight}`,
    );
  if (getElevationYOffsetPx(actualTileset) !== (actualTileset.tileheight - actualTileset.tilewidth / 2) / 2)
    throw new Error(`Tileset elevationYOffsetPx does not match the native 128x96 -> 16px contract.`);
  if (actualTileset.columns !== canonicalTileset.columns || actualTileset.rows !== canonicalTileset.rows)
    throw new Error(
      `Tileset atlas shape mismatch: expected ${canonicalTileset.columns}x${canonicalTileset.rows}, got ${actualTileset.columns}x${actualTileset.rows}`,
    );

  const actualNESW: string[] = [];
  const canonicalNESW: string[] = [];
  for (const tile of actualTileset.tiles) {
    let tileNESW: string | null = null;
    for (const property of tile.properties) {
      if (property.name === "NESW" && typeof property.value === "string") {
        tileNESW = property.value;
        break;
      }
    }
    if (tileNESW === null) throw new Error(`Actual tileset tile ${tile.id} is missing its NESW property.`);
    actualNESW.push(tileNESW);
  }
  for (const tile of canonicalTileset.tiles) {
    let tileNESW: string | null = null;
    for (const property of tile.properties) {
      if (property.name === "NESW" && typeof property.value === "string") {
        tileNESW = property.value;
        break;
      }
    }
    if (tileNESW === null) throw new Error(`Canonical tileset tile ${tile.id} is missing its NESW property.`);
    canonicalNESW.push(tileNESW);
  }
  if (actualNESW.join(",") !== canonicalNESW.join(",")) throw new Error(`Tileset tile order does not match ORDERED_SLOPES`);
}

export function createCoverageRows(data: number[], width: number, height: number) {
  const rows: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const value = data[y * width + x];
      if (value === undefined) throw new Error(`Missing coverage row value at (${x}, ${y}).`);
      row.push(value);
    }
    rows.push(row);
  }

  return rows;
}

export function getCoverageLayersFromTileGidLayers(layers: TileGidLayers, elevationYOffsetPx: number): CoverageLayer[] {
  return layers.map((rows, layerIndex) => ({
    rows,
    offsetY: -(layerIndex * elevationYOffsetPx),
  }));
}

export function getCoverageLayersFromTerrainMapLayers(layers: TerrainMapLikeLayer[]): CoverageLayer[] {
  return layers.map((layer) => ({
    rows: createCoverageRows(layer.data, layer.width, layer.height),
    offsetY: layer.offsety,
  }));
}

export function getFixturePlacements(layers: CoverageLayer[], tileset: CoverageTileset) {
  const elevationYOffsetPx = getElevationYOffsetPx(tileset);
  const logicalTileHeight = tileset.tileheight - 2 * elevationYOffsetPx;
  const halfTileWidth = tileset.tilewidth / 2;
  const halfLogicalTileHeight = logicalTileHeight / 2;
  const imageTopOffset = tileset.tileheight - logicalTileHeight;

  const placements: Placement[] = [];
  let placementId = 0;

  for (const [layerIndex, layer] of layers.entries()) {
    for (const [mapY, row] of layer.rows.entries()) {
      for (const [mapX, gid] of row.entries()) {
        if (gid <= 0) continue;
        const tileIndex = gid - 1;
        if (tileIndex < 0 || tileIndex >= tileset.tilecount)
          throw new Error(`Invalid gid ${gid} at (${mapX}, ${mapY}, layer ${layerIndex})`);

        placements.push({
          placementId,
          tileIndex,
          gid,
          layerIndex,
          mapX,
          mapY,
          left: (mapX - mapY) * halfTileWidth,
          top: (mapX + mapY) * halfLogicalTileHeight - imageTopOffset + layer.offsetY,
          label: `${ORDERED_SLOPES[tileIndex]}@L${layerIndex}:${mapX},${mapY}`,
        });
        placementId++;
      }
    }
  }

  return placements;
}

export function getCanvasBounds(placements: Placement[], frameWidth: number, frameHeight: number): CanvasBounds {
  if (placements.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const placement of placements) {
    minX = Math.min(minX, placement.left);
    minY = Math.min(minY, placement.top);
    maxX = Math.max(maxX, placement.left + frameWidth);
    maxY = Math.max(maxY, placement.top + frameHeight);
  }

  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    width: Math.ceil(maxX - minX),
    height: Math.ceil(maxY - minY),
  };
}

export function composeCoverage(placements: Placement[], frames: BinaryFrame[], bounds: CanvasBounds): CoverageImage {
  const counts = new Uint16Array(bounds.width * bounds.height);
  const ownerIds = new Int32Array(bounds.width * bounds.height).fill(-1);

  for (const placement of placements) {
    const frame = frames[placement.tileIndex];
    if (frame === undefined) throw new Error(`Missing frame for tile index ${placement.tileIndex}`);
    const baseX = Math.round(placement.left - bounds.minX);
    const baseY = Math.round(placement.top - bounds.minY);

    for (let y = 0; y < frame.height; y++) {
      const canvasY = baseY + y;
      if (canvasY < 0 || canvasY >= bounds.height) continue;

      for (let x = 0; x < frame.width; x++) {
        if (frame.coverage[y * frame.width + x] === 0) continue;
        const canvasX = baseX + x;
        if (canvasX < 0 || canvasX >= bounds.width) continue;

        const index = canvasY * bounds.width + canvasX;
        counts[index]++;
        if (ownerIds[index] === -1) ownerIds[index] = placement.placementId;
      }
    }
  }

  return {
    width: bounds.width,
    height: bounds.height,
    counts,
    ownerIds,
  };
}

export function evaluateCoverageFixture(
  fixture: CoverageFixture,
  tileset: CoverageTileset,
  oracleFrames: BinaryFrame[],
  actualFrames: BinaryFrame[],
): CoverageFixtureResult {
  const placements = getFixturePlacements(fixture.layers, tileset);
  const bounds = getCanvasBounds(placements, tileset.tilewidth, tileset.tileheight);
  const oracleCoverage = composeCoverage(placements, oracleFrames, bounds);
  const actualCoverage = composeCoverage(placements, actualFrames, bounds);
  const counts: CoverageCounts = {
    oracleOverlap: 0,
    uncovered: 0,
    actualOverlap: 0,
    stray: 0,
    wrongOwner: 0,
  };

  for (let index = 0; index < oracleCoverage.counts.length; index++) {
    const oracleCount = oracleCoverage.counts[index];
    const actualCount = actualCoverage.counts[index];
    if (oracleCount > 1) counts.oracleOverlap++;
    if (oracleCount > 0 && actualCount === 0) counts.uncovered++;
    if (actualCount > 1) counts.actualOverlap++;
    if (oracleCount === 0 && actualCount > 0) counts.stray++;
    if (oracleCount === 1 && actualCount === 1 && oracleCoverage.ownerIds[index] !== actualCoverage.ownerIds[index])
      counts.wrongOwner++;
  }

  return {
    fixture,
    width: bounds.width,
    height: bounds.height,
    counts,
    oracleCoverage,
    actualCoverage,
  };
}

export function hasCoverageFailure(result: CoverageFixtureResult) {
  return Object.values(result.counts).some((count) => count > 0);
}

export function buildCoverageFixtures(canonicalTileset: CoverageTileset): CoverageFixture[] {
  const elevationYOffsetPx = getElevationYOffsetPx(canonicalTileset);
  const terrainTileset = getCanonicalTileset(canonicalTileset);
  const fixtures: CoverageFixture[] = [
    {
      name: "example",
      layers: getCoverageLayersFromTileGidLayers(EXAMPLE_TILE_GID_LAYERS, elevationYOffsetPx),
    },
  ];

  for (const stressFixture of STRESS_HEIGHTMAP_FIXTURES) {
    const heightmap = generateTilableHeightmap({
      tileWidth: stressFixture.tileWidth,
      tileHeight: stressFixture.tileHeight,
      maxValue: stressFixture.maxValue,
      seed: stressFixture.seed,
    });
    fixtures.push({
      name: stressFixture.name,
      layers: getCoverageLayersFromTileGidLayers(
        terrainToLayers(tileableHeightmapToTileData(heightmap), terrainTileset),
        elevationYOffsetPx,
      ),
    });
  }

  return fixtures;
}
