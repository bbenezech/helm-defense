import { describe, expect, it } from "vitest";
import { getAtlasRegion, parseTerrainMap, parseTerrainTileset } from "../../three/assets.ts";
import { buildTerrainChunks } from "../../three/chunks.ts";
import { getMapBounds } from "../../three/projection.ts";
import { sampleMap, sampleTileset } from "./fixtures.ts";

describe("terrain chunks", () => {
  it("packs tiles into deterministic chunks ordered by depth", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap(sampleMap);
    const chunks = buildTerrainChunks(
      {
        map,
        tileset,
        atlasUrl: "/tileset.png",
        bounds: getMapBounds(map),
        elevationYOffsetPx: 16,
        atlasRegions: new Map(tileset.tiles.map((tile) => [tile.id, getAtlasRegion(tileset, tile.id)])),
        surface: {
          data: new Uint8Array(map.width * map.height * 4),
          width: map.width,
          height: map.height,
          minHeight: 0,
          maxHeight: 1,
        },
      },
      2,
    );

    expect(chunks).toHaveLength(4);
    expect(chunks[0].instances[0]?.tileX).toBe(0);
    expect(chunks[0].instances.at(-1)?.depth).toBeGreaterThan(chunks[0].instances[0]?.depth ?? 0);
  });
});
