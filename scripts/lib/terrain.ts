import type { Heightmap } from "./heightmap.js";

// https://newgrf-specs.tt-wiki.net/wiki/NML:List_of_tile_slopes
// bit flag	       meaning
// CORNER_W	       west corner is above the lowest corner.
// CORNER_S	       south corner is above the lowest corner.
// CORNER_E	       east corner is above the lowest corner.
// CORNER_N	       north corner is above the lowest corner.
// IS_STEEP_SLOPE	 this tile is a steep slope (the corner opposite to the lowest corner is 2 units higher).
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type LastOf<T> = UnionToIntersection<T extends any ? () => T : never> extends () => infer R ? R : never;
type UnionToTuple<T, L = LastOf<T>, N = [T] extends [never] ? true : false> = true extends N
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L];
type Count<T> = UnionToTuple<T>["length"];
type Vector3 = [number, number, number];

export type TerrainTile = {
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

const TOP: Vector3 = [0, 0, 1];
// isometric x, y, z coordinates
// const SOUTH: Vector3 = [0.1933, -0.1933, 0.9619];
// const EAST: Vector3 = [0.1933, 0.1933, 0.9619];
// const WEST: Vector3 = [-0.1933, -0.1933, 0.9619];
// const NORTH: Vector3 = [-0.1933, 0.1933, 0.9619];
// const SOUTH_WEST: Vector3 = [0, -0.1985, 0.9801];
// const SOUTH_EAST: Vector3 = [0.1985, 0, 0.9801];
// const NORTH_WEST: Vector3 = [-0.1985, 0, 0.9801];
// const NORTH_EAST: Vector3 = [0, 0.1985, 0.9801];

// game engine x, y, z coordinates
const SOUTH: Vector3 = [0, 0.2734, 0.9619]; // 15.87 degrees
const EAST: Vector3 = [0.2734, 0, 0.9619];
const WEST: Vector3 = [-0.2734, 0, 0.9619];
const NORTH: Vector3 = [0, -0.2734, 0.9619];
const SOUTH_WEST: Vector3 = [-0.14036, 0.14036, 0.9801]; // 11.45 degrees
const SOUTH_EAST: Vector3 = [0.14036, 0.14036, 0.9801];
const NORTH_WEST: Vector3 = [-0.14036, -0.14036, 0.9801];
const NORTH_EAST: Vector3 = [0.14036, -0.14036, 0.9801];

// from isometric to game engine coordinates
// - X and Y are aligned with the isometric grid (toward the right), thus rotate by -45 degrees around the Z-axis
// - X is positive to the right (ok)
// - Y is positive up (inverse)
// - Z is positive up (ok)
export function fromIsoToGame(normal: Vector3): Vector3 {
  const cos = Math.cos(-Math.PI / 4);
  const sin = Math.sin(-Math.PI / 4);
  const x = normal[0];
  const y = normal[1];
  const z = normal[2];
  const newX = x * cos - y * sin;
  const newY = x * sin + y * cos;
  return [newX, -newY, z];
}

export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

// console.log(radToDeg(Math.acos(SOUTH[2])));
// console.log(radToDeg(Math.acos(EAST[2])));
// console.log(radToDeg(Math.acos(WEST[2])));
// console.log(radToDeg(Math.acos(NORTH[2])));
// console.log(radToDeg(Math.acos(SOUTH_WEST[2])));
// console.log(radToDeg(Math.acos(SOUTH_EAST[2])));
// console.log(radToDeg(Math.acos(NORTH_WEST[2])));
// console.log(radToDeg(Math.acos(NORTH_EAST[2])));

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

export type NESW = `${0 | 1 | 2}${0 | 1 | 2}${0 | 1 | 2}${0 | 1 | 2}`; // 4 elevations, 0, 1, or 2, N E S W
export type Terrain = (NESW | null)[][][];
export function heightmapToTerrain(heightmap: Heightmap): Terrain {
  const maxValue = Math.max(...heightmap.flat());
  const terrain: Terrain = Array.from({ length: maxValue + 1 }, () =>
    Array.from({ length: heightmap.length - 1 }, () => Array(heightmap[0].length - 1).fill(null)),
  );

  for (let y = 0; y < heightmap.length - 1; y++) {
    for (let x = 0; x < heightmap[y].length - 1; x++) {
      let N = heightmap[y][x];
      let E = heightmap[y][x + 1];
      let S = heightmap[y + 1][x + 1];
      let W = heightmap[y + 1][x];
      const level = Math.min(N, E, S, W);
      // normalize vertices elevation to 0 -> 2
      N -= level;
      E -= level;
      S -= level;
      W -= level;

      terrain[level][y][x] = `${N}${E}${S}${W}` as NESW;
    }
  }

  return terrain;
}
