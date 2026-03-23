import { describe, expect, it } from "vitest";
import { compareRasterFrameImages, createCheckerSourceTextureImageData } from "../../scripts/validate-tileset-raster.ts";

type RgbaImageData = ReturnType<typeof createCheckerSourceTextureImageData>;

function createRgbaImage(width: number, height: number, rgba: number[]): RgbaImageData {
  const channels = 4;
  return {
    width,
    height,
    channels,
    data: new Uint8ClampedArray(rgba),
  };
}

describe("tileset raster validator helpers", () => {
  it("builds the canonical checker source texture with 4x4 cells and full alpha", () => {
    const image = createCheckerSourceTextureImageData(8, 8, 4, 224, 80);

    expect(image.width).toBe(8);
    expect(image.height).toBe(8);
    expect(image.data[0]).toBe(224);
    expect(image.data[(0 * image.width + 2) * 4]).toBe(80);
    expect(image.data[(2 * image.width + 0) * 4]).toBe(80);
    expect(image.data[(2 * image.width + 2) * 4]).toBe(224);

    for (let pixelIndex = 0; pixelIndex < image.width * image.height; pixelIndex++) {
      expect(image.data[pixelIndex * 4 + 3]).toBe(255);
    }
  });

  it("reports zero mismatches for identical reference and raster frames", () => {
    const reference = createRgbaImage(2, 2, [
      224, 224, 224, 255,
      80, 80, 80, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const raster = createRgbaImage(2, 2, [
      224, 224, 224, 255,
      80, 80, 80, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const comparison = compareRasterFrameImages(reference, raster);

    expect(comparison.counts.comparedPixels).toBe(4);
    expect(comparison.counts.ownedPixels).toBe(2);
    expect(comparison.counts.backgroundPixels).toBe(2);
    expect(comparison.counts.matchingPixels).toBe(4);
    expect(comparison.counts.mismatchedPixels).toBe(0);
  });

  it("marks mismatched pixels in red and counts them exactly", () => {
    const reference = createRgbaImage(2, 1, [
      224, 224, 224, 255,
      0, 0, 0, 0,
    ]);
    const raster = createRgbaImage(2, 1, [
      80, 80, 80, 255,
      0, 0, 0, 0,
    ]);
    const comparison = compareRasterFrameImages(reference, raster);

    expect(comparison.counts.matchingPixels).toBe(1);
    expect(comparison.counts.mismatchedPixels).toBe(1);
    expect([...comparison.diffImage.data]).toEqual([
      255, 64, 64, 255,
      0, 0, 0, 0,
    ]);
  });
});
