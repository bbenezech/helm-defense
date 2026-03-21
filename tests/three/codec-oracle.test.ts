import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  composeCoverage,
  getCanvasBounds,
  getCoverageLayersFromTileGidLayers,
  getElevationYOffsetPx,
  getFixturePlacements,
  type CoverageFixture,
  type CoverageTileset,
  type Placement,
} from "../../scripts/lib/terrain-coverage-proof.ts";
import { EXAMPLE_TILE_GID_LAYERS } from "../../scripts/lib/terrain-fixtures.ts";
import { rasterizeOwnershipFrames } from "../../scripts/lib/terrain-ownership.ts";
import { parseTerrainTileset } from "../../three/assets.ts";
import { createPackedTerrainCodec, type ResolveColorAtlas } from "../../three/codec.ts";

type ResolveTerrainMap = Parameters<typeof createPackedTerrainCodec>[0];
type ResolveTerrainTileset = Parameters<typeof createPackedTerrainCodec>[1];

type ResolveCounts = {
  uncovered: number;
  stray: number;
  wrongOwner: number;
};

type PlacementReport = Placement & {
  level: number;
  octave: number;
  slice: number;
  packedX: number;
  packedY: number;
};

function getTilesetJsonPath() {
  return path.resolve(import.meta.dirname, "../../public/Grass_23-512x512/tileset.json");
}

function loadNativeTileset(): ResolveTerrainTileset & CoverageTileset {
  const tilesetJsonPath = getTilesetJsonPath();
  const tilesetJson = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8"));
  const tileset = parseTerrainTileset(tilesetJson);

  return {
    type: tileset.type,
    name: tileset.name,
    image: tileset.image,
    tilewidth: tileset.tilewidth,
    tileheight: tileset.tileheight,
    tilecount: tileset.tilecount,
    rows: tileset.rows,
    columns: tileset.columns,
    spacing: tileset.spacing,
    margin: tileset.margin,
    imagewidth: tileset.imagewidth,
    imageheight: tileset.imageheight,
    tiles: tileset.tiles.map((tile) => ({
      id: tile.id,
      probability: tile.probability,
      properties: tile.properties.map((property) => ({
        name: property.name,
        type: property.type,
        value: property.value,
      })),
    })),
    version: tileset.version,
    tiledversion: tileset.tiledversion,
    properties: tileset.properties.map((property) => ({
      name: property.name,
      type: property.type,
      value: property.value,
    })),
  };
}

function getLayerLevel(offsetY: number, elevationYOffsetPx: number): number {
  const level = -offsetY / elevationYOffsetPx;
  if (!Number.isInteger(level) || level < 0) {
    throw new Error(`Invalid layer offset ${offsetY}; expected a non-positive multiple of ${elevationYOffsetPx}.`);
  }

  return level;
}

function flattenRows(rows: number[][]): number[] {
  const flat: number[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    for (const [columnIndex, gid] of row.entries()) {
      if (!Number.isInteger(gid) || gid < 0) {
        throw new Error(`Invalid gid ${gid} at row ${rowIndex}, column ${columnIndex}.`);
      }
      flat.push(gid);
    }
  }

  return flat;
}

function createFixtureMap(fixture: CoverageFixture, tileset: ResolveTerrainTileset): ResolveTerrainMap {
  const elevationYOffsetPx = getElevationYOffsetPx(tileset);
  const firstLayer = fixture.layers[0];
  if (firstLayer === undefined) throw new Error(`Fixture "${fixture.name}" does not contain any layers.`);
  const firstRow = firstLayer.rows[0];
  if (firstRow === undefined) throw new Error(`Fixture "${fixture.name}" first layer is empty.`);

  return {
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width: firstRow.length,
    height: firstLayer.rows.length,
    tilewidth: tileset.tilewidth,
    tileheight: tileset.tileheight - elevationYOffsetPx * 2,
    layers: fixture.layers.map((layer, layerIndex) => {
      const row = layer.rows[0];
      if (row === undefined) throw new Error(`Fixture "${fixture.name}" layer ${layerIndex} is empty.`);

      for (const [rowIndex, candidateRow] of layer.rows.entries()) {
        if (candidateRow.length !== row.length) {
          throw new Error(
            `Fixture "${fixture.name}" layer ${layerIndex} row ${rowIndex} width mismatch: expected ${row.length}, received ${candidateRow.length}.`,
          );
        }
      }

      const level = getLayerLevel(layer.offsetY, elevationYOffsetPx);
      return {
        id: layerIndex + 1,
        name: `level-${level}`,
        opacity: 1,
        type: "tilelayer",
        visible: true,
        x: 0,
        y: 0,
        offsetx: 0,
        offsety: layer.offsetY,
        width: row.length,
        height: layer.rows.length,
        data: flattenRows(layer.rows),
        properties: [{ name: "level", type: "int", value: level }],
      };
    }),
    tilesets: [{ firstgid: 1, ...tileset }],
  };
}

