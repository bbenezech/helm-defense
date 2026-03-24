import { describe, expect, it } from "vitest";
import { DEFAULT_THREE_TERRAIN_SETTINGS } from "../../three/app.ts";
import { evaluateBiomeBlend, sampleBiomeBlendNoise, sampleValueNoise } from "../../three/biome-blend.ts";
import type { BiomeBlendContributions } from "../../three/biome-blend.ts";
import type { BiomeCellGrid } from "../../three/chunks.ts";
import type { ThreeTerrainSettings } from "../../three/app.ts";

function createBiomeCells(width: number, height: number, data: number[]): BiomeCellGrid {
  return {
    data: new Uint8Array(data),
    width,
    height,
  };
}

function createTerrainSettings(
  cornerNoiseScale: number,
  cornerNoiseAmplitude: number,
  octaveScale: number,
  octaveMix: number,
): ThreeTerrainSettings {
  return {
    cornerNoiseScale,
    cornerNoiseAmplitude,
    octaveScale,
    octaveMix,
  };
}

function getDefinedContributions(contributions: BiomeBlendContributions) {
  return [...contributions].filter((contribution) => contribution !== null);
}

function getContributionWeight(contributions: BiomeBlendContributions, biomeIndex: number): number {
  for (const contribution of getDefinedContributions(contributions)) {
    if (contribution.biomeIndex === biomeIndex) {
      return contribution.weight;
    }
  }

  return 0;
}

function getContributionWeightSum(contributions: BiomeBlendContributions): number {
  return getDefinedContributions(contributions).reduce((totalWeight, contribution) => totalWeight + contribution.weight, 0);
}

