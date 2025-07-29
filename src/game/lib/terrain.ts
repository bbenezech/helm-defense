import type { Heightmap, Normalmap, ImageData } from "./heightmap.js";
import { log } from "./log.js";
import { barycentricWeights, type Vector3 } from "./vector.js";

const TILE_ELEVATION_Z = 0.9801; // Z component of the normalized slope vector (level 0 to level 1 elevation on a tile width).

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type LastOf<T> = UnionToIntersection<T extends any ? () => T : never> extends () => infer R ? R : never;
type UnionToTuple<T, L = LastOf<T>, N = [T] extends [never] ? true : false> = true extends N
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L];
type Count<T> = UnionToTuple<T>["length"];

type TerrainTile = {
  NESW: NESW;
  FLAT: boolean;
  // elevations
  CENTER: 0 | 0.5 | 1;
  W: 0 | 1 | 2;
  S: 0 | 1 | 2;
  N: 0 | 1 | 2;
  E: 0 | 1 | 2;
  // normales
  NORMAL_NE: Vector3;
  NORMAL_NW: Vector3;
  NORMAL_SE: Vector3;
  NORMAL_SW: Vector3;
};

// deal with the 0 to 1 unit elevation on a tile width
// Math.tan(Math.acos(NORMAL_ELEVATION_VECTOR_Z)) => slope is 20.25% of width => 4.938 : 1 => ground angle is 0.2 rad or 11.45°
const TILE_ELEVATION_ANGLE = Math.acos(TILE_ELEVATION_Z); // angle 0.2 rad elevation angle => 11.45° slope to go from 0 to 1 elevation on a tile width
export const TILE_ELEVATION_RATIO = Math.tan(TILE_ELEVATION_ANGLE); // elevation ratio => 0.20253482585771954 elevation per tile width on a normal slope, 4.938 : 1. It means tile at level 1 is 0.2025 units (tile width) higher than tile at level 0.

const TILE_ELEVATION_X_OR_Y = Math.sqrt(1 - TILE_ELEVATION_Z * TILE_ELEVATION_Z); // 0.1985 X or Y component (if the other is 0) of the normalized slope vector (0 to 1 elevation on a tile width)

// deal with the 0 to 1 unit elevation on a tile half-diagonal. If width of tile is 1, then half-diagonal is Math.SQRT2/2
// Math.tan(Math.acos(0.9619)) => slope is 28.46% of width => 3.513 : 1 => ground angle is 0.277 rad or 15.89°
const HALF_TILE_ELEVATION_ANGLE = Math.atan(Math.SQRT2 * Math.tan(TILE_ELEVATION_ANGLE)); // 0.277 radians or 15.89°
const HALF_TILE_ELEVATION_Z = Math.cos(HALF_TILE_ELEVATION_ANGLE); // 0.9619
const HALF_TILE_ELEVATION_X_AND_Y = Math.sqrt(Math.abs(1 - HALF_TILE_ELEVATION_Z * HALF_TILE_ELEVATION_Z) / 2); // 0.1933

const TOP: Vector3 = [0, 0, 1];

const EAST: Vector3 = [HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_Z];
const NORTH_EAST: Vector3 = [0, TILE_ELEVATION_X_OR_Y, TILE_ELEVATION_Z];
const NORTH: Vector3 = [-HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_Z];
const NORTH_WEST: Vector3 = [-TILE_ELEVATION_X_OR_Y, 0, TILE_ELEVATION_Z];
const WEST: Vector3 = [-HALF_TILE_ELEVATION_X_AND_Y, -HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_Z];
const SOUTH_WEST: Vector3 = [0, -TILE_ELEVATION_X_OR_Y, TILE_ELEVATION_Z];
const SOUTH: Vector3 = [HALF_TILE_ELEVATION_X_AND_Y, -HALF_TILE_ELEVATION_X_AND_Y, HALF_TILE_ELEVATION_Z];
const SOUTH_EAST: Vector3 = [TILE_ELEVATION_X_OR_Y, 0, TILE_ELEVATION_Z];