function createOracleAtlas(
  tileset: ResolveTerrainTileset,
  oracleFrames: ReturnType<typeof rasterizeOwnershipFrames>,
): ResolveColorAtlas {
  const data = new Uint8Array(tileset.imagewidth * tileset.imageheight * 4);

  for (let tileIndex = 0; tileIndex < tileset.tilecount; tileIndex++) {
    const frame = oracleFrames[tileIndex];
    if (frame === undefined) throw new Error(`Missing oracle frame ${tileIndex}.`);

    const column = tileIndex % tileset.columns;
    const row = Math.floor(tileIndex / tileset.columns);
    const tileLeft = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
    const tileTop = tileset.margin + row * (tileset.tileheight + tileset.spacing);

    for (let localY = 0; localY < frame.height; localY++) {
      for (let localX = 0; localX < frame.width; localX++) {
        const atlasX = tileLeft + localX;
        const atlasY = tileTop + localY;
        const dataIndex = (atlasY * tileset.imagewidth + atlasX) * 4;
        const alpha = frame.coverage[localY * frame.width + localX] === 1 ? 255 : 0;
        data[dataIndex] = 255;
        data[dataIndex + 1] = 255;
        data[dataIndex + 2] = 255;
        data[dataIndex + 3] = alpha;
      }
    }
  }

  return {
    data,
    width: tileset.imagewidth,
    height: tileset.imageheight,
    depth: 1,
  };
}

function getPackedPlacementKey(packedX: number, packedY: number, slice: number): string {
  return `${packedX}:${packedY}:${slice}`;
}

function buildPlacementReports(
  fixture: CoverageFixture,
  tileset: CoverageTileset,
): PlacementReport[] {
  const elevationYOffsetPx = getElevationYOffsetPx(tileset);
  const placements = getFixturePlacements(fixture.layers, tileset);
  const reports: PlacementReport[] = [];
  let placementIndex = 0;

  for (const [layerIndex, layer] of fixture.layers.entries()) {
    const level = getLayerLevel(layer.offsetY, elevationYOffsetPx);
    const octave = Math.floor(level / 8);
    const slice = level % 8;

    for (const [mapY, row] of layer.rows.entries()) {
      for (const [mapX, gid] of row.entries()) {
        if (gid <= 0) continue;
        const placement = placements[placementIndex];
        if (placement === undefined) {
          throw new Error(`Missing placement ${placementIndex} for fixture "${fixture.name}".`);
        }

        reports.push({
          ...placement,
          level,
          octave,
          slice,
          packedX: mapX - 2 * octave,
          packedY: mapY - 2 * octave,
        });
        placementIndex++;
      }
    }
  }

  return reports;
}

