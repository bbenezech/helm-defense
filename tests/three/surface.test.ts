import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERRAIN_TILE_INDEX, tileDataToTerrain } from "../../src/game/lib/terrain.ts";
import { parseTerrainMap, parseTerrainTileset, type TerrainMapLayer } from "../../three/assets.ts";
import { createSurfaceCellGrid } from "../../three/codec.ts";
import {
  createSurfaceShapeLookup,
  deriveAdaptiveHeightGradient,
  evaluateSurfaceLightingNormalFromCells,
  evaluateSurfaceSample,
  SURFACE_NORMAL_FILTER_RADIUS_TILES,
  type SurfaceWinner,
} from "../../three/surface.ts";
import { createFilledBiomeCellGrid, sampleBiomeGrid, sampleMap, sampleTileset } from "./fixtures.ts";

const COS_45 = Math.SQRT1_2;
const SIN_45 = Math.SQRT1_2;

function getTilesetJsonPath() {
  return path.resolve(import.meta.dirname, "../../public/Grass_23-512x512/tileset.json");
}

function loadNativeTileset() {
  const tilesetJson = JSON.parse(fs.readFileSync(getTilesetJsonPath(), "utf8"));
  return parseTerrainTileset(tilesetJson);
}

function getTileStringProperty(tile: ReturnType<typeof loadNativeTileset>["tiles"][number], name: string): string {
  for (const property of tile.properties) {
    if (property.name === name && typeof property.value === "string") return property.value;
  }

  throw new Error(`Missing string property "${name}" for tile ${tile.id}.`);
}

function getTileNumberProperty(tile: ReturnType<typeof loadNativeTileset>["tiles"][number], name: string): number {
  for (const property of tile.properties) {
    if (property.name === name && typeof property.value === "number") return property.value;
  }

  throw new Error(`Missing numeric property "${name}" for tile ${tile.id}.`);
}

function findCanonicalTerrainTile(tile: ReturnType<typeof loadNativeTileset>["tiles"][number]) {
  const nesw = getTileStringProperty(tile, "NESW");
  const center = getTileNumberProperty(tile, "CENTER");

  for (const terrainTile of Object.values(TERRAIN_TILE_INDEX)) {
    if (terrainTile.NESW === nesw && terrainTile.CENTER === center) return terrainTile;
  }

  throw new Error(`Could not find canonical terrain tile for ${nesw}/${center}.`);
}

function rotateTerrainNormalToWorld(normal: [number, number, number]): [number, number, number] {
  return [
    COS_45 * normal[0] + SIN_45 * normal[1],
    -SIN_45 * normal[0] + COS_45 * normal[1],
    normal[2],
  ];
}

