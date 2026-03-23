import terrainSceneSpecJson from "./terrain-scene-spec.json" with { type: "json" };
import { TERRAIN_TILE_COUNT, type TerrainTileName } from "../../src/game/lib/terrain.ts";

type ScenePoint3 = [number, number, number];
type ScenePoint2 = [number, number];
export type TerrainTextureQuarterTurn = 0 | 1 | 2 | 3;

export type TerrainSceneSpec = {
  render: {
    resolution: { width: number; height: number };
    camera: {
      location: { x: number; y: number; z: number };
      rotationDeg: { x: number; y: number; z: number };
      orthoScale: number;
      clipStart: number;
      clipEnd: number;
    };
    frame: { start: number; end: number; fps: number };
  };
  order: TerrainTileName[];
  mesh: {
    vertices: ScenePoint3[];
    polygons: { indices: number[]; materialIndex: number; uvs: ScenePoint2[] }[];
  };
  poses: { x: number; y: number; rotationZRad: number; textureQuarterTurn: TerrainTextureQuarterTurn }[];
};

export const terrainSceneSpec = terrainSceneSpecJson as TerrainSceneSpec;
export type TerrainTextureRotation = "none" | "quarterTurn" | "cameraAlignedLegacy";

export const TERRAIN_RENDER_CONTRACT = {
  resolution: terrainSceneSpec.render.resolution,
  camera: terrainSceneSpec.render.camera,
  frameStart: terrainSceneSpec.render.frame.start,
  frameEnd: terrainSceneSpec.render.frame.end,
  fps: terrainSceneSpec.render.frame.fps,
} as const;

export const ORDERED_SLOPES = terrainSceneSpec.order satisfies TerrainTileName[];
export const ACTIVE_TERRAIN_TEXTURE_ROTATION: TerrainTextureRotation = "cameraAlignedLegacy";

if (new Set(ORDERED_SLOPES).size !== TERRAIN_TILE_COUNT) {
  throw new Error(
    `Terrain scene slope count mismatch: expected ${TERRAIN_TILE_COUNT}, got ${new Set(ORDERED_SLOPES).size}.`,
  );
}

const expectedFrameCount = TERRAIN_RENDER_CONTRACT.frameEnd - TERRAIN_RENDER_CONTRACT.frameStart + 1;
if (expectedFrameCount !== ORDERED_SLOPES.length) {
  throw new Error(`Terrain scene frame count mismatch: expected ${ORDERED_SLOPES.length}, got ${expectedFrameCount}.`);
}
if (terrainSceneSpec.poses.length !== ORDERED_SLOPES.length) {
  throw new Error(`Terrain scene pose count mismatch: expected ${ORDERED_SLOPES.length}, got ${terrainSceneSpec.poses.length}.`);
}
for (const [poseIndex, pose] of terrainSceneSpec.poses.entries()) {
  if (pose.textureQuarterTurn !== 0 && pose.textureQuarterTurn !== 1 && pose.textureQuarterTurn !== 2 && pose.textureQuarterTurn !== 3) {
    throw new Error(`Terrain scene pose ${poseIndex} has invalid texture quarter turn ${pose.textureQuarterTurn}.`);
  }
}