function validateFixture(fixture: CoverageFixture) {
  const tileset = loadNativeTileset();
  const oracleFrames = rasterizeOwnershipFrames();
  const map = createFixtureMap(fixture, tileset);
  const codec = createPackedTerrainCodec(map, tileset, getElevationYOffsetPx(tileset), 0);
  const atlas = createOracleAtlas(tileset, oracleFrames);
  const placements = getFixturePlacements(fixture.layers, tileset);
  const bounds = getCanvasBounds(placements, tileset.tilewidth, tileset.tileheight);
  const oracleCoverage = composeCoverage(placements, oracleFrames, bounds);
  const placementByPackedKey = new Map<string, number>();

  for (const report of buildPlacementReports(fixture, tileset)) {
    placementByPackedKey.set(getPackedPlacementKey(report.packedX, report.packedY, report.slice), report.placementId);
  }

  const counts: ResolveCounts = { uncovered: 0, stray: 0, wrongOwner: 0 };

  for (let canvasY = 0; canvasY < bounds.height; canvasY++) {
    for (let canvasX = 0; canvasX < bounds.width; canvasX++) {
      const worldX = bounds.minX + canvasX;
      const worldY = bounds.minY + canvasY;
      const pixelIndex = canvasY * bounds.width + canvasX;
      const oracleCount = oracleCoverage.counts[pixelIndex];
      if (oracleCount > 1) {
        throw new Error(`Oracle overlap detected at ${worldX},${worldY} for fixture "${fixture.name}".`);
      }

      const hit = codec.resolveVisibleTile(atlas, worldX, worldY);
      const actualOwnerId =
        hit === null ? -1 : placementByPackedKey.get(getPackedPlacementKey(hit.packedX, hit.packedY, hit.slice));
      if (hit !== null && actualOwnerId === undefined) {
        throw new Error(`Missing packed placement metadata for hit ${hit.packedX},${hit.packedY},${hit.slice}.`);
      }

      if (oracleCount > 0 && (actualOwnerId === undefined || actualOwnerId === -1)) {
        counts.uncovered++;
      } else if (oracleCount === 0 && actualOwnerId !== undefined && actualOwnerId !== -1) {
        counts.stray++;
      } else if (
        oracleCount === 1 &&
        actualOwnerId !== undefined &&
        actualOwnerId !== -1 &&
        oracleCoverage.ownerIds[pixelIndex] !== actualOwnerId
      ) {
        counts.wrongOwner++;
      }
    }
  }

  return { tileset, map, codec, atlas, counts };
}

describe("packed terrain codec oracle", () => {
  it("resolves the center pixel of a single flat tile", () => {
    const fixture: CoverageFixture = {
      name: "single-flat",
      layers: [{ rows: [[1]], offsetY: 0 }],
    };
    const { codec, atlas } = validateFixture(fixture);
    const hit = codec.resolveVisibleTile(atlas, 64, 32);

    expect(hit).not.toBeNull();
    if (hit === null) throw new Error("Expected the flat tile center pixel to resolve.");
    expect(hit.tileId).toBe(0);
  });

  it("resolves the first owned oracle row of a single flat tile", () => {
    const fixture: CoverageFixture = {
      name: "single-flat-top",
      layers: [{ rows: [[1]], offsetY: 0 }],
    };
    const { codec, atlas } = validateFixture(fixture);
    const hit = codec.resolveVisibleTile(atlas, 63, 0);

    expect(hit).not.toBeNull();
    if (hit === null) throw new Error("Expected the first owned flat-tile row to resolve.");
    expect(hit.tileId).toBe(0);
  });

  it("has zero holes, strays, and wrong owners for flat neighbors", () => {
    const fixture: CoverageFixture = {
      name: "flat-neighbors",
      layers: [
        {
          rows: [
            [1, 1],
            [1, 1],
          ],
          offsetY: 0,
        },
      ],
    };

    expect(validateFixture(fixture).counts).toEqual({ uncovered: 0, stray: 0, wrongOwner: 0 });
  });

  it(
    "has zero holes, strays, and wrong owners for the mixed-slope example fixture",
    () => {
    const tileset = loadNativeTileset();
    const fixture: CoverageFixture = {
      name: "example",
      layers: getCoverageLayersFromTileGidLayers(EXAMPLE_TILE_GID_LAYERS, getElevationYOffsetPx(tileset)),
    };
    expect(validateFixture(fixture).counts).toEqual({ uncovered: 0, stray: 0, wrongOwner: 0 });
    },
    15000,
  );

  it("preserves ownership for folded levels 8, 16, and 24", () => {
    const fixture: CoverageFixture = {
      name: "folded-levels",
      layers: [
        { rows: [[1, 0, 0, 0, 0, 0, 0]], offsetY: 0 },
        { rows: [[0, 0, 1, 0, 0, 0, 0]], offsetY: -128 },
        { rows: [[0, 0, 0, 0, 1, 0, 0]], offsetY: -256 },
        { rows: [[0, 0, 0, 0, 0, 0, 1]], offsetY: -384 },
      ],
    };

    expect(validateFixture(fixture).counts).toEqual({ uncovered: 0, stray: 0, wrongOwner: 0 });
  });
});