function createLayer(
  width: number,
  height: number,
  level: number,
  placements: Array<{ x: number; y: number; gid: number }>,
): TerrainMapLayer {
  const data = Array.from<number>({ length: width * height }).fill(0);

  for (const placement of placements) {
    data[placement.y * width + placement.x] = placement.gid;
  }

  return {
    id: level + 1,
    name: `level-${level}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: -16 * level,
    width,
    height,
    data,
    properties: [{ name: "level", type: "int", value: level }],
  };
}

function getVectorDelta(left: [number, number, number], right: [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

describe("analytic terrain surface", () => {
  it("matches the canonical coarse terrain contract for all 19 poses", () => {
    const tileset = loadNativeTileset();
    const lookup = createSurfaceShapeLookup(tileset);
    const precision = 16;
    const baseHeightLevel = 5;
    const samplePixels = [
      { x: 1, y: 1 },
      { x: 4, y: 2 },
      { x: 8, y: 8 },
      { x: 13, y: 3 },
      { x: 3, y: 12 },
    ];

    for (const tile of tileset.tiles) {
      const terrainTile = findCanonicalTerrainTile(tile);
      const terrain = tileDataToTerrain([[{ tile: terrainTile, level: baseHeightLevel }]], precision);
      const shapeReference = tile.id + 1;

      for (const samplePixel of samplePixels) {
        const analyticSample = evaluateSurfaceSample(
          lookup,
          shapeReference,
          baseHeightLevel,
          samplePixel.x / precision,
          samplePixel.y / precision,
        );
        const heightRow = terrain.heightmap[samplePixel.y];
        if (heightRow === undefined) throw new Error(`Missing terrain height row ${samplePixel.y}.`);
        const normalRow = terrain.normalmap[samplePixel.y];
        if (normalRow === undefined) throw new Error(`Missing terrain normal row ${samplePixel.y}.`);
        const expectedWorldHeight = heightRow[samplePixel.x] / precision;
        const expectedTerrainNormal = normalRow[samplePixel.x];
        const expectedWorldNormal = rotateTerrainNormalToWorld(expectedTerrainNormal);

        expect(analyticSample.worldHeight).toBeCloseTo(expectedWorldHeight, 6);
        expect(analyticSample.terrainNormal[0]).toBeCloseTo(expectedTerrainNormal[0], 6);
        expect(analyticSample.terrainNormal[1]).toBeCloseTo(expectedTerrainNormal[1], 6);
        expect(analyticSample.terrainNormal[2]).toBeCloseTo(expectedTerrainNormal[2], 6);
        expect(analyticSample.worldNormal[0]).toBeCloseTo(expectedWorldNormal[0], 6);
        expect(analyticSample.worldNormal[1]).toBeCloseTo(expectedWorldNormal[1], 6);
        expect(analyticSample.worldNormal[2]).toBeCloseTo(expectedWorldNormal[2], 6);
      }
    }
  });

  it("uses central, forward, backward, and missing adaptive height gradients correctly", () => {
    expect(deriveAdaptiveHeightGradient(1, 0.5, 1.5, SURFACE_NORMAL_FILTER_RADIUS_TILES)).toBeCloseTo(8, 6);
    expect(deriveAdaptiveHeightGradient(1, null, 1.25, SURFACE_NORMAL_FILTER_RADIUS_TILES)).toBeCloseTo(4, 6);
    expect(deriveAdaptiveHeightGradient(1, 0.75, null, SURFACE_NORMAL_FILTER_RADIUS_TILES)).toBeCloseTo(4, 6);
    expect(deriveAdaptiveHeightGradient(1, null, null, SURFACE_NORMAL_FILTER_RADIUS_TILES)).toBeNull();
  });

  it("falls back to the exact analytic winner normal when the winner is not the top surface cell", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap(sampleMap);
    const lookup = createSurfaceShapeLookup(tileset);
    const surfaceCells = createSurfaceCellGrid(
      map,
      {
        data: new Uint8Array(sampleBiomeGrid.data),
        width: sampleBiomeGrid.width,
        height: sampleBiomeGrid.height,
      },
    );
    const winner: SurfaceWinner = { shapeReference: 4, baseHeightLevel: 0, mapX: 1, mapY: 1 };
    const result = evaluateSurfaceLightingNormalFromCells(
      lookup,
      surfaceCells,
      winner,
      { x: 1.3, y: 1.4 },
      SURFACE_NORMAL_FILTER_RADIUS_TILES,
    );
    const exactNormal = evaluateSurfaceSample(lookup, winner.shapeReference, winner.baseHeightLevel, 0.3, 0.4).worldNormal;

    expect(result.kind).toBe("exact");
    expect(result.worldNormal[0]).toBeCloseTo(exactNormal[0], 6);
    expect(result.worldNormal[1]).toBeCloseTo(exactNormal[1], 6);
    expect(result.worldNormal[2]).toBeCloseTo(exactNormal[2], 6);
  });

  it("uses one-sided differences on the world border and keeps a flat tile upward", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap({
      type: "map",
      orientation: "isometric",
      renderorder: "right-down",
      width: 1,
      height: 1,
      tilewidth: 128,
      tileheight: 64,
      layers: [createLayer(1, 1, 0, [{ x: 0, y: 0, gid: 1 }])],
      tilesets: [{ firstgid: 1, ...sampleTileset }],
    });
    const lookup = createSurfaceShapeLookup(tileset);
    const surfaceCells = createSurfaceCellGrid(map, createFilledBiomeCellGrid(map.width, map.height, 0));
    const result = evaluateSurfaceLightingNormalFromCells(
      lookup,
      surfaceCells,
      { shapeReference: 1, baseHeightLevel: 0, mapX: 0, mapY: 0 },
      { x: 0.02, y: 0.03 },
      SURFACE_NORMAL_FILTER_RADIUS_TILES,
    );

    expect(result.kind).toBe("smoothed");
    expect(result.worldNormal[0]).toBeCloseTo(0, 6);
    expect(result.worldNormal[1]).toBeCloseTo(0, 6);
    expect(result.worldNormal[2]).toBeCloseTo(1, 6);
  });

  it("keeps a tiny-radius smoothed normal aligned with the exact normal on a planar diagonal slope", () => {
    const tileset = loadNativeTileset();
    const lookup = createSurfaceShapeLookup(tileset);
    const map = parseTerrainMap({
      type: "map",
      orientation: "isometric",
      renderorder: "right-down",
      width: 1,
      height: 1,
      tilewidth: 128,
      tileheight: 64,
      layers: [createLayer(1, 1, 0, [{ x: 0, y: 0, gid: 7 }])],
      tilesets: [{ firstgid: 1, ...tileset }],
    });
    const surfaceCells = createSurfaceCellGrid(map, createFilledBiomeCellGrid(map.width, map.height, 0));
    const winner: SurfaceWinner = { shapeReference: 7, baseHeightLevel: 0, mapX: 0, mapY: 0 };
    const exactNormal = evaluateSurfaceSample(lookup, winner.shapeReference, winner.baseHeightLevel, 0.5, 0.5).worldNormal;
    const smoothedResult = evaluateSurfaceLightingNormalFromCells(lookup, surfaceCells, winner, { x: 0.5, y: 0.5 }, 0.005);

    expect(smoothedResult.kind).toBe("smoothed");
    expect(smoothedResult.worldNormal[0]).toBeCloseTo(exactNormal[0], 6);
    expect(smoothedResult.worldNormal[1]).toBeCloseTo(exactNormal[1], 6);
    expect(smoothedResult.worldNormal[2]).toBeCloseTo(exactNormal[2], 6);
  });

  it("smooths a cross-tile seam when neighboring top-surface cells exist", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap({
      type: "map",
      orientation: "isometric",
      renderorder: "right-down",
      width: 2,
      height: 1,
      tilewidth: 128,
      tileheight: 64,
      layers: [
        createLayer(2, 1, 0, [{ x: 0, y: 0, gid: 2 }]),
        createLayer(2, 1, 1, [{ x: 1, y: 0, gid: 1 }]),
      ],
      tilesets: [{ firstgid: 1, ...sampleTileset }],
    });
    const lookup = createSurfaceShapeLookup(tileset);
    const surfaceCells = createSurfaceCellGrid(map, createFilledBiomeCellGrid(map.width, map.height, 0));
    const leftWinner: SurfaceWinner = { shapeReference: 2, baseHeightLevel: 0, mapX: 0, mapY: 0 };
    const rightWinner: SurfaceWinner = { shapeReference: 1, baseHeightLevel: 1, mapX: 1, mapY: 0 };
    const leftResult = evaluateSurfaceLightingNormalFromCells(
      lookup,
      surfaceCells,
      leftWinner,
      { x: 0.97, y: 0.5 },
      SURFACE_NORMAL_FILTER_RADIUS_TILES,
    );
    const rightResult = evaluateSurfaceLightingNormalFromCells(
      lookup,
      surfaceCells,
      rightWinner,
      { x: 1.03, y: 0.5 },
      SURFACE_NORMAL_FILTER_RADIUS_TILES,
    );
    const exactLeft = evaluateSurfaceSample(lookup, leftWinner.shapeReference, leftWinner.baseHeightLevel, 0.97, 0.5);
    const exactRight = evaluateSurfaceSample(lookup, rightWinner.shapeReference, rightWinner.baseHeightLevel, 0.03, 0.5);
    const exactDelta = getVectorDelta(exactLeft.worldNormal, exactRight.worldNormal);
    const smoothedDelta = getVectorDelta(leftResult.worldNormal, rightResult.worldNormal);

    expect(leftResult.kind).toBe("smoothed");
    expect(rightResult.kind).toBe("smoothed");
    expect(smoothedDelta).toBeLessThan(exactDelta);
    expect(leftResult.worldNormal[2]).toBeGreaterThan(0.7);
    expect(rightResult.worldNormal[2]).toBeGreaterThan(0.7);
  });
});
