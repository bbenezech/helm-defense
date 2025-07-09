import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import alea from "alea";
import { cross, dot, multiplyMatrix3x3Vec3, normalize, scale, subtract, type Vector3 } from "./vector.js";
import { log } from "./log.js";

export type Heightmap = number[][];
export type Normalmap = Vector3[][];
export type RgbaBuffer = { data: Uint8ClampedArray; width: number; height: number };
export function fbm2d(noise2D: NoiseFunction2D, octaves: number): NoiseFunction2D {
  return function fbm2dFn(x: number, y: number) {
    let value = 0.0;
    let amplitude = 1;
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x * 0.07, y * 0.07) * amplitude;
      x *= 10;
      y *= 10;
      amplitude *= 0.9;
    }
    return value;
  };
}
// Generates a tilable heightmap
// height is an integer between 0 and maxValue (inclusive)
// each height can connect to its 4 cardinal neighbors with a maximum difference of 1
// after normalization to 0-2, this rule implies that the heightmap can be tiled on each minimum square of 4 values with 19 variants
// 0 0 | 1 2 | 2 1 | 1 0 | 0 1 | 0 1 | 1 0 | 0 0 | 0 0 | 1 0 | 0 1 | 1 1 | 1 1 | 0 1 | 1 0 | 1 1 | 0 0 | 1 0 | 0 1
// 0 0 | 0 1 | 1 0 | 2 1 | 1 2 | 0 0 | 0 0 | 1 0 | 0 1 | 0 1 | 1 0 | 0 1 | 1 0 | 1 1 | 1 1 | 0 0 | 1 1 | 1 0 | 0 1
export function generateTilableHeightmap({
  tileWidth,
  tileHeight,
  maxValue,
}: {
  tileWidth: number;
  tileHeight: number;
  maxValue: number;
}): Heightmap {
  const startsAt = Date.now();
  const step = 1;
  const height = tileHeight + 1;
  const width = tileWidth + 1;

  const heightmap: Heightmap = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));
  const noise2D = createNoise2D(alea("1"));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const leftValue = x > 0 ? heightmap[y][x - 1] : 0;
      const topValue = y > 0 ? heightmap[y - 1][x] : 0;
      const minAllowed = Math.max(0, leftValue - step, topValue - step);
      const maxAllowed = Math.min(maxValue, leftValue + step, topValue + step);
      const noise = (noise2D(x * 0.1, y * 0.1) + 1) / 2;

      heightmap[y][x] = Math.round(Math.max(minAllowed, noise * maxAllowed));
    }
  }

  log(`generateTilableHeightmap`, startsAt, `Generated tilable heightmap (${width}x${height}, maxValue=${maxValue})`);

  return heightmap;
}

export function heightmapToNormalmap(heightmap: Heightmap, kernelSize: number = 3): Normalmap {
  const startsAt = Date.now();
  const height = heightmap.length;
  if (height === 0) return [];
  const width = heightmap[0].length;
  if (width === 0) return [];

  if (kernelSize < 1) throw new Error("kernelSize must be an integer greater than or equal to 1.");
  const normalmap: Normalmap = Array.from({ length: height }, () => Array(width).fill([0, 0, 1]));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const horizontalValues: number[] = [];
      const verticalValues: number[] = [];

      for (let i = -kernelSize; i <= kernelSize; i++) {
        if (heightmap[y][x + i] !== undefined) horizontalValues.push(heightmap[y][x + i]);
        if (heightmap[y + i] !== undefined) verticalValues.push(heightmap[y + i][x]);
      }
      const dx_pixels = horizontalValues.length - 1;
      const dy_pixels = verticalValues.length - 1;
      const dz_dx = dx_pixels > 0 ? horizontalValues[dx_pixels] - horizontalValues[0] : 0;
      const dz_dy = dy_pixels > 0 ? verticalValues[dy_pixels] - verticalValues[0] : 0;

      const normal: [number, number, number] = [
        dx_pixels > 0 ? -dz_dx / dx_pixels : 0,
        dy_pixels > 0 ? dz_dy / dy_pixels : 0,
        1.0,
      ];

      const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
      if (len > 0) {
        normal[0] /= len;
        normal[1] /= len;
        normal[2] /= len;
      }

      normalmap[y][x] = normal;
    }
  }

  log(
    `heightmapToNormalmap`,
    startsAt,
    `Generated normalmap from heightmap (${width}x${height}, kernelSize=${kernelSize})`,
  );

  return normalmap;
}

export function rgbaBufferToHeightmap(rgbaBuffer: RgbaBuffer): Heightmap {
  const startsAt = Date.now();
  const { data, width, height } = rgbaBuffer;
  const heightmap: Heightmap = Array.from({ length: height }, () => Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      // Calculate luminance (perceived brightness) to create the height value.
      // This formula is more accurate than a simple average (r+g+b)/3.
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      heightmap[y][x] = luminance;
    }
  }

  log(`rgbaBufferToHeightmap`, startsAt, `Converted RGBA buffer to heightmap (${width}x${height})`);

  return heightmap;
}

export function heightmapToRgbaBuffer(heightmap: Heightmap) {
  const startsAt = Date.now();
  const height = heightmap.length;
  if (height === 0) return { data: new Uint8ClampedArray(), width: 0, height: 0 };

  const width = heightmap[0].length;
  if (width === 0) return { data: new Uint8ClampedArray(), width: 0, height: 0 };

  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = heightmap[y][x];
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  const range = max - min;
  const invRange = range > 0 ? 1.0 / range : 0;
  const buffer = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;

      // Normalize the height value to the [0, 1] range, then scale to [0, 255]
      const normalizedValue = (heightmap[y][x] - min) * invRange;
      const colorValue = normalizedValue * 255;

      buffer[index] = colorValue; // R
      buffer[index + 1] = colorValue; // G
      buffer[index + 2] = colorValue; // B
      buffer[index + 3] = 255; // A (fully opaque)
    }
  }

  log("heightmapToRgbaBuffer", startsAt, `Converted heightmap to RGBA buffer (${width}x${height})`);

  return { data: buffer, width, height };
}

