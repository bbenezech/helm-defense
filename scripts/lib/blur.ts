function boxBlurH(source: number[][], target: number[][], width: number, height: number, radius: number): void {
  const invRadius = 1 / (radius * 2 + 1);
  for (let y = 0; y < height; y++) {
    let trailingIndex = 0;
    let leadingIndex = 0;
    let sum = 0;
    // Prime the moving average window
    for (let x = -radius; x <= radius; x++) {
      leadingIndex = Math.max(0, Math.min(x, width - 1));
      sum += source[y][leadingIndex];
    }
    for (let x = 0; x < width; x++) {
      target[y][x] = sum * invRadius;

      // Subtract the trailing edge and add the leading edge
      trailingIndex = Math.max(0, x - radius);
      leadingIndex = Math.min(width - 1, x + radius + 1);

      sum += source[y][leadingIndex] - source[y][trailingIndex];
    }
  }
}

function boxBlurV(source: number[][], target: number[][], width: number, height: number, radius: number): void {
  const invRadius = 1 / (radius * 2 + 1);
  for (let x = 0; x < width; x++) {
    let trailingIndex = 0;
    let leadingIndex = 0;
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      leadingIndex = Math.max(0, Math.min(y, height - 1));
      sum += source[leadingIndex][x];
    }
    for (let y = 0; y < height; y++) {
      target[y][x] = sum * invRadius;

      trailingIndex = Math.max(0, y - radius);
      leadingIndex = Math.min(height - 1, y + radius + 1);

      sum += source[leadingIndex][x] - source[trailingIndex][x];
    }
  }
}

export function fastBoxBlur(heightmap: number[][], radius = 4, passes = 4): number[][] {
  const height = heightmap.length;
  if (height === 0) return [];
  const width = heightmap[0].length;
  if (width === 0) return [];

  const currentMap = heightmap;
  // Create a single intermediate map to ping-pong buffers, avoiding allocations.
  const intermediateMap: number[][] = Array.from({ length: height }, () => Array(width).fill(0));

  for (let i = 0; i < passes; i++) {
    boxBlurH(currentMap, intermediateMap, width, height, radius);
    boxBlurV(intermediateMap, currentMap, width, height, radius);
  }

  return currentMap;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function fastBoxBlurVectors(
  normalmap: [number, number, number][][],
  radius: number,
  passes: number = 3,
): [number, number, number][][] {
  const height = normalmap.length;
  if (height === 0) return [];
  const width = normalmap[0].length;
  if (width === 0) return [];

  // Create temporary heightmaps for each component (X, Y, Z)
  const mapX: number[][] = normalmap.map((row) => row.map((v) => v[0]));
  const mapY: number[][] = normalmap.map((row) => row.map((v) => v[1]));
  const mapZ: number[][] = normalmap.map((row) => row.map((v) => v[2]));

  // Blur each component map independently
  const blurredX = fastBoxBlur(mapX, radius, passes);
  const blurredY = fastBoxBlur(mapY, radius, passes);
  const blurredZ = fastBoxBlur(mapZ, radius, passes);

  // Reconstruct the final blurred normal map
  const blurredNormals: [number, number, number][][] = Array.from({ length: height }, () =>
    Array(width).fill([0, 0, 1]),
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const X = clamp(blurredX[y][x], -1, 1);
      const Y = clamp(blurredY[y][x], -1, 1);
      const Z = clamp(blurredZ[y][x], -1, 1);

      blurredNormals[y][x] = [X, Y, Z];
    }
  }

  return blurredNormals;
}