export const TERRAIN_TILE_INDEX = {
  SLOPE_FLAT: {
    FLAT: true,
    CENTER: 0,
    W: 0,
    S: 0,
    N: 0,
    E: 0,
    NESW: "0000",
    NORMAL_NE: TOP,
    NORMAL_SE: TOP,
    NORMAL_SW: TOP,
    NORMAL_NW: TOP,
  },

  SLOPE_W: {
    FLAT: false,
    CENTER: 0,
    N: 0,
    E: 0,
    S: 0,
    W: 1,
    NESW: "0001",
    NORMAL_NW: EAST,
    NORMAL_SW: EAST,
    NORMAL_NE: TOP,
    NORMAL_SE: TOP,
  },

  SLOPE_S: {
    FLAT: false,
    CENTER: 0,
    N: 0,
    E: 0,
    S: 1,
    W: 0,
    NESW: "0010",
    NORMAL_SE: NORTH,
    NORMAL_SW: NORTH,
    NORMAL_NE: TOP,
    NORMAL_NW: TOP,
  },
  SLOPE_E: {
    FLAT: false,
    CENTER: 0,
    N: 0,
    E: 1,
    W: 0,
    S: 0,
    NESW: "0100",
    NORMAL_NE: WEST,
    NORMAL_SE: WEST,
    NORMAL_NW: TOP,
    NORMAL_SW: TOP,
  },
  SLOPE_N: {
    FLAT: false,
    CENTER: 0,
    N: 1,
    E: 0,
    S: 0,
    W: 0,
    NESW: "1000",
    NORMAL_NE: SOUTH,
    NORMAL_NW: SOUTH,
    NORMAL_SE: TOP,
    NORMAL_SW: TOP,
  },
  SLOPE_NW: {
    FLAT: true,
    CENTER: 0.5,
    N: 1,
    E: 0,
    S: 0,
    W: 1,
    NESW: "1001",
    NORMAL_NE: SOUTH_EAST,
    NORMAL_NW: SOUTH_EAST,
    NORMAL_SE: SOUTH_EAST,
    NORMAL_SW: SOUTH_EAST,
  },
  SLOPE_SW: {
    FLAT: true,
    CENTER: 0.5,
    N: 0,
    E: 0,
    S: 1,
    W: 1,
    NESW: "0011",
    NORMAL_NE: NORTH_EAST,
    NORMAL_NW: NORTH_EAST,
    NORMAL_SE: NORTH_EAST,
    NORMAL_SW: NORTH_EAST,
  },
  SLOPE_SE: {
    FLAT: true,
    CENTER: 0.5,
    N: 0,
    E: 1,
    S: 1,
    W: 0,
    NESW: "0110",
    NORMAL_NE: NORTH_WEST,
    NORMAL_NW: NORTH_WEST,
    NORMAL_SE: NORTH_WEST,
    NORMAL_SW: NORTH_WEST,
  },
  SLOPE_NE: {
    FLAT: true,
    CENTER: 0.5,
    N: 1,
    E: 1,
    S: 0,
    W: 0,
    NESW: "1100",
    NORMAL_NE: SOUTH_WEST,
    NORMAL_NW: SOUTH_WEST,
    NORMAL_SE: SOUTH_WEST,
    NORMAL_SW: SOUTH_WEST,
  },
  SLOPE_EW: {
    FLAT: false,
    CENTER: 0,
    N: 0,
    E: 1,
    S: 0,
    W: 1,
    NESW: "0101",
    NORMAL_NW: EAST,
    NORMAL_SW: EAST,
    NORMAL_NE: WEST,
    NORMAL_SE: WEST,
  },
  SLOPE_NS: {
    FLAT: false,
    CENTER: 0,
    N: 1,
    E: 0,
    S: 1,
    W: 0,
    NESW: "1010",
    NORMAL_SE: NORTH,
    NORMAL_SW: NORTH,
    NORMAL_NE: SOUTH,
    NORMAL_NW: SOUTH,
  },
  SLOPE_NWS: {
    FLAT: false,
    CENTER: 1,
    N: 1,
    E: 0,
    S: 1,
    W: 1,
    NESW: "1011",
    NORMAL_NW: TOP,
    NORMAL_SW: TOP,
    NORMAL_NE: EAST,
    NORMAL_SE: EAST,
  },
  SLOPE_WSE: {
    FLAT: false,
    CENTER: 1,
    N: 0,
    E: 1,
    S: 1,
    W: 1,
    NESW: "0111",
    NORMAL_SE: TOP,
    NORMAL_SW: TOP,
    NORMAL_NE: NORTH,
    NORMAL_NW: NORTH,
  },
  SLOPE_SEN: {
    FLAT: false,
    CENTER: 1,
    N: 1,
    E: 1,
    S: 1,
    W: 0,
    NESW: "1110",
    NORMAL_NE: TOP,
    NORMAL_SE: TOP,
    NORMAL_NW: WEST,
    NORMAL_SW: WEST,
  },
  SLOPE_ENW: {
    FLAT: false,
    CENTER: 1,
    N: 1,
    E: 1,
    S: 0,
    W: 1,
    NESW: "1101",
    NORMAL_NE: TOP,
    NORMAL_NW: TOP,
    NORMAL_SE: SOUTH,
    NORMAL_SW: SOUTH,
  },
  SLOPE_STEEP_W: {
    FLAT: true,
    CENTER: 1,
    N: 1,
    E: 0,
    S: 1,
    W: 2,
    NESW: "1012",
    NORMAL_NE: EAST,
    NORMAL_NW: EAST,
    NORMAL_SE: EAST,
    NORMAL_SW: EAST,
  },
  SLOPE_STEEP_S: {
    FLAT: true,
    CENTER: 1,
    N: 0,
    E: 1,
    S: 2,
    W: 1,
    NESW: "0121",
    NORMAL_NE: NORTH,
    NORMAL_NW: NORTH,
    NORMAL_SE: NORTH,
    NORMAL_SW: NORTH,
  },
  SLOPE_STEEP_E: {
    FLAT: true,
    CENTER: 1,
    N: 1,
    E: 2,
    S: 1,
    W: 0,
    NESW: "1210",
    NORMAL_NE: WEST,
    NORMAL_NW: WEST,
    NORMAL_SE: WEST,
    NORMAL_SW: WEST,
  },
  SLOPE_STEEP_N: {
    FLAT: true,
    CENTER: 1,
    N: 2,
    E: 1,
    S: 0,
    W: 1,
    NESW: "2101",
    NORMAL_NE: SOUTH,
    NORMAL_NW: SOUTH,
    NORMAL_SE: SOUTH,
    NORMAL_SW: SOUTH,
  },
} satisfies Record<string, TerrainTile>;
export type TerrainTileName = keyof typeof TERRAIN_TILE_INDEX;
export const TERRAIN_TILE_COUNT: Count<TerrainTileName> = 19;

