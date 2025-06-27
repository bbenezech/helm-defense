import { TERRAIN_TILE_COUNT, type TerrainTileName } from "./terrain.js";

export const ORDERED_SLOPES = [
  "SLOPE_FLAT",
  "SLOPE_W",
  "SLOPE_S",
  "SLOPE_E",
  "SLOPE_N",
  "SLOPE_NW",
  "SLOPE_SW",
  "SLOPE_SE",
  "SLOPE_NE",
  "SLOPE_NWS",
  "SLOPE_WSE",
  "SLOPE_SEN",
  "SLOPE_ENW",
  "SLOPE_STEEP_S",
  "SLOPE_STEEP_W",
  "SLOPE_STEEP_N",
  "SLOPE_STEEP_E",
  "SLOPE_NS",
  "SLOPE_EW",
] satisfies TerrainTileName[];

if (new Set(ORDERED_SLOPES).size !== TERRAIN_TILE_COUNT)
  throw new Error(`Error: SLOPE_COUNT mismatch! Expected ${TERRAIN_TILE_COUNT}, got ${new Set(ORDERED_SLOPES).size}.`);

// CURRENT SCRIPT SLOPE INDEX
// SLOPE_FLAT:1 SLOPE_W:2 SLOPE_S:3 SLOPE_E:4 SLOPE_N:5 SLOPE_NW:6 SLOPE_SW:7 SLOPE_SE:8 SLOPE_NE:9 SLOPE_NWS:10 SLOPE_WSE:11 SLOPE_SEN:12 SLOPE_ENW:13 SLOPE_STEEP_S:14 SLOPE_STEEP_W:15 SLOPE_STEEP_N:16 SLOPE_STEEP_E:17 SLOPE_NS:18 SLOPE_EW:19

// Face 1: Local Normal = <Vector (0.1942, -0.1966, 0.9611)> => 10 EAST, 11 NORTH
// Face 2: Local Normal = <Vector (0, -0.1985, 0.9801)> => 6 FULL, 7 FULL
// Face 4: Local Normal = <Vector (0.1947, -0.1947, 0.9614)> => 2 WEST, 3 SOUTH
// Face 7: Local Normal = <Vector (0.1947, -0.1947, 0.9614)> => 4 EAST, 5 NORTH
// Face 8: Local Normal = <Vector (0, -0.1985, 0.9801)> => 8 FULL, 9 FULL
// Face 9: Local Normal = <Vector (0.1942, -0.1966, 0.9611)> => 12 WEST, 13 SOUTH
// Face 11: Local Normal = <Vector (0.1933, -0.1933, 0.9619)> => 14 FULL, 15 FULL
// Face 12: Local Normal = <Vector (0.1933, -0.1933, 0.9619)> => 16 FULL, 17 FULL
// Face 13: Local Normal = <Vector (-0.1947, 0.1947, 0.9614)> => 18 SOUTH, 19 WEST
// Face 14: Local Normal = <Vector (0.1925, -0.1924, 0.9623)> => 18 NORTH, 19 EAST
