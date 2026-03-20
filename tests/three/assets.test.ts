import { describe, expect, it } from "vitest";
import { encodePackedTerrainTextureData, getAtlasRegion, parseBiomeManifest, parseTerrainMap, parseTerrainTileset } from "../../three/assets.ts";
import { sampleMap, sampleTileset } from "./fixtures.ts";

describe("terrain assets", () => {
  it("computes atlas regions in texture space", () => {
    const region = getAtlasRegion(parseTerrainTileset(sampleTileset), 3);

    expect(region.offset.x).toBeCloseTo(0.5);
    expect(region.offset.y).toBeCloseTo(0);
    expect(region.scale.x).toBeCloseTo(0.5);
    expect(region.scale.y).toBeCloseTo(0.5);
  });

  it("validates the terrain contract shape", () => {
    expect(parseTerrainMap(sampleMap).layers).toHaveLength(2);
    expect(() => parseTerrainTileset({ ...sampleTileset, tiles: "nope" })).toThrow(/Missing tileset tiles/u);
  });

  it("validates biome manifests", () => {
    expect(parseBiomeManifest({ biomes: [{ id: "grass", atlas: "tileset.png" }] }).biomes).toHaveLength(1);
    expect(() => parseBiomeManifest({ biomes: [] })).toThrow(/at least one biome/u);
  });

  it("packs terrain words into RGBA bytes for WebGPU sampling", () => {
    const data = encodePackedTerrainTextureData({
      data: new Uint32Array([0x12_34_56_78, 0x9a_bc_de_f0]),
      width: 2,
      height: 1,
      slices: 8,
      origin: { x: 0, y: 0 },
    });

    expect([...data.slice(0, 8)]).toEqual([0x78, 0x56, 0x34, 0x12, 0xf0, 0xde, 0xbc, 0x9a]);
  });
});
