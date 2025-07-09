import { log } from "./log.js";
import { normalizeXYZ, type Vector3 } from "./vector.js";

function wrapIndex(index: number, max: number): number {
  return ((index % max) + max) % max;
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max - 1));
}

/**
 * Performs a horizontal box blur, supporting both clamped and toroidal (wrapping) edges.
 */
function boxBlurH(
  source: number[][],
  target: number[][],
  width: number,
  height: number,
  radius: number,
  invRadius: number,
  getIndex: (index: number, max: number) => number,
): void {
  for (let y = 0; y < height; y++) {
    let sum = 0;

    // Prime the moving average window
    for (let i = -radius; i <= radius; i++) {
      const sampleX = getIndex(i, width);
      sum += source[y][sampleX];
    }

    // Slide the window across the row
    for (let x = 0; x < width; x++) {
      target[y][x] = sum * invRadius;

      // Update the sum for the next window
      const trailingIndex = getIndex(x - radius, width);
      const leadingIndex = getIndex(x + radius + 1, width);

      sum += source[y][leadingIndex] - source[y][trailingIndex];
    }
  }
}

/**
 * Performs a vertical box blur, supporting both clamped and toroidal (wrapping) edges.
 */
function boxBlurV(
  source: number[][],
  target: number[][],
  width: number,
  height: number,
  radius: number,
  invRadius: number,
  getIndex: (index: number, max: number) => number,
): void {
  for (let x = 0; x < width; x++) {
    let sum = 0;

    // Prime the moving average window
    for (let i = -radius; i <= radius; i++) sum += source[getIndex(i, height)][x];

    // Slide the window down the column
    for (let y = 0; y < height; y++) {
      target[y][x] = sum * invRadius;

      // Update the sum for the next window
      const trailingIndex = getIndex(y - radius, height);
      const leadingIndex = getIndex(y + radius + 1, height);

      sum += source[leadingIndex][x] - source[trailingIndex][x];
    }
  }
}

function fastBoxBlurInPlace(
  heightmap: number[][],
  radius: number = 4,
  passes: number = 4,
  toroidal: boolean = false,
): number[][] {
  const height = heightmap.length;
  if (height === 0) return heightmap;
  const width = heightmap[0].length;
  if (width === 0) return heightmap;

  const targetMap: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  const invRadius = 1 / (radius * 2 + 1);
  const getIndex = toroidal ? wrapIndex : clampIndex;

  for (let i = 0; i < passes; i++) {
    boxBlurH(heightmap, targetMap, width, height, radius, invRadius, getIndex);
    boxBlurV(targetMap, heightmap, width, height, radius, invRadius, getIndex);
  }

  return heightmap;
}

/**
 * Applies a fast, multi-pass box blur to a 2D array of numbers.
 *
 * @param heightmap The 2D array of numbers to blur.
 * @param radius The blur radius.
 * @param passes The number of blur passes to apply.
 * @param toroidal If true, the blur will wrap around the edges; otherwise, edges are clamped. Defaults to false.
 * @returns A new 2D array with the blurred data.
 */
export function fastBoxBlur(
  heightmap: number[][],
  radius: number = 4,
  passes: number = 4,
  toroidal: boolean = false,
): number[][] {
  const startsAt = Date.now();
  const result = fastBoxBlurInPlace(
    heightmap.map((row) => [...row]),
    radius,
    passes,
    toroidal,
  );
  log(
    "fastBoxBlur",
    startsAt,
    `Blurred heightmap (${heightmap[0].length}x${heightmap.length}, radius=${radius}, passes=${passes}, toroidal=${toroidal})`,
  );

  return result;
}

/**
 * Applies a fast, multi-pass box blur to a 2D array of vectors (e.g., a normal map).
 *
 * @param normalmap The 2D array of vectors to blur.
 * @param radius The blur radius.
 * @param passes The number of blur passes.
 * @param toroidal If true, the blur will wrap around the edges; otherwise, edges are clamped. Defaults to false.
 * @returns A new 2D array with the blurred vectors.
 */
export function fastBoxBlurVectors(
  normalmap: Vector3[][],
  radius: number,
  passes: number = 3,
  toroidal: boolean = false,
): Vector3[][] {
  const startsAt = Date.now();
  const height = normalmap.length;
  if (height === 0) return [];
  const width = normalmap[0].length;
  if (width === 0) return [];
  const out: Vector3[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => [0, 0, 0]));

  const blurredX = fastBoxBlurInPlace(
    normalmap.map((row) => row.map((v) => v[0])),
    radius,
    passes,
    toroidal,
  );
  const blurredY = fastBoxBlurInPlace(
    normalmap.map((row) => row.map((v) => v[1])),
    radius,
    passes,
    toroidal,
  );
  const blurredZ = fastBoxBlurInPlace(
    normalmap.map((row) => row.map((v) => v[2])),
    radius,
    passes,
    toroidal,
  );
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) normalizeXYZ(blurredX[y][x], blurredY[y][x], blurredZ[y][x], out[y][x]);

  log(
    "fastBoxBlurVectors",
    startsAt,
    `Blurred normalmap (${width}x${height}, radius=${radius}, passes=${passes}, toroidal=${toroidal})`,
  );

  return out;
}
