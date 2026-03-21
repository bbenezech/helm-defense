import { describe, expect, it } from "vitest";
import { ACTIVE_BLENDER_RENDER_VARIANT } from "../../scripts/lib/blender.ts";
import { terrainSceneSpec } from "../../scripts/lib/terrain-scene-spec.ts";
import {
  DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
  DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
  rasterizeCheckerFrames,
  rasterizeCheckerSeedFrames,
  rasterizeOwnershipFrames,
  type BinaryFrame,
} from "../../scripts/lib/terrain-ownership.ts";
import { sampleMap, sampleTileset } from "../three/fixtures.ts";

type Placement = { frameIndex: number; left: number; top: number };
type FixtureLayer = { rows: number[][]; offsetY: number };
type CoverageImage = { width: number; height: number; counts: Uint16Array<ArrayBuffer> };

function createCheckerFrames() {
  return rasterizeCheckerFrames({
    cellsPerAxis: DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    lightValue: DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    darkValue: DEFAULT_CHECKER_ATLAS_DARK_VALUE,
    textureRotation: ACTIVE_BLENDER_RENDER_VARIANT.textureRotation,
  }, terrainSceneSpec);
}

function createBinaryFrameFromImageAlpha(frame: ReturnType<typeof createCheckerFrames>[number]): BinaryFrame {
  const coverage = new Uint8Array(frame.width * frame.height);

  for (let pixelIndex = 0; pixelIndex < coverage.length; pixelIndex++) {
    coverage[pixelIndex] = frame.data[pixelIndex * 4 + 3] > 0 ? 1 : 0;
  }

  return { width: frame.width, height: frame.height, coverage };
}

function getElevationYOffsetPx() {
  for (const property of sampleTileset.properties) {
    if (property.name === "elevationYOffsetPx" && typeof property.value === "number") return property.value;
  }

  throw new Error("Missing sample tileset elevationYOffsetPx property.");
}

function createRows(data: number[], width: number, height: number) {
  const rows: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const value = data[y * width + x];
      if (value === undefined) throw new Error(`Missing fixture tile at ${x},${y}.`);
      row.push(value);
    }
    rows.push(row);
  }

  return rows;
}

function getPlacements(layers: FixtureLayer[], frameWidth: number, frameHeight: number) {
  const halfTileWidth = frameWidth / 2;
  const elevationYOffsetPx = getElevationYOffsetPx();
  const logicalTileHeight = frameHeight - 2 * elevationYOffsetPx;
  const halfLogicalTileHeight = logicalTileHeight / 2;
  const imageTopOffset = frameHeight - logicalTileHeight;
  const placements: Placement[] = [];

  for (const layer of layers) {
    for (const [mapY, row] of layer.rows.entries()) {
      for (const [mapX, gid] of row.entries()) {
        if (gid <= 0) continue;
        placements.push({
          frameIndex: gid - 1,
          left: (mapX - mapY) * halfTileWidth,
          top: (mapX + mapY) * halfLogicalTileHeight - imageTopOffset + layer.offsetY,
        });
      }
    }
  }

  return placements;
}