export type NESW = `${number}${number}${number}${number}`;

export interface TileData {
  tile: TerrainTile;
  level: number;
}

export interface Terrain {
  tileData: TileData[][];
  heightmap: Heightmap;
  normalmap: Normalmap;
  precision: number; // terrain precision in pixel per tile
}

export function tileableHeightmapToTileData(tilableHeightmap: Heightmap): TileData[][] {
  const startsAt = Date.now();
  const NESWToTerrainTile: Record<NESW, TerrainTile> = Object.fromEntries(
    Object.values(TERRAIN_TILE_INDEX).map((tile) => [tile.NESW, tile]),
  );
  const terrain: TileData[][] = Array.from({ length: tilableHeightmap.length - 1 }, () =>
    Array.from({ length: tilableHeightmap[0].length - 1 }),
  );

  for (let y = 0; y < tilableHeightmap.length - 1; y++) {
    for (let x = 0; x < tilableHeightmap[y].length - 1; x++) {
      const N = tilableHeightmap[y][x];
      const E = tilableHeightmap[y][x + 1];
      const S = tilableHeightmap[y + 1][x + 1];
      const W = tilableHeightmap[y + 1][x];
      const level = Math.min(N, E, S, W);
      const NESW = `${N - level}${E - level}${S - level}${W - level}` as const;
      const tile: TerrainTile = NESWToTerrainTile[NESW];
      if (!tile) throw new Error(`Unknown terrain tile for NESW: ${NESW}`);
      terrain[y][x] = { tile, level };
    }
  }

  log(
    `tileableHeightmapToTileData`,
    startsAt,
    `Converted tilable heightmap to tile data (${tilableHeightmap[0].length - 1}x${
      tilableHeightmap.length - 1
    }), ${TERRAIN_TILE_COUNT} terrain tiles, elevationRatio=${TILE_ELEVATION_RATIO.toFixed(4)}`,
  );
  return terrain;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function tileDataToTerrain(
  tileData: TileData[][],
  precision: number, // Number of pixels per tile in the heightmap and normalmap (definition), use powers of 2 to avoid artefacts on diagonals
): Terrain {
  const startsAt = Date.now();

  const mapHeight = tileData.length;
  if (mapHeight === 0) return { heightmap: [], normalmap: [], precision, tileData };
  const mapWidth = tileData[0].length;
  if (mapWidth === 0) return { heightmap: [], normalmap: [], precision, tileData };

  const fineMapWidth = mapWidth * precision;
  const fineMapHeight = mapHeight * precision;

  const heightmap: Heightmap = Array.from({ length: fineMapHeight }, () => Array.from({ length: fineMapWidth }));
  const normalmap: Normalmap = Array.from({ length: fineMapHeight }, () => Array.from({ length: fineMapWidth }));

  const invSpan = 1 / precision;
  const pxElevationRatio = TILE_ELEVATION_RATIO * precision;

  const vN: Point3D = { x: 0, y: 0, z: 0 };
  const vE: Point3D = { x: 1, y: 0, z: 0 };
  const vS: Point3D = { x: 1, y: 1, z: 0 };
  const vW: Point3D = { x: 0, y: 1, z: 0 };
  const vC: Point3D = { x: 0.5, y: 0.5, z: 0 };
  const barycentricWeightsOut: Vector3 = [0, 0, 0];

  for (let py = 0; py < fineMapHeight; py++) {
    for (let px = 0; px < fineMapWidth; px++) {
      // Calculate global floating-point coordinates in the tile grid
      const globalX = px * invSpan;
      const globalY = py * invSpan;

      // The integer part is the tile index
      const tx = Math.floor(globalX);
      const ty = Math.floor(globalY);

      // The fractional part is the normalized coordinate within the tile
      const normX = globalX - tx;
      const normY = globalY - ty;

      const { tile, level } = tileData[ty][tx];

      vN.z = tile.N;
      vE.z = tile.E;
      vS.z = tile.S;
      vW.z = tile.W;
      vC.z = tile.CENTER;

      let tri_v1: Point3D, tri_v2: Point3D, tri_v3: Point3D;
      let normal: Vector3;

      if (normY < 1 - normX) {
        // Top-half of the tile
        if (normY < normX) {
          // NEC triangle
          tri_v1 = vN;
          tri_v2 = vE;
          tri_v3 = vC;
          normal = tile.NORMAL_NE;
        } else {
          // WNC triangle
          tri_v1 = vW;
          tri_v2 = vN;
          tri_v3 = vC;
          normal = tile.NORMAL_NW;
        }
      } else {
        // Bottom-half of the tile
        if (normY < normX) {
          // ESC triangle
          tri_v1 = vE;
          tri_v2 = vS;
          tri_v3 = vC;
          normal = tile.NORMAL_SE;
        } else {
          // SWC triangle
          tri_v1 = vS;
          tri_v2 = vW;
          tri_v3 = vC;
          normal = tile.NORMAL_SW;
        }
      }

      const [w1, w2, w3] = barycentricWeights(normX, normY, tri_v1, tri_v2, tri_v3, barycentricWeightsOut);
      heightmap[py][px] = (level + w1 * tri_v1.z + w2 * tri_v2.z + w3 * tri_v3.z) * pxElevationRatio;
      normalmap[py][px] = normal;
    }
  }

  log(
    `tileDataToTerrain`,
    startsAt,
    `Terrain generated for ${mapWidth}x${mapHeight} tiles, ${fineMapWidth}x${fineMapHeight}px, elevationRatio=${TILE_ELEVATION_RATIO.toFixed(4)}, precision=${precision.toFixed(4)}`,
  );

  return { heightmap, normalmap, precision, tileData };
}

export type TerrainData = { imageData: ImageData; minHeight: number; maxHeight: number; precision: number };

export function packTerrain(terrain: Terrain): TerrainData {
  const startsAt = Date.now();
  const height = terrain.heightmap.length;
  if (height === 0) throw new Error("Heightmap cannot be empty.");
  const width = terrain.heightmap[0].length;
  if (width === 0) throw new Error("Heightmap cannot be empty.");

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = terrain.heightmap[y][x];
      if (value < minHeight) minHeight = value;
      if (value > maxHeight) maxHeight = value;
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const heightRangeInv255 = (1 / (maxHeight - minHeight)) * 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const value = terrain.heightmap[y][x];
      const normal = terrain.normalmap[y][x];

      data[index] = (normal[0] * 0.5 + 0.5) * 255; // R
      data[index + 1] = (normal[1] * 0.5 + 0.5) * 255; // G
      data[index + 2] = (normal[2] * 0.5 + 0.5) * 255; // B
      data[index + 3] = (value - minHeight) * heightRangeInv255; // A
    }
  }

  log(`packMetadata`, startsAt, `Packed metadata (${width}x${height}, min=${minHeight}, max=${maxHeight})`);

  return { imageData: { data, width, height, channels: 4 }, minHeight, maxHeight, precision: terrain.precision };
}

export function unpackTerrainData(terrainData: TerrainData): { heightmap: Heightmap; normalmap: Normalmap } {
  const startsAt = Date.now();
  const { data, width, height } = terrainData.imageData;
  const heightmap: Heightmap = Array.from({ length: height }, () => Array.from({ length: width }));
  const normalmap: Normalmap = Array.from({ length: height }, () => Array.from({ length: width }));
  const inv255 = 1 / 255;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const r = data[index] * inv255 * 2 - 1; // Normalize to [0, 1]
      const g = data[index + 1] * inv255 * 2 - 1;
      const b = data[index + 2] * inv255 * 2 - 1;
      const a = data[index + 3] * inv255 * (terrainData.maxHeight - terrainData.minHeight) + terrainData.minHeight;

      // Map the color back to the normal vector in the range [-1, 1]
      normalmap[y][x] = [r, g, b];
      heightmap[y][x] = a; // Height is already normalized
    }
  }

  log(`unpackTerrain`, startsAt, `Unpacked terrain data to heightmap and normalmap (${width}x${height})`);

  return { heightmap, normalmap };
}
