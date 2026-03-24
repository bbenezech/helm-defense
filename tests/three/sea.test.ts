import { describe, expect, it } from "vitest";
import { rotateTerrainNormalToWorld } from "../../three/surface.ts";
import {
  DEFAULT_THREE_SEA_SETTINGS,
  evaluateSeaSurfaceSample,
  evaluateUnderwaterTransmittance,
  evaluateVoronoiEdgeField,
} from "../../three/sea.ts";

function normalizeVector3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) throw new Error("Sea test normal must not be degenerate.");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function dot(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

describe("sea math", () => {
  it("keeps wave evaluation deterministic for a fixed time and point", () => {
    const point = { x: 3.25, y: 1.75 };
    const first = evaluateSeaSurfaceSample(DEFAULT_THREE_SEA_SETTINGS, point, 12.5);
    const second = evaluateSeaSurfaceSample(DEFAULT_THREE_SEA_SETTINGS, point, 12.5);

    expect(second.worldHeight).toBe(first.worldHeight);
    expect(second.worldNormal[0]).toBe(first.worldNormal[0]);
    expect(second.worldNormal[1]).toBe(first.worldNormal[1]);
    expect(second.worldNormal[2]).toBe(first.worldNormal[2]);
    expect(second.crest).toBe(first.crest);
  });

  it("matches the analytic sea normal against a finite-difference reference", () => {
    const waveOnlySettings = {
      ...DEFAULT_THREE_SEA_SETTINGS,
      ripple: {
        ...DEFAULT_THREE_SEA_SETTINGS.ripple,
        normalStrength: 0,
      },
    };
    const point = { x: 2.7, y: 4.2 };
    const timeSeconds = 6.75;
    const epsilon = 0.0005;
    const sample = evaluateSeaSurfaceSample(waveOnlySettings, point, timeSeconds);
    const positiveX = evaluateSeaSurfaceSample(waveOnlySettings, { x: point.x + epsilon, y: point.y }, timeSeconds);
    const negativeX = evaluateSeaSurfaceSample(waveOnlySettings, { x: point.x - epsilon, y: point.y }, timeSeconds);
    const positiveY = evaluateSeaSurfaceSample(waveOnlySettings, { x: point.x, y: point.y + epsilon }, timeSeconds);
    const negativeY = evaluateSeaSurfaceSample(waveOnlySettings, { x: point.x, y: point.y - epsilon }, timeSeconds);
    const dHeightDx = (positiveX.worldHeight - negativeX.worldHeight) / (2 * epsilon);
    const dHeightDy = (positiveY.worldHeight - negativeY.worldHeight) / (2 * epsilon);
    const approximateWorldNormal = rotateTerrainNormalToWorld(normalizeVector3([-dHeightDx, dHeightDy, 1]));

    expect(dot(sample.worldNormal, approximateWorldNormal)).toBeGreaterThan(0.999);
  });

  it("keeps Voronoi edge noise bounded and animated", () => {
    const point = { x: 1.2, y: -0.4 };
    const first = evaluateVoronoiEdgeField(point, 3.5, 0.85, 0.22, 0.35, 2.0, 2);
    const second = evaluateVoronoiEdgeField(point, 3.5, 0.85, 0.22, 0.35, 2.75, 2);

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
    expect(second).toBeGreaterThanOrEqual(0);
    expect(second).toBeLessThanOrEqual(1);
    expect(Math.abs(first - second)).toBeGreaterThan(0.0001);
  });

  it("fades underwater transmittance monotonically with depth", () => {
    const shallow = evaluateUnderwaterTransmittance(0.2, 1.6, 0.92);
    const medium = evaluateUnderwaterTransmittance(1, 1.6, 0.92);
    const deep = evaluateUnderwaterTransmittance(2.5, 1.6, 0.92);

    expect(shallow).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(deep);
    expect(deep).toBeGreaterThanOrEqual(0);
  });
});
