import { describe, expect, it } from "vitest";
import type { ImageData } from "../../src/game/lib/heightmap.ts";
import { terrainSceneSpec } from "../../scripts/lib/terrain-scene-spec.ts";
import { applyTerrainTextureRotation } from "../../scripts/lib/terrain-ownership.ts";
import { rasterizeTerrainFrame, sampleTerrainTexture } from "../../scripts/lib/terrain-raster.ts";

function createTexture(width: number, height: number, rgba: number[]): ImageData {
  const channels = 4;
  return {
    width,
    height,
    channels,
    data: new Uint8ClampedArray(rgba),
  };
}

describe("terrain raster", () => {
  it("applies explicit camera-aligned legacy quarter turns exactly", () => {
    const rotations: Array<{ textureQuarterTurn: 0 | 1 | 2 | 3; expected: { u: number; v: number } }> = [
      { textureQuarterTurn: 0, expected: { u: 0.25, v: 0.75 } },
      { textureQuarterTurn: 1, expected: { u: 0.25, v: 0.25 } },
      { textureQuarterTurn: 2, expected: { u: 0.75, v: 0.25 } },
      { textureQuarterTurn: 3, expected: { u: 0.75, v: 0.75 } },
    ];

    for (const rotation of rotations) {
      expect(
        applyTerrainTextureRotation("cameraAlignedLegacy", {
          x: 0,
          y: 0,
          rotationZRad: 0,
          textureQuarterTurn: rotation.textureQuarterTurn,
        }, {
          u: 0.25,
          v: 0.75,
        }),
      ).toEqual(rotation.expected);
    }
  });

  it("samples discrete texture texels without interpolation and clamps to edges", () => {
    const texture = createTexture(2, 2, [
      11, 11, 11, 255,
      22, 22, 22, 255,
      33, 33, 33, 255,
      44, 44, 44, 255,
    ]);

    expect(sampleTerrainTexture(texture, { u: 0.1, v: 0.9 })).toEqual({ red: 11, green: 11, blue: 11, alpha: 255 });
    expect(sampleTerrainTexture(texture, { u: 0.9, v: 0.9 })).toEqual({ red: 22, green: 22, blue: 22, alpha: 255 });
    expect(sampleTerrainTexture(texture, { u: 0.1, v: 0.1 })).toEqual({ red: 33, green: 33, blue: 33, alpha: 255 });
    expect(sampleTerrainTexture(texture, { u: -1, v: 2 })).toEqual({ red: 11, green: 11, blue: 11, alpha: 255 });
    expect(sampleTerrainTexture(texture, { u: 2, v: -1 })).toEqual({ red: 44, green: 44, blue: 44, alpha: 255 });
  });

  it("throws when an owned pixel would reveal fully transparent RGB", () => {
    const transparentTexture = createTexture(1, 1, [10, 20, 30, 0]);

    expect(() => rasterizeTerrainFrame(transparentTexture, 0, terrainSceneSpec, "cameraAlignedLegacy")).toThrow(
      /fully transparent RGB/u,
    );
  });

  it("renders opaque ownership coverage for visible terrain pixels", () => {
    const solidTexture = createTexture(1, 1, [90, 120, 150, 255]);
    const frame = rasterizeTerrainFrame(solidTexture, 0, terrainSceneSpec, "cameraAlignedLegacy");

    let sawOpaquePixel = false;
    for (let pixelIndex = 0; pixelIndex < frame.width * frame.height; pixelIndex++) {
      const alpha = frame.data[pixelIndex * 4 + 3];
      if (alpha === 255) {
        sawOpaquePixel = true;
        expect(frame.data[pixelIndex * 4]).toBe(90);
        expect(frame.data[pixelIndex * 4 + 1]).toBe(120);
        expect(frame.data[pixelIndex * 4 + 2]).toBe(150);
      } else {
        expect(alpha).toBe(0);
      }
    }

    expect(sawOpaquePixel).toBe(true);
  });

  it("assigns the explicit saddle half-turns required by the scene contract", () => {
    const northSouthPose = terrainSceneSpec.poses[17];
    if (northSouthPose === undefined) throw new Error("Missing SLOPE_NS pose.");
    const eastWestPose = terrainSceneSpec.poses[18];
    if (eastWestPose === undefined) throw new Error("Missing SLOPE_EW pose.");

    expect(northSouthPose.textureQuarterTurn).toBe(2);
    expect(
      applyTerrainTextureRotation("cameraAlignedLegacy", northSouthPose, {
        u: 0.25,
        v: 0.75,
      }),
    ).toEqual({ u: 0.75, v: 0.25 });

    expect(eastWestPose.textureQuarterTurn).toBe(1);
    expect(
      applyTerrainTextureRotation("cameraAlignedLegacy", eastWestPose, {
        u: 0.25,
        v: 0.75,
      }),
    ).toEqual({ u: 0.25, v: 0.25 });
  });
});
