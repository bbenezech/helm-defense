import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERRAIN_TILE_INDEX, tileDataToTerrain } from "../../src/game/lib/terrain.ts";
import { parseTerrainTileset } from "../../three/assets.ts";
import { createSurfaceShapeLookup, evaluateSurfaceSample } from "../../three/surface.ts";

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
});
