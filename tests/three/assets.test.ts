import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeBiomeCellTextureData,
  encodePackedTerrainTextureData,
  encodeSurfaceCellTextureData,
  getAtlasRegion,
  loadTerrainAssetBundle,
  parseTerrainBiomeGrid,
  parseTerrainMap,
  parseTerrainTileset,
} from "../../three/assets.ts";
import { decodeBaseHeightLevel, decodeBiomeIndex, decodeShapeReference } from "../../three/codec.ts";
import { sampleBiomeGrid, sampleMap, sampleTileset } from "./fixtures.ts";

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

  it("validates terrain biome grids", () => {
    expect(parseTerrainBiomeGrid(sampleBiomeGrid).data).toHaveLength(9);
    expect(() => parseTerrainBiomeGrid({ ...sampleBiomeGrid, data: ["nope"] })).toThrow(/Invalid biome grid value/u);
    expect(() => parseTerrainBiomeGrid({ ...sampleBiomeGrid, type: "nope" })).toThrow(/Invalid biome grid type/u);
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

  it("packs world-cell biome indices into RGBA bytes for WebGPU sampling", () => {
    const data = encodeBiomeCellTextureData({
      data: new Uint8Array([0, 7]),
      width: 2,
      height: 1,
    });

    expect([...data.slice(0, 8)]).toEqual([0, 0, 0, 255, 7, 0, 0, 255]);
  });

  it("loads terrain atlas payloads into the terrain bundle without requesting a runtime surface", async () => {
    const imageAssets = new Map<string, { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }>([
      ["/biome/grass/tileset.png", { width: 2, height: 2, data: createSolidImageData(2, 2, 10, 20, 30, 255) }],
      ["/biome/mud/tileset.png", { width: 2, height: 2, data: createSolidImageData(2, 2, 200, 160, 90, 255) }],
      ["/biome/checkers/tileset.png", { width: 2, height: 2, data: createSolidImageData(2, 2, 220, 220, 220, 255) }],
    ]);
    const fetchMock = vi.fn();

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
      value: fetchMock,
    });

    const bundle = await loadTerrainAssetBundle();

    expect(bundle.map.width).toBe(100);
    expect(bundle.map.height).toBe(100);
    expect(bundle.colorAtlas.width).toBe(2);
    expect(bundle.colorAtlas.height).toBe(2);
    expect(bundle.colorAtlas.depth).toBe(2);
    expect(bundle.checkerAtlas.width).toBe(2);
    expect(bundle.checkerAtlas.height).toBe(2);
    expect(bundle.checkerAtlas.depth).toBe(1);
    expect(bundle.biomeCells.grid.width).toBe(bundle.map.width);
    expect(bundle.biomeCells.grid.height).toBe(bundle.map.height);
    expect(bundle.biomeCells.texture.image.width).toBe(bundle.map.width);
    expect(bundle.biomeCells.texture.image.height).toBe(bundle.map.height);
    expect(bundle.surfaceCells.grid.width).toBe(bundle.map.width);
    expect(bundle.surfaceCells.grid.height).toBe(bundle.map.height);
    expect(bundle.surfaceCells.texture.image.width).toBe(bundle.map.width);
    expect(bundle.surfaceCells.texture.image.height).toBe(bundle.map.height);
    expect(bundle.biomeCells.grid.data.some((biomeIndex) => biomeIndex === 0)).toBe(true);
    expect(bundle.biomeCells.grid.data.some((biomeIndex) => biomeIndex === 1)).toBe(true);

    const firstSurfaceWord = bundle.surfaceCells.grid.data.find((word) => word !== 0);
    if (firstSurfaceWord === undefined) throw new Error("Expected at least one populated surface cell in the terrain bundle.");
    expect(decodeShapeReference(firstSurfaceWord)).toBeGreaterThan(0);
    expect(decodeBaseHeightLevel(firstSurfaceWord)).toBeGreaterThanOrEqual(0);
    expect(decodeBiomeIndex(firstSurfaceWord)).toBeLessThan(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
