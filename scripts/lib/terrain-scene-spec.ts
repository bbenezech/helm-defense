import terrainSceneSpecJson from "./terrain-scene-spec.json" with { type: "json" };
import type { TerrainTileName } from "../../src/game/lib/terrain.ts";

type ScenePoint3 = [number, number, number];
type ScenePoint2 = [number, number];

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
  poses: { x: number; y: number; rotationZRad: number }[];
};

export const terrainSceneSpec = terrainSceneSpecJson as TerrainSceneSpec;
