import * as THREE from "three/src/Three.WebGPU.js";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THREE_LIGHTING_SETTINGS,
  decodeMetadataNormal,
  getSunDirectionVector,
  getTerrainShade,
} from "../../three/app.ts";

describe("three lighting", () => {
  it("keeps the default sun direction aligned with the Phaser baseline vector", () => {
    const baselineSunDirection = new THREE.Vector3(0.4, -1.0, 0.7).normalize();
    const threeSunDirection = getSunDirectionVector(DEFAULT_THREE_LIGHTING_SETTINGS);

    expect(threeSunDirection.distanceTo(baselineSunDirection)).toBeLessThan(1e-12);
  });

  it("decodes metadata normals and applies ambient diffuse shading", () => {
    const surfaceNormal = decodeMetadataNormal(0.5, 0.5, 1.0);
    const straightUpSun = new THREE.Vector3(0, 0, 1);
    const horizonSun = new THREE.Vector3(1, 0, 0);

    expect(surfaceNormal.x).toBeCloseTo(0);
    expect(surfaceNormal.y).toBeCloseTo(0);
    expect(surfaceNormal.z).toBeCloseTo(1);
    expect(getTerrainShade(surfaceNormal, straightUpSun, 0.6)).toBeCloseTo(1.0);
    expect(getTerrainShade(surfaceNormal, horizonSun, 0.6)).toBeCloseTo(0.6);
  });
});
