import * as THREE from "three/src/Three.WebGPU.js";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THREE_LIGHTING_SETTINGS,
  getCheckerAtlasParity,
  decodeSurfaceHeight,
  decodeSurfaceNormal,
  getMapUvForScreenPoint,
  getTerrainDebugAlpha,
  getSurfaceCheckerCellSize,
  getSurfaceCheckerParity,
  getSurfaceHeightImpactOnScreenY,
  getSunDirectionVector,
  getTerrainShade,
  isSurfaceCheckerMismatch,
  solveSurfaceGroundY,
} from "../../three/app.ts";
import { sampleMap } from "./fixtures.ts";

describe("three terrain math", () => {
  it("keeps the default sun direction aligned with the Phaser baseline vector", () => {
    const baselineSunDirection = new THREE.Vector3(0.4, -1.0, 0.7).normalize();
    const threeSunDirection = getSunDirectionVector(DEFAULT_THREE_LIGHTING_SETTINGS);

    expect(threeSunDirection.distanceTo(baselineSunDirection)).toBeLessThan(1e-12);
  });

  it("maps screen coordinates into terrain UV space", () => {
    const topLeftUv = getMapUvForScreenPoint({ x: 64, y: 32 }, sampleMap);
    const innerUv = getMapUvForScreenPoint({ x: 64, y: 96 }, sampleMap);

    expect(topLeftUv.x).toBeCloseTo(0);
    expect(topLeftUv.y).toBeCloseTo(0);
    expect(innerUv.x).toBeCloseTo(1 / 3);
    expect(innerUv.y).toBeCloseTo(1 / 3);
  });

  it("decodes packed surface heights and solves constant-height ground intersections", () => {
    const surfaceHeight = decodeSurfaceHeight(0.25, 10, 18);
    const surfaceHeightImpactOnScreenY = getSurfaceHeightImpactOnScreenY(sampleMap.tileheight, 16);
    const groundY = solveSurfaceGroundY(100, 0, 32, surfaceHeightImpactOnScreenY, () => 8, 32);

    expect(surfaceHeight).toBeCloseTo(12);
    expect(surfaceHeightImpactOnScreenY).toBe(5);
    expect(groundY).toBeCloseTo(100 + 8 * surfaceHeightImpactOnScreenY, 4);
  });

  it("derives surface checker parity from precision divided by four", () => {
    expect(getSurfaceCheckerCellSize(16)).toBe(4);
    expect(getSurfaceCheckerParity(0, 0, 16)).toBe(0);
    expect(getSurfaceCheckerParity(4, 0, 16)).toBe(1);
    expect(getSurfaceCheckerParity(4, 4, 16)).toBe(0);
  });

  it("derives checker parity from the texture brightness threshold", () => {
    expect(getCheckerAtlasParity(0.9)).toBe(0);
    expect(getCheckerAtlasParity(0.5)).toBe(0);
    expect(getCheckerAtlasParity(0.49)).toBe(1);
  });

  it("highlights only checker mismatches between atlas and surface lookups", () => {
    expect(isSurfaceCheckerMismatch(0.9, 0, 0, 16)).toBe(false);
    expect(isSurfaceCheckerMismatch(0.9, 4, 0, 16)).toBe(true);
    expect(isSurfaceCheckerMismatch(0.2, 4, 0, 16)).toBe(false);
    expect(isSurfaceCheckerMismatch(0.2, 0, 0, 16)).toBe(true);
  });

  it("uses checker alpha instead of beauty alpha in checker debug mode", () => {
    expect(getTerrainDebugAlpha("terrain", 0.75, 0.25)).toBe(0.75);
    expect(getTerrainDebugAlpha("checker-compare", 0.75, 0.25)).toBe(0.25);
  });

  it("decodes global surface normals and applies ambient diffuse shading", () => {
    const surfaceNormal = decodeSurfaceNormal(0.5, 0.5, 1.0);
    const straightUpSun = new THREE.Vector3(0, 0, 1);
    const horizonSun = new THREE.Vector3(1, 0, 0);

    expect(surfaceNormal.x).toBeCloseTo(0);
    expect(surfaceNormal.y).toBeCloseTo(0);
    expect(surfaceNormal.z).toBeCloseTo(1);
    expect(getTerrainShade(surfaceNormal, straightUpSun, 0.6)).toBeCloseTo(1.0);
    expect(getTerrainShade(surfaceNormal, horizonSun, 0.6)).toBeCloseTo(0.6);
  });
});
