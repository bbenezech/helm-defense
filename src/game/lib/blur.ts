import { log } from "./log.js";
import { normalizeXYZ, type Vector3 } from "./vector.js";

function wrapIndex(index: number, max: number): number {
  return ((index % max) + max) % max;
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max - 1));
}

type GetIndexFunction = (index: number, max: number) => number;

class ImageBuffer {
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly channels: number;

  constructor(width: number, height: number, channels: number) {
    this.data = new Float32Array(width * height * channels);
    this.width = width;
    this.height = height;
    this.channels = channels;
  }

  clone(): ImageBuffer {
    const newBuffer = new ImageBuffer(this.width, this.height, this.channels);
    newBuffer.data.set(this.data);
    return newBuffer;
  }
}

// --- Internal Blur Implementations ---

/**
 * Performs a horizontal box blur using a provided edge-handling function.
 */
function boxBlurH(
  source: ImageBuffer,
  out: ImageBuffer,
  radius: number,
  invRadius: number,
  getIndex: GetIndexFunction,
) {
  const { width, height, channels } = source;
  const sourceData = source.data;
  const outData = out.data;

  for (let y = 0; y < height; y++) {
    const yOffset = y * width * channels;
    for (let c = 0; c < channels; c++) {
      let sum = 0;
      // 1. Prime the moving average window
      for (let index = -radius; index <= radius; index++) {
        const x = getIndex(index, width);
        sum += sourceData[yOffset + x * channels + c];
      }
      // 2. Slide the window across the row
      for (let x = 0; x < width; x++) {
        outData[yOffset + x * channels + c] = sum * invRadius;
        const trailX = getIndex(x - radius, width);
        const leadX = getIndex(x + radius + 1, width);
        sum += sourceData[yOffset + leadX * channels + c] - sourceData[yOffset + trailX * channels + c];
      }
    }
  }
}

/**
 * Performs a vertical box blur using a provided edge-handling function.
 */
function boxBlurV(
  source: ImageBuffer,
  out: ImageBuffer,
  radius: number,
  invRadius: number,
  getIndex: GetIndexFunction,
) {
  const { width, height, channels } = source;
  const sourceData = source.data;
  const outData = out.data;
  const widthByChannels = width * channels;

  for (let x = 0; x < width; x++) {
    for (let c = 0; c < channels; c++) {
      const xOffset = x * channels + c;
      let sum = 0;
      // 1. Prime the window
      for (let index = -radius; index <= radius; index++) {
        const y = getIndex(index, height);
        sum += sourceData[y * widthByChannels + xOffset];
      }
      // 2. Slide the window
      for (let y = 0; y < height; y++) {
        outData[y * widthByChannels + xOffset] = sum * invRadius;
        const trailY = getIndex(y - radius, height);
        const leadY = getIndex(y + radius + 1, height);
        sum += sourceData[leadY * widthByChannels + xOffset] - sourceData[trailY * widthByChannels + xOffset];
      }
    }
  }
}

// --- Main Orchestrator Function ---

/**
 * Core blur logic that orchestrates ping-ponging between buffers.
 */
function blurBuffer(source: ImageBuffer, radius: number, passes: number, toroidal: boolean): void {
  const getIndex = toroidal ? wrapIndex : clampIndex;

  // We use two buffers and "ping-pong" between them to avoid allocating new memory on each pass.
  const writeBuffer = new ImageBuffer(source.width, source.height, source.channels);

  const invRadius = 1 / (radius * 2 + 1);

  for (let index = 0; index < passes; index++) {
    // Horizontal pass reads from `readBuffer` and writes to `writeBuffer`
    boxBlurH(source, writeBuffer, radius, invRadius, getIndex);
    // Vertical pass reads from `writeBuffer` and writes to `readBuffer`
    boxBlurV(writeBuffer, source, radius, invRadius, getIndex);
  }

  // The final, complete result is always in `source` after the final vertical pass.
}

// --- Public API Functions ---

/**
 * Applies a fast, multi-pass box blur to a 2D array of numbers (heightmap).
 * @returns A new 2D array `number[][]` with the blurred data.
 */
export function fastBoxBlur(
  heightmap: number[][],
  radius: number = 4,
  passes: number = 4,
  toroidal: boolean = false,
): number[][] {
  const startsAt = Date.now();
  const height = heightmap.length;
  if (height === 0) return [];
  const width = heightmap[0].length;
  if (width === 0) return [];

  // 1. Convert user-friendly 2D array to our performant internal format.
  const sourceBuffer = new ImageBuffer(width, height, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sourceBuffer.data[y * width + x] = heightmap[y][x];
    }
  }

  // 2. Run the highly optimized blur logic.
  blurBuffer(sourceBuffer, radius, passes, toroidal);

  // 3. Convert back to the user-friendly 2D array format.
  const outMap: number[][] = Array.from({ length: height }, () => Array.from({ length: width }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      outMap[y][x] = sourceBuffer.data[y * width + x];
    }
  }

  log(
    "fastBoxBlur",
    startsAt,
    `Blurred heightmap (${width}x${height}, radius=${radius}, passes=${passes}, toroidal=${toroidal})`,
  );

  return outMap;
}

/**
 * Applies a fast, multi-pass box blur to a normal map.
 * @returns A new 2D array `Vector3[][]` with the blurred and re-normalized vectors.
 */
export function fastBoxBlurVectors(
  vector3s: Vector3[][],
  radius: number,
  passes: number = 3,
  toroidal: boolean = false,
): Vector3[][] {
  const startsAt = Date.now();

  const height = vector3s.length;
  if (height === 0) return [];
  const width = vector3s[0].length;
  if (width === 0) return [];

  // 1. Convert to performant internal format (interleaved Float32Array).
  const sourceBuffer = new ImageBuffer(width, height, 3);
  let index = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = vector3s[y][x];
      sourceBuffer.data[index++] = v[0];
      sourceBuffer.data[index++] = v[1];
      sourceBuffer.data[index++] = v[2];
    }
  }

  // 2. Run the blur on the interleaved vector data.
  blurBuffer(sourceBuffer, radius, passes, toroidal);

  // 3. Post-process: Convert back to Vector3[][] and re-normalize all vectors.
  const out: Vector3[][] = Array.from({ length: height }, () => Array.from({ length: width }));
  const resultData = sourceBuffer.data;
  let index_ = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y][x] = normalizeXYZ(resultData[index_], resultData[index_ + 1], resultData[index_ + 2], [0, 0, 0]);
      index_ += 3;
    }
  }

  log(
    "fastBoxBlurVectors",
    startsAt,
    `Blurred normalmap (${width}x${height}, radius=${radius}, passes=${passes}, toroidal=${toroidal})`,
  );

  return out;
}