function getBounds(placements: Placement[], frameWidth: number, frameHeight: number) {
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

function composeCoverage(layers: FixtureLayer[], frames: BinaryFrame[]): CoverageImage {
  const firstFrame = frames[0];
  if (firstFrame === undefined) throw new Error("Missing checker frame.");
  const placements = getPlacements(layers, firstFrame.width, firstFrame.height);
  const bounds = getBounds(placements, firstFrame.width, firstFrame.height);
  const counts = new Uint16Array(bounds.width * bounds.height);

  for (const placement of placements) {
    const frame = frames[placement.frameIndex];
    if (frame === undefined) throw new Error(`Missing frame ${placement.frameIndex}.`);
    const baseX = Math.round(placement.left - bounds.minX);
    const baseY = Math.round(placement.top - bounds.minY);

    for (let y = 0; y < frame.height; y++) {
      const canvasY = baseY + y;
      if (canvasY < 0 || canvasY >= bounds.height) continue;

      for (let x = 0; x < frame.width; x++) {
        if (frame.coverage[y * frame.width + x] !== 1) continue;

        const canvasX = baseX + x;
        if (canvasX < 0 || canvasX >= bounds.width) continue;
        counts[canvasY * bounds.width + canvasX]++;
      }
    }
  }

  return { width: bounds.width, height: bounds.height, counts };
}

function getFramePixelValue(frame: ReturnType<typeof createCheckerFrames>[number], x: number, y: number) {
  const pixelOffset = (y * frame.width + x) * 4;
  const value = frame.data[pixelOffset];
  if (value === undefined) throw new Error(`Missing checker pixel at ${x},${y}.`);
  return value;
}

describe("terrain checker ownership", () => {
  it("matches checker alpha to ownership coverage for all terrain frames", () => {
    const checkerFrames = createCheckerFrames();
    const ownershipFrames = rasterizeOwnershipFrames(terrainSceneSpec);

    expect(checkerFrames).toHaveLength(ownershipFrames.length);

    for (const [frameIndex, checkerFrame] of checkerFrames.entries()) {
      const ownershipFrame = ownershipFrames[frameIndex];
      if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}.`);

      expect(checkerFrame.width).toBe(ownershipFrame.width);
      expect(checkerFrame.height).toBe(ownershipFrame.height);

      for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
        const alpha = checkerFrame.data[pixelIndex * 4 + 3];
        const expectedAlpha = ownershipFrame.coverage[pixelIndex] === 1 ? 255 : 0;
        expect(alpha).toBe(expectedAlpha);
      }
    }
  });

  it("never leaves an ownership pixel transparent in checker frames", () => {
    const checkerFrames = createCheckerFrames();
    const ownershipFrames = rasterizeOwnershipFrames(terrainSceneSpec);

    for (const [frameIndex, checkerFrame] of checkerFrames.entries()) {
      const ownershipFrame = ownershipFrames[frameIndex];
      if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}.`);

      for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
        if (ownershipFrame.coverage[pixelIndex] !== 1) continue;
        expect(checkerFrame.data[pixelIndex * 4 + 3]).toBe(255);
      }
    }
  });

  it("keeps checker seed coverage inside ownership and leaves flood-filled-only pixels out of the seed mask", () => {
    const seedFrames = rasterizeCheckerSeedFrames(terrainSceneSpec);
    const ownershipFrames = rasterizeOwnershipFrames(terrainSceneSpec);
    let foundFloodFilledOnlyPixel = false;

    for (const [frameIndex, seedFrame] of seedFrames.entries()) {
      const ownershipFrame = ownershipFrames[frameIndex];
      if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}.`);

      expect(seedFrame.width).toBe(ownershipFrame.width);
      expect(seedFrame.height).toBe(ownershipFrame.height);

      for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
        if (seedFrame.coverage[pixelIndex] === 1) {
          expect(ownershipFrame.coverage[pixelIndex]).toBe(1);
        }
        if (ownershipFrame.coverage[pixelIndex] === 1 && seedFrame.coverage[pixelIndex] === 0) {
          foundFloodFilledOnlyPixel = true;
        }
      }
    }

    expect(foundFloodFilledOnlyPixel).toBe(true);
  });

  it("matches Blender texture row origin on flat checker samples", () => {
    const checkerFrames = createCheckerFrames();
    const flatFrameIndex = terrainSceneSpec.order.indexOf("SLOPE_FLAT");
    if (flatFrameIndex < 0) throw new Error("Missing SLOPE_FLAT pose.");
    const flatFrame = checkerFrames[flatFrameIndex];
    if (flatFrame === undefined) throw new Error(`Missing checker frame ${flatFrameIndex}.`);

    expect(getFramePixelValue(flatFrame, 48, 40)).toBe(DEFAULT_CHECKER_ATLAS_DARK_VALUE);
    expect(getFramePixelValue(flatFrame, 64, 40)).toBe(DEFAULT_CHECKER_ATLAS_LIGHT_VALUE);
    expect(getFramePixelValue(flatFrame, 48, 56)).toBe(DEFAULT_CHECKER_ATLAS_DARK_VALUE);
    expect(getFramePixelValue(flatFrame, 64, 56)).toBe(DEFAULT_CHECKER_ATLAS_LIGHT_VALUE);
  });

  it("tiles checker alpha seamlessly for flat neighbors and the sample mixed-slope map", () => {
    const checkerFrames = createCheckerFrames().map(createBinaryFrameFromImageAlpha);
    const ownershipFrames = rasterizeOwnershipFrames(terrainSceneSpec);
    const flatFixture: FixtureLayer[] = [
      {
        rows: [
          [1, 1],
          [1, 1],
        ],
        offsetY: 0,
      },
    ];
    const mixedSlopeFixture: FixtureLayer[] = sampleMap.layers.map((layer) => ({
      rows: createRows(layer.data, layer.width, layer.height),
      offsetY: layer.offsety,
    }));

    const flatCheckerCoverage = composeCoverage(flatFixture, checkerFrames);
    const flatOwnershipCoverage = composeCoverage(flatFixture, ownershipFrames);
    const mixedCheckerCoverage = composeCoverage(mixedSlopeFixture, checkerFrames);
    const mixedOwnershipCoverage = composeCoverage(mixedSlopeFixture, ownershipFrames);

    expect(flatCheckerCoverage.width).toBe(flatOwnershipCoverage.width);
    expect(flatCheckerCoverage.height).toBe(flatOwnershipCoverage.height);
    expect([...flatCheckerCoverage.counts]).toEqual([...flatOwnershipCoverage.counts]);
    expect(mixedCheckerCoverage.width).toBe(mixedOwnershipCoverage.width);
    expect(mixedCheckerCoverage.height).toBe(mixedOwnershipCoverage.height);
    expect([...mixedCheckerCoverage.counts]).toEqual([...mixedOwnershipCoverage.counts]);
  });
});
