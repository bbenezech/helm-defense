import { Jimp } from "jimp";
import { createNoise2D } from "simplex-noise";

export type Heightmap = number[][];
export type Normalmap = [number, number, number][][];
export type RgbaBuffer = { data: Uint8ClampedArray; width: number; height: number };

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
  scale = 0.1,
}: {
  tileWidth: number;
  tileHeight: number;
  maxValue: number;
  /**
   * The scale of the noise. Larger values produce more frequent, smaller features (zoomed out),
   * while smaller values produce larger, smoother features (zoomed in).
   * @default 0.1
   */
  scale?: number;
}): Heightmap {
  const step = 1;
  const noise2D = createNoise2D();
  const height = tileHeight + 1;
  const width = tileWidth + 1;

  const heightmap: Heightmap = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const leftValue = x > 0 ? heightmap[y][x - 1] : 0;
      const topValue = y > 0 ? heightmap[y - 1][x] : 0;
      const minAllowed = Math.max(0, leftValue - step, topValue - step);
      const maxAllowed = Math.min(maxValue - 1, leftValue + step, topValue + step);
      const rawNoise = noise2D(x * scale, y * scale); // Range [-1, 1]
      const normalizedNoise = (rawNoise + 1) / 2; // Range [0, 1]

      heightmap[y][x] = Math.round(minAllowed + normalizedNoise * (maxAllowed - minAllowed));
    }
  }

  return heightmap;
}

export function heightmapToNormalmap(heightmap: Heightmap, rollingWindowSize: number = 1): Normalmap {
  const height = heightmap.length;
  if (height === 0) return [];
  const width = heightmap[0].length;
  if (width === 0) return [];

  if (rollingWindowSize < 1) throw new Error("rollingWindowSize must be an integer greater than or equal to 1.");
  const normalmap: Normalmap = Array.from({ length: height }, () => Array(width).fill([0, 0, 1]));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const horizontalValues: number[] = [];
      const verticalValues: number[] = [];

      for (let i = -rollingWindowSize; i <= rollingWindowSize; i++) {
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

  return normalmap;
}

export function heightmapToRgbaBuffer(heightmap: Heightmap) {
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

  return { data: buffer, width, height };
}

export function normalmapToRgbaBuffer(normalmap: Normalmap): RgbaBuffer {
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

  return { data: buffer, width, height };
}

export async function saveRgbaBufferToImage({ data, width, height }: RgbaBuffer, filename: string): Promise<void> {
  console.log(`Saving RGBA buffer to ${filename} (${width}x${height})`);
  await new Jimp({ data: Buffer.from(data), width, height }).write(filename as `${string}.${string}`);
}

export async function saveNormalmap(normalmap: Normalmap, filename: string): Promise<void> {
  await saveRgbaBufferToImage(normalmapToRgbaBuffer(normalmap), filename);
}

export async function saveHeightmap(heightmap: Heightmap, filename: string): Promise<void> {
  await saveRgbaBufferToImage(heightmapToRgbaBuffer(heightmap), filename);
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
