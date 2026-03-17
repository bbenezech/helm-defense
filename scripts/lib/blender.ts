import { TERRAIN_TILE_COUNT, type TerrainTileName } from "../../src/game/lib/terrain.ts";
import { terrainSceneSpec } from "./terrain-scene-spec.ts";

export const BLENDER_RENDER_CONTRACT = {
  resolution: terrainSceneSpec.render.resolution,
  camera: terrainSceneSpec.render.camera,
  frameStart: terrainSceneSpec.render.frame.start,
  frameEnd: terrainSceneSpec.render.frame.end,
  fps: terrainSceneSpec.render.frame.fps,
  cyclesSamples: 10,
  outputDirectoryName: "out",
} as const;

export type BlenderRenderEngine = "BLENDER_EEVEE_NEXT" | "CYCLES";
export type BlenderShadingProfile = "flat" | "shaded";
export type BlenderTextureRotationProfile = "none" | "quarterTurn" | "cameraAlignedLegacy";
export const BLENDER_SAMPLING_PROFILES = ["legacyMatched", "strictPixel", "nativeExact"] as const;
export type BlenderSamplingProfile = (typeof BLENDER_SAMPLING_PROFILES)[number];
export const DEFAULT_BLENDER_SAMPLING_PROFILE: BlenderSamplingProfile = "nativeExact";

export type BlenderRenderVariant = {
  engine: BlenderRenderEngine;
  shading: BlenderShadingProfile;
  textureRotation: BlenderTextureRotationProfile;
};

export const BLENDER_RENDER_VARIANTS = {
  tiles: {
    engine: "BLENDER_EEVEE_NEXT",
    shading: "flat",
    textureRotation: "none",
  },
  "tiles-shading": {
    engine: "BLENDER_EEVEE_NEXT",
    shading: "shaded",
    textureRotation: "none",
  },
  "tiles-shading-rotation": {
    engine: "BLENDER_EEVEE_NEXT",
    shading: "shaded",
    textureRotation: "cameraAlignedLegacy",
  },
  "tiles-shading-rotation-fast": {
    engine: "CYCLES",
    shading: "shaded",
    textureRotation: "cameraAlignedLegacy",
  },
  "tiles-no-shading-rotation": {
    engine: "BLENDER_EEVEE_NEXT",
    shading: "flat",
    textureRotation: "cameraAlignedLegacy",
  },
  "tiles-no-shading-rotation-fast": {
    engine: "CYCLES",
    shading: "flat",
    textureRotation: "cameraAlignedLegacy",
  },
} as const satisfies Record<string, BlenderRenderVariant>;

export const ACTIVE_BLENDER_RENDER_VARIANT_NAME = "tiles-no-shading-rotation-fast";
export const ACTIVE_BLENDER_RENDER_VARIANT = BLENDER_RENDER_VARIANTS[ACTIVE_BLENDER_RENDER_VARIANT_NAME];

export const ORDERED_SLOPES = terrainSceneSpec.order satisfies TerrainTileName[];

if (new Set(ORDERED_SLOPES).size !== TERRAIN_TILE_COUNT)
  throw new Error(`Error: SLOPE_COUNT mismatch! Expected ${TERRAIN_TILE_COUNT}, got ${new Set(ORDERED_SLOPES).size}.`);

const EXPECTED_FRAME_COUNT = BLENDER_RENDER_CONTRACT.frameEnd - BLENDER_RENDER_CONTRACT.frameStart + 1;
if (EXPECTED_FRAME_COUNT !== ORDERED_SLOPES.length)
  throw new Error(`Error: frame count mismatch! Expected ${ORDERED_SLOPES.length}, got ${EXPECTED_FRAME_COUNT}.`);
if (terrainSceneSpec.poses.length !== ORDERED_SLOPES.length)
  throw new Error(`Error: pose count mismatch! Expected ${ORDERED_SLOPES.length}, got ${terrainSceneSpec.poses.length}.`);

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