describe("biome border blending", () => {
  it("collapses to a single biome contribution when all four corners match", () => {
    const biomeCells = createBiomeCells(2, 2, [3, 3, 3, 3]);
    const contributions = evaluateBiomeBlend(biomeCells, { x: 0.2, y: 0.2 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const definedContributions = getDefinedContributions(contributions);
    const firstContribution = definedContributions[0];

    expect(definedContributions).toHaveLength(1);
    if (firstContribution === undefined) {
      throw new Error("Expected a collapsed biome contribution.");
    }
    expect(firstContribution.biomeIndex).toBe(3);
    expect(firstContribution.weight).toBeCloseTo(1, 12);
  });

  it("keeps collapsed contribution weights normalized to 1 at a four-way corner", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 2, 3]);
    const contributions = evaluateBiomeBlend(biomeCells, { x: 1, y: 1 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const definedContributions = getDefinedContributions(contributions);

    expect(definedContributions).toHaveLength(4);
    expect(getContributionWeightSum(contributions)).toBeCloseTo(1, 12);
    expect(definedContributions.every((contribution) => contribution.weight > 0)).toBe(true);
  });

  it("collapses repeated biome ids before returning contributions", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 1, 1]);
    const contributions = evaluateBiomeBlend(biomeCells, { x: 1, y: 1 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const definedContributions = getDefinedContributions(contributions);
    const biomeIndices = definedContributions.map((contribution) => contribution.biomeIndex).sort((left, right) => left - right);

    expect(definedContributions).toHaveLength(2);
    expect(biomeIndices).toEqual([0, 1]);
    expect(getContributionWeightSum(contributions)).toBeCloseTo(1, 12);
  });

  it("keeps a straight seam coherent across both sides of the same border", () => {
    const biomeCells = createBiomeCells(2, 1, [0, 1]);
    const leftContributions = evaluateBiomeBlend(biomeCells, { x: 0.95, y: 0.5 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const rightContributions = evaluateBiomeBlend(biomeCells, { x: 1.05, y: 0.5 }, DEFAULT_THREE_TERRAIN_SETTINGS);

    expect(getContributionWeight(leftContributions, 0)).toBeGreaterThan(getContributionWeight(rightContributions, 0));
    expect(getContributionWeight(leftContributions, 1)).toBeLessThan(getContributionWeight(rightContributions, 1));
    expect(getContributionWeightSum(leftContributions)).toBeCloseTo(1, 12);
    expect(getContributionWeightSum(rightContributions)).toBeCloseTo(1, 12);
  });

  it("keeps four-way corners multi-way instead of collapsing to one biome winner", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 2, 3]);
    const contributions = evaluateBiomeBlend(biomeCells, { x: 1, y: 1 }, DEFAULT_THREE_TERRAIN_SETTINGS);

    expect(getDefinedContributions(contributions)).toHaveLength(4);
  });

  it("keeps noise deterministic for a fixed world coordinate", () => {
    const first = sampleValueNoise({ x: 3.25, y: 7.75 });
    const second = sampleValueNoise({ x: 3.25, y: 7.75 });

    expect(first).toBeCloseTo(second, 12);
  });

  it("clamps the biome grid at map edges instead of producing gaps", () => {
    const biomeCells = createBiomeCells(1, 1, [2]);
    const contributions = evaluateBiomeBlend(biomeCells, { x: -0.25, y: -0.25 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const definedContributions = getDefinedContributions(contributions);
    const firstContribution = definedContributions[0];

    expect(definedContributions).toHaveLength(1);
    if (firstContribution === undefined) {
      throw new Error("Expected a clamped biome contribution.");
    }
    expect(firstContribution.biomeIndex).toBe(2);
    expect(firstContribution.weight).toBeCloseTo(1, 12);
  });

  it("introduces visible noise variation along the same border", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 0, 1]);
    const topBorder = evaluateBiomeBlend(biomeCells, { x: 1, y: 0.6 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const bottomBorder = evaluateBiomeBlend(biomeCells, { x: 1, y: 1.4 }, DEFAULT_THREE_TERRAIN_SETTINGS);

    expect(getContributionWeight(topBorder, 1)).not.toBeCloseTo(getContributionWeight(bottomBorder, 1), 6);
  });

  it("keeps the default preset equivalent to an explicit settings object", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 2, 3]);
    const explicitDefaultSettings = createTerrainSettings(6, 0.22, 2.03, 0.68);
    const defaultContributions = evaluateBiomeBlend(biomeCells, { x: 0.82, y: 0.91 }, DEFAULT_THREE_TERRAIN_SETTINGS);
    const explicitContributions = evaluateBiomeBlend(biomeCells, { x: 0.82, y: 0.91 }, explicitDefaultSettings);

    expect(explicitContributions).toEqual(defaultContributions);
  });

  it("changes biome contribution weights when terrain blend settings change", () => {
    const biomeCells = createBiomeCells(2, 2, [0, 1, 2, 3]);
    const coarseSettings = createTerrainSettings(2, 0.05, 1.2, 0.2);
    const strongSettings = createTerrainSettings(12, 0.4, 3.5, 0.9);
    const coarseContributions = evaluateBiomeBlend(biomeCells, { x: 0.82, y: 0.91 }, coarseSettings);
    const strongContributions = evaluateBiomeBlend(biomeCells, { x: 0.82, y: 0.91 }, strongSettings);

    expect(coarseContributions).not.toEqual(strongContributions);
  });

  it("changes the sampled blend noise when octave scale changes", () => {
    const lowOctaveScale = createTerrainSettings(6, 0.22, 1.2, 0.68);
    const highOctaveScale = createTerrainSettings(6, 0.22, 3.7, 0.68);
    const lowOctaveNoise = sampleBiomeBlendNoise({ x: 4.25, y: 1.75 }, lowOctaveScale);
    const highOctaveNoise = sampleBiomeBlendNoise({ x: 4.25, y: 1.75 }, highOctaveScale);

    expect(lowOctaveNoise).not.toBeCloseTo(highOctaveNoise, 6);
  });

  it("changes the sampled blend noise when octave mix changes", () => {
    const lowOctaveMix = createTerrainSettings(6, 0.22, 2.03, 0.05);
    const highOctaveMix = createTerrainSettings(6, 0.22, 2.03, 0.95);
    const lowOctaveNoise = sampleBiomeBlendNoise({ x: 4.25, y: 1.75 }, lowOctaveMix);
    const highOctaveNoise = sampleBiomeBlendNoise({ x: 4.25, y: 1.75 }, highOctaveMix);

    expect(lowOctaveNoise).not.toBeCloseTo(highOctaveNoise, 6);
  });
});
