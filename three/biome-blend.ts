import type { ThreeTerrainSettings } from "./app.ts";
import type { BiomeCellGrid } from "./chunks.ts";
import type { Point2 } from "./projection.ts";

export type BiomeBlendContribution = { biomeIndex: number; weight: number };

export type BiomeBlendContributions = [
  BiomeBlendContribution | null,
  BiomeBlendContribution | null,
  BiomeBlendContribution | null,
  BiomeBlendContribution | null,
];

function fract(value: number): number {
  return value - Math.floor(value);
}

function clampUnitInterval(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    throw new Error("Biome blend smoothstep edges must not be identical.");
  }

  const normalized = (value - edge0) / (edge1 - edge0);
  const clamped = normalized < 0 ? 0 : normalized > 1 ? 1 : normalized;
  return clamped * clamped * (3 - 2 * clamped);
}

function hashNoise(point: Point2): number {
  return fract(Math.sin(point.x * 127.1 + point.y * 311.7) * 43_758.545_312_3);
}

export function sampleValueNoise(point: Point2): number {
  const cellX = Math.floor(point.x);
  const cellY = Math.floor(point.y);
  const fractX = fract(point.x);
  const fractY = fract(point.y);
  const smoothX = fractX * fractX * (3 - 2 * fractX);
  const smoothY = fractY * fractY * (3 - 2 * fractY);
  const bottomLeft = hashNoise({ x: cellX, y: cellY });
  const bottomRight = hashNoise({ x: cellX + 1, y: cellY });
  const topLeft = hashNoise({ x: cellX, y: cellY + 1 });
  const topRight = hashNoise({ x: cellX + 1, y: cellY + 1 });
  const bottom = bottomLeft + (bottomRight - bottomLeft) * smoothX;
  const top = topLeft + (topRight - topLeft) * smoothX;
  return bottom + (top - bottom) * smoothY;
}

export function sampleBiomeBlendNoise(point: Point2, settings: ThreeTerrainSettings): number {
  const octaveA = sampleValueNoise(point);
  const octaveB = sampleValueNoise({
    x: point.x * settings.octaveScale + 19.19,
    y: point.y * settings.octaveScale - 7.73,
  });
  return octaveA * (1 - settings.octaveMix) + octaveB * settings.octaveMix;
}

function getClampedBiomeCellIndex(grid: BiomeCellGrid, mapX: number, mapY: number): number {
  if (grid.width <= 0 || grid.height <= 0) {
    throw new Error("Biome cell grid must not be empty.");
  }

  const clampedX = mapX < 0 ? 0 : mapX >= grid.width ? grid.width - 1 : mapX;
  const clampedY = mapY < 0 ? 0 : mapY >= grid.height ? grid.height - 1 : mapY;
  const biomeIndex = grid.data[clampedY * grid.width + clampedX];

  if (biomeIndex === undefined) {
    throw new Error(`Missing biome cell at clamped coordinate (${clampedX}, ${clampedY}).`);
  }

  return biomeIndex;
}

function accumulateContribution(
  contributions: BiomeBlendContributions,
  biomeIndex: number,
  weight: number,
) {
  if (weight <= 0) {
    return;
  }

  const contribution0 = contributions[0];
  if (contribution0 !== null && contribution0.biomeIndex === biomeIndex) {
    contributions[0] = { biomeIndex, weight: contribution0.weight + weight };
    return;
  }

  const contribution1 = contributions[1];
  if (contribution1 !== null && contribution1.biomeIndex === biomeIndex) {
    contributions[1] = { biomeIndex, weight: contribution1.weight + weight };
    return;
  }

  const contribution2 = contributions[2];
  if (contribution2 !== null && contribution2.biomeIndex === biomeIndex) {
    contributions[2] = { biomeIndex, weight: contribution2.weight + weight };
    return;
  }

  const contribution3 = contributions[3];
  if (contribution3 !== null && contribution3.biomeIndex === biomeIndex) {
    contributions[3] = { biomeIndex, weight: contribution3.weight + weight };
    return;
  }

  if (contribution0 === null) {
    contributions[0] = { biomeIndex, weight };
    return;
  }
  if (contribution1 === null) {
    contributions[1] = { biomeIndex, weight };
    return;
  }
  if (contribution2 === null) {
    contributions[2] = { biomeIndex, weight };
    return;
  }
  if (contribution3 === null) {
    contributions[3] = { biomeIndex, weight };
    return;
  }

  throw new Error("Biome blend contributions exceeded the 2x2 corner neighborhood limit.");
}

