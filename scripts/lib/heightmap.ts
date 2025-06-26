import { createNoise2D } from "simplex-noise";
import { SLOPE_INDEX, type NESW, type SLOPE_NAME } from "./tileslope.js";

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
}): number[][] {
  const intStep = 1;
  const noise2D = createNoise2D();

  const heightmap: number[][] = Array(height)
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

export function heightmapToLayers(heightmap: number[][], orderedSlopes: SLOPE_NAME[]): number[][][] {
  const slopeNameByNESW = Object.entries(SLOPE_INDEX).reduce(
    (acc, [name, slope]) => {
      acc[slope.NESW] = name as SLOPE_NAME;

      return acc;
    },
    {} as Record<NESW, SLOPE_NAME>,
  );
  const slopeOffsets = orderedSlopes.reduce<Record<SLOPE_NAME, number>>(
    (acc, slope, index) => {
      acc[slope] = index;
      return acc;
    },
    {} as Record<SLOPE_NAME, number>,
  );
  const maxValue = Math.max(...heightmap.flat());
  const slopes: number[][][] = Array.from({ length: maxValue + 1 }, () =>
    Array.from({ length: heightmap.length - 1 }, () => Array(heightmap[0].length - 1).fill(0)),
  );

  for (let y = 0; y < heightmap.length - 1; y++) {
    for (let x = 0; x < heightmap[y].length - 1; x++) {
      let N = heightmap[y][x];
      let E = heightmap[y][x + 1];
      let S = heightmap[y + 1][x + 1];
      let W = heightmap[y + 1][x];
      const level = Math.min(N, E, S, W);
      N -= level;
      E -= level;
      S -= level;
      W -= level;

      const NESW = `${N}${E}${S}${W}` as NESW;
      const slopeName = slopeNameByNESW[NESW];
      if (!slopeName) throw new Error(`Unknown slope for NESW "${NESW}" at (${x}, ${y})`);
      slopes[level][y][x] = slopeOffsets[slopeName] + 1;
    }
  }

  return slopes;
}

export function printHeightmap(map: number[][], maxValue: number): void {
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