export function normalmapToRgbaBuffer(normalmap: Normalmap): RgbaBuffer {
  const startsAt = Date.now();
  const height = normalmap.length;
  if (height === 0) return { data: new Uint8ClampedArray(), width: 0, height: 0 };
  const width = normalmap[0].length;
  if (width === 0) return { data: new Uint8ClampedArray(), width: 0, height: height };

  // Create a flat buffer for RGBA data. 4 bytes per pixel (R, G, B, A).
  const buffer = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const normal = normalmap[y][x];
      const index = (y * width + x) * 4;

      // Map the normal vector from the [-1, 1] range to the [0, 255] color range.
      // Uint8ClampedArray will automatically clamp values to the 0-255 range.
      buffer[index] = (normal[0] * 0.5 + 0.5) * 255; // R
      buffer[index + 1] = (normal[1] * 0.5 + 0.5) * 255; // G
      buffer[index + 2] = (normal[2] * 0.5 + 0.5) * 255; // B
      buffer[index + 3] = 255; // A (fully opaque)
    }
  }

  log(`normalmapToRgbaBuffer`, startsAt, `Converted normalmap to RGBA buffer (${width}x${height})`);
  return { data: buffer, width, height };
}

export function addTileNormalmapToGlobalNormalmap(
  globalNormalmap: Normalmap,
  tileNormalmap: Normalmap,
  pixelsPerTile: number,
  detailStrength: number = 1.0,
): Normalmap {
  const startsAt = Date.now();
  const globalHeight = globalNormalmap.length;
  if (globalHeight === 0) return [];
  const globalWidth = globalNormalmap[0].length;
  const tileHeight = tileNormalmap.length;
  if (tileHeight === 0) return globalNormalmap;
  const tileWidth = tileNormalmap[0].length;
  if (pixelsPerTile <= 0) throw new Error("pixelsPerTile must be greater than 0.");
  const initial_T: Vector3 = [1, 0, 0];
  const resultNormalmap: Normalmap = Array.from({ length: globalHeight }, () =>
    Array.from({ length: globalWidth }, () => [0, 0, 0]),
  );
  const B: Vector3 = [0, 0, 0];
  const T: Vector3 = [0, 0, 0];

  for (let y = 0; y < globalHeight; y++) {
    for (let x = 0; x < globalWidth; x++) {
      // Get the world-space base normal (N) from the global map.
      const N = globalNormalmap[y][x];

      // Get the tangent-space detail normal (D_ts) from the tile map.
      const tileX = Math.floor(((x / pixelsPerTile) * tileWidth) % tileWidth);
      const tileY = Math.floor(((y / pixelsPerTile) * tileHeight) % tileHeight);
      const D_ts: Vector3 = resultNormalmap[tileY][tileX];
      const tileNormal = tileNormalmap[tileY][tileX];
      D_ts[0] = tileNormal[0] * detailStrength;
      D_ts[1] = tileNormal[1] * detailStrength;
      D_ts[2] = tileNormal[2];
      normalize(D_ts, D_ts);

      // Establish the TBN (Tangent, Bitangent, Normal) basis matrix.
      normalize(subtract(initial_T, scale(N, dot(initial_T, N), T), T), T); // T
      cross(N, T, B); // B

      // Transform the detail normal into world space and combine.
      normalize(multiplyMatrix3x3Vec3(T, B, N, D_ts, D_ts), D_ts);
    }
  }

  log(
    `addTileNormalmapToGlobalNormalmap`,
    startsAt,
    `Combined tile normalmap with global normalmap: ${globalWidth}x${globalHeight}, ${tileWidth}x${tileHeight} (pixelsPerTile=${pixelsPerTile}, detailStrength=${detailStrength})`,
  );
  return resultNormalmap;
}

export function printNormalmap(normalmap: Normalmap): void {
  const chars = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  const flatChar = "·";
  const flatThreshold = 0.1;

  normalmap.forEach((row) => {
    let line = "";
    row.forEach((normal) => {
      const [nx, ny] = normal;
      if (Math.sqrt(nx ** 2 + ny ** 2) < flatThreshold) {
        line += flatChar + " ";
      } else {
        let angle = Math.atan2(ny, nx);
        // Normalize the angle to a range of [0, 2*PI] for easier indexing.
        if (angle < 0) angle += 2 * Math.PI;
        const slice = Math.PI / 4; // 2*PI / 8 slices
        const index = Math.round(angle / slice) % 8;

        line += chars[index] + " ";
      }
    });
    console.log(line);
  });
}

export function printHeightmap(map: Heightmap): void {
  const maxValue = map.flat().reduce((max, value) => Math.max(max, value), -Infinity);
  const chars = [" ", "░", "▒", "▓", "█"];
  const step = Math.max(1, maxValue) / chars.length;

  map.forEach((row) => {
    let line = "";
    row.forEach((value) => {
      const charIndex = Math.max(0, Math.min(Math.floor(value / step), chars.length - 1));
      if (chars[charIndex] === undefined)
        throw new Error(
          `Invalid character index: ${charIndex} for value: ${value} in ${chars.map((c) => c).join(", ")} in row ${row.join(", ")}`,
        );
      line += chars[charIndex] + " ";
    });
    console.log(line);
  });
}
