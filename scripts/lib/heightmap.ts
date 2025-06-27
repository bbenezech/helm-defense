import { createNoise2D } from "simplex-noise";

export type Heightmap = number[][];
export function generateHeightmap({
  width,
  height,
  maxValue,
  scale = 0.1,
}: {
  width: number;
  height: number;
  maxValue: number;
  /**
   * The scale of the noise. Larger values produce more frequent, smaller features (zoomed out),
   * while smaller values produce larger, smoother features (zoomed in).
   * @default 0.1
   */
  scale?: number;
}): Heightmap {
  const intStep = 1;
  const noise2D = createNoise2D();

  const heightmap: Heightmap = Array(height)
    .fill(0)
    .map(() => Array(width).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const leftValue = x > 0 ? heightmap[y][x - 1] : 0;
      const topValue = y > 0 ? heightmap[y - 1][x] : 0;
      const minAllowed = Math.max(0, leftValue - intStep, topValue - intStep);
      const maxAllowed = Math.min(maxValue - 1, leftValue + intStep, topValue + intStep);
      const rawNoise = noise2D(x * scale, y * scale); // Range [-1, 1]
      const normalizedNoise = (rawNoise + 1) / 2; // Range [0, 1]
      const interpolatedValue = minAllowed + normalizedNoise * (maxAllowed - minAllowed);

      heightmap[y][x] = Math.max(minAllowed, Math.min(Math.round(interpolatedValue), maxAllowed));
    }
  }

  return heightmap;
}

export function printHeightmap(map: Heightmap, maxValue: number): void {
  const chars = [" ", "░", "▒", "▓", "█"];
  const step = Math.max(1, maxValue) / chars.length;

  map.forEach((row) => {
    let line = "";
    row.forEach((value) => {
      const charIndex = Math.min(Math.floor(value / step), chars.length - 1);
      line += chars[charIndex] + " ";
    });
    console.log(line);
  });
}