function normalizeContributions(contributions: BiomeBlendContributions): BiomeBlendContributions {
  const contribution0 = contributions[0];
  const contribution1 = contributions[1];
  const contribution2 = contributions[2];
  const contribution3 = contributions[3];
  const totalWeight =
    (contribution0 === null ? 0 : contribution0.weight) +
    (contribution1 === null ? 0 : contribution1.weight) +
    (contribution2 === null ? 0 : contribution2.weight) +
    (contribution3 === null ? 0 : contribution3.weight);

  if (totalWeight <= 0) {
    throw new Error("Biome blend contributions must have a positive total weight.");
  }

  if (contribution0 !== null) {
    contributions[0] = { biomeIndex: contribution0.biomeIndex, weight: contribution0.weight / totalWeight };
  }
  if (contribution1 !== null) {
    contributions[1] = { biomeIndex: contribution1.biomeIndex, weight: contribution1.weight / totalWeight };
  }
  if (contribution2 !== null) {
    contributions[2] = { biomeIndex: contribution2.biomeIndex, weight: contribution2.weight / totalWeight };
  }
  if (contribution3 !== null) {
    contributions[3] = { biomeIndex: contribution3.biomeIndex, weight: contribution3.weight / totalWeight };
  }

  return contributions;
}

export function evaluateBiomeBlend(
  biomeCells: BiomeCellGrid,
  tileCoord: Point2,
  settings: ThreeTerrainSettings,
): BiomeBlendContributions {
  const shiftedCoord = {
    x: tileCoord.x - 0.5,
    y: tileCoord.y - 0.5,
  };
  const cornerBaseX = Math.floor(shiftedCoord.x);
  const cornerBaseY = Math.floor(shiftedCoord.y);
  const cornerFrac = {
    x: fract(shiftedCoord.x),
    y: fract(shiftedCoord.y),
  };
  const noisePoint = {
    x: tileCoord.x * settings.cornerNoiseScale,
    y: tileCoord.y * settings.cornerNoiseScale,
  };
  const noisyCornerFrac = {
    x: clampUnitInterval(
      cornerFrac.x +
        (sampleBiomeBlendNoise({
          x: noisePoint.x + 17.13,
          y: noisePoint.y - 8.71,
        }, settings) *
          2 -
          1) *
          settings.cornerNoiseAmplitude,
    ),
    y: clampUnitInterval(
      cornerFrac.y +
        (sampleBiomeBlendNoise({
          x: noisePoint.x - 11.41,
          y: noisePoint.y + 23.97,
        }, settings) *
          2 -
          1) *
          settings.cornerNoiseAmplitude,
    ),
  };
  const blendWeight = {
    x: smoothstep(0, 1, noisyCornerFrac.x),
    y: smoothstep(0, 1, noisyCornerFrac.y),
  };
  const weight00 = (1 - blendWeight.x) * (1 - blendWeight.y);
  const weight10 = blendWeight.x * (1 - blendWeight.y);
  const weight01 = (1 - blendWeight.x) * blendWeight.y;
  const weight11 = blendWeight.x * blendWeight.y;
  const contributions: BiomeBlendContributions = [null, null, null, null];

  accumulateContribution(contributions, getClampedBiomeCellIndex(biomeCells, cornerBaseX, cornerBaseY), weight00);
  accumulateContribution(
    contributions,
    getClampedBiomeCellIndex(biomeCells, cornerBaseX + 1, cornerBaseY),
    weight10,
  );
  accumulateContribution(
    contributions,
    getClampedBiomeCellIndex(biomeCells, cornerBaseX, cornerBaseY + 1),
    weight01,
  );
  accumulateContribution(
    contributions,
    getClampedBiomeCellIndex(biomeCells, cornerBaseX + 1, cornerBaseY + 1),
    weight11,
  );

  return normalizeContributions(contributions);
}
