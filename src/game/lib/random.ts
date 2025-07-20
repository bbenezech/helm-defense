import { randomNormal as d3RandomNormal } from "d3-random";

// randomAround(0, 1) between -1 and 1
export function randomAround(value: number, leeway: number) {
  return value + Math.random() * leeway * 2 - leeway;
}

export function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

const randomNormalGenerators: Record<number, Record<number, () => number>> = {};

export function randomNormal(mean: number, std: number): number {
  if (!randomNormalGenerators[mean]) randomNormalGenerators[mean] = {};
  if (!randomNormalGenerators[mean][std]) randomNormalGenerators[mean][std] = d3RandomNormal(mean, std);

  return randomNormalGenerators[mean][std]();
}
