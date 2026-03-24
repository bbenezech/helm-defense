import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodePackedTerrainTextureData,
  encodeSurfaceCellTextureData,
  getAtlasRegion,
  loadTerrainAssetBundle,
  parseBiomeManifest,
  parseTerrainMap,
  parseTerrainTileset,
} from "../../three/assets.ts";
import { decodeBaseHeightLevel, decodeShapeReference } from "../../three/codec.ts";
import { sampleMap, sampleTileset } from "./fixtures.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalImage = globalThis.Image;

afterEach(() => {
  Object.defineProperty(globalThis, "fetch", { configurable: true, writable: true, value: originalFetch });
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: originalWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: originalDocument });
  Object.defineProperty(globalThis, "Image", { configurable: true, writable: true, value: originalImage });
  vi.restoreAllMocks();
});

function createSolidImageData(
  width: number,
  height: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
    const rgbaIndex = pixelIndex * 4;
    data[rgbaIndex] = red;
    data[rgbaIndex + 1] = green;
    data[rgbaIndex + 2] = blue;
    data[rgbaIndex + 3] = alpha;
  }
  return data;
}

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
    expect(
      parseBiomeManifest({ biomes: [{ id: "grass", atlas: "tileset.png", checkerAtlas: "tileset.checker.png" }] }).biomes,
    ).toHaveLength(1);
    expect(() => parseBiomeManifest({ biomes: [] })).toThrow(/at least one biome/u);
    expect(() => parseBiomeManifest({ biomes: [{ id: "grass" }] })).toThrow(/biome atlas/u);
    expect(() => parseBiomeManifest({ biomes: [{ id: "grass", atlas: "tileset.png" }] })).toThrow(
      /checker atlas/u,
    );
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

  it("packs world-cell surface words into RGBA bytes for WebGPU sampling", () => {
    const data = encodeSurfaceCellTextureData({
      data: new Uint32Array([0x12_34_56_78, 0x9a_bc_de_f0]),
      width: 2,
      height: 1,
    });

    expect([...data.slice(0, 8)]).toEqual([0x78, 0x56, 0x34, 0x12, 0xf0, 0xde, 0xbc, 0x9a]);
  });

  it("loads terrain atlas payloads into the terrain bundle without requesting a runtime surface", async () => {
    const imageAssets = new Map<string, { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }>([
      ["/Grass_23-512x512/tileset.png", { width: 2, height: 2, data: createSolidImageData(2, 2, 10, 20, 30, 255) }],
      [
        "/Grass_23-512x512/tileset.checker.png",
        { width: 2, height: 2, data: createSolidImageData(2, 2, 220, 220, 220, 255) },
      ],
    ]);
    const fetchCalls: string[] = [];

    class MockImage {
      decoding = "async";
      src = "";
      width = 0;
      height = 0;

      async decode(): Promise<void> {
        const asset = imageAssets.get(new URL(this.src).pathname);
        if (asset === undefined) throw new Error(`Missing mocked image for ${this.src}.`);
        this.width = asset.width;
        this.height = asset.height;
      }
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: { location: { href: "http://localhost:9000/" } },
    });
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: MockImage,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: (tagName: string) => {
          if (tagName !== "canvas") throw new Error(`Unexpected element tag ${tagName}.`);

          return {
            width: 0,
            height: 0,
            getContext: (contextType: string) => {
              if (contextType !== "2d") throw new Error(`Unexpected canvas context ${contextType}.`);
              let renderedImagePath = "";

              return {
                drawImage: (image: MockImage) => {
                  renderedImagePath = new URL(image.src).pathname;
                },
                getImageData: (_x: number, _y: number, width: number, height: number) => {
                  const asset = imageAssets.get(renderedImagePath);
                  if (asset === undefined) throw new Error(`Missing mocked image data for ${renderedImagePath}.`);
                  if (asset.width !== width || asset.height !== height) {
                    throw new Error(
                      `Mocked image data mismatch for ${renderedImagePath}: expected ${asset.width}x${asset.height}, received ${width}x${height}.`,
                    );
                  }
                  return { data: asset.data };
                },
              };
            },
          };
        },
      },
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: vi.fn(async (url: string) => {
        const pathname = new URL(url).pathname;
        fetchCalls.push(pathname);
        if (pathname.endsWith("/tileset.json")) return { ok: true, json: async () => sampleTileset };
        if (pathname.endsWith("/random.map.json")) return { ok: true, json: async () => sampleMap };
        if (pathname.endsWith("/biomes.json")) {
          return {
            ok: true,
            json: async () => ({
              biomes: [{ id: "grass", atlas: "tileset.png", checkerAtlas: "tileset.checker.png" }],
            }),
          };
        }

        return { ok: false, status: 404, json: async () => null };
      }),
    });

    const bundle = await loadTerrainAssetBundle();

    const firstBiome = bundle.biomeManifest.biomes[0];
    if (firstBiome === undefined) throw new Error("Expected a biome entry in the loaded terrain bundle.");
    expect(firstBiome.atlas).toBe("tileset.png");
    expect(firstBiome.checkerAtlas).toBe("tileset.checker.png");
    expect(bundle.checkerAtlas.width).toBe(2);
    expect(bundle.checkerAtlas.height).toBe(2);
    expect(bundle.checkerAtlas.depth).toBe(1);
    expect([...bundle.checkerAtlas.data]).toEqual([...createSolidImageData(2, 2, 220, 220, 220, 255)]);
    expect(bundle.surfaceCells.grid.width).toBe(sampleMap.width);
    expect(bundle.surfaceCells.grid.height).toBe(sampleMap.height);
    expect(bundle.surfaceCells.texture.image.width).toBe(sampleMap.width);
    expect(bundle.surfaceCells.texture.image.height).toBe(sampleMap.height);
    const centerWord = bundle.surfaceCells.grid.data[4];
    if (centerWord === undefined) throw new Error("Expected the sample surface grid to contain the center texel.");
    expect(decodeShapeReference(centerWord)).toBe(2);
    expect(decodeBaseHeightLevel(centerWord)).toBe(1);
    expect(fetchCalls).not.toContain("/Grass_23-512x512/random.tileableHeightmap.json");
  });
});
