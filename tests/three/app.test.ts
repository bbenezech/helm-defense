import * as THREE from "three/src/Three.WebGPU.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_THREE_LIGHTING_SETTINGS, getSurfaceSampleOffsetY, getSunDirectionVector } from "../../three/app.ts";
import { sampleMap, sampleTileset } from "./fixtures.ts";

describe("three terrain math", () => {
  it("keeps the default sun direction aligned with the Phaser baseline vector", () => {
    const baselineSunDirection = new THREE.Vector3(0.4, -1, 0.7).normalize();
    const threeSunDirection = getSunDirectionVector(DEFAULT_THREE_LIGHTING_SETTINGS);

    expect(threeSunDirection.distanceTo(baselineSunDirection)).toBeLessThan(1e-12);
  });

  it("offsets global surface shading by the tileset frame overhang", () => {
    expect(getSurfaceSampleOffsetY(sampleMap, sampleTileset.tileheight)).toBe(32);
  });
});
