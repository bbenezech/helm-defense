import { describe, expect, it } from "vitest";
import {
  compareCheckerFrameImages,
  createCheckerSourceTextureImageData,
  normalizeFrameToOwnershipCoverage,
} from "../../scripts/validate-checker-atlas.ts";
import type { BinaryFrame } from "../../scripts/lib/terrain-ownership.ts";

type RgbaImageData = Parameters<typeof normalizeFrameToOwnershipCoverage>[0];

function createRgbaImage(width: number, height: number, rgba: number[]): RgbaImageData {
  return {
    width,
    height,
    channels: 4,
    data: new Uint8ClampedArray(rgba),
  };
}

function createBinaryFrame(width: number, height: number, coverage: number[]): BinaryFrame {
  return {
    width,
    height,
    coverage: new Uint8Array(coverage),
  };
}

describe("checker atlas validator helpers", () => {
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

  it("clips a frame to ownership by zeroing background RGB and forcing owned alpha opaque", () => {
    const frame = createRgbaImage(2, 1, [10, 20, 30, 40, 50, 60, 70, 80]);
    const ownership = createBinaryFrame(2, 1, [1, 0]);
    const clipped = normalizeFrameToOwnershipCoverage(frame, ownership);

    expect([...clipped.data]).toEqual([10, 20, 30, 255, 0, 0, 0, 0]);
  });

  it("reports zero mismatches for identical reference and blender checker frames", () => {
    const reference = createRgbaImage(2, 2, [
      224, 224, 224, 255,
      80, 80, 80, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const blender = createRgbaImage(2, 2, [
      224, 224, 224, 255,
      80, 80, 80, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const seed = createBinaryFrame(2, 2, [1, 0, 0, 0]);
    const ownership = createBinaryFrame(2, 2, [1, 1, 0, 0]);
    const comparison = compareCheckerFrameImages(reference, blender, seed, ownership);

    expect(comparison.counts.comparedPixels).toBe(4);
    expect(comparison.counts.mismatchedPixels).toBe(0);
    expect(comparison.counts.matchingPixels).toBe(4);
    expect(comparison.counts.seedMismatchPixels).toBe(0);
    expect(comparison.counts.floodFilledMismatchPixels).toBe(0);
  });

  it("classifies seed and flood-filled checker mismatches separately", () => {
    const reference = createRgbaImage(2, 1, [
      224, 224, 224, 255,
      80, 80, 80, 255,
    ]);
    const blender = createRgbaImage(2, 1, [
      80, 80, 80, 255,
      224, 224, 224, 255,
    ]);
    const seed = createBinaryFrame(2, 1, [1, 0]);
    const ownership = createBinaryFrame(2, 1, [1, 1]);
    const comparison = compareCheckerFrameImages(reference, blender, seed, ownership);

    expect(comparison.counts.mismatchedPixels).toBe(2);
    expect(comparison.counts.seedMismatchPixels).toBe(1);
    expect(comparison.counts.floodFilledMismatchPixels).toBe(1);
    expect(comparison.counts.backgroundMismatchPixels).toBe(0);
  });
});
