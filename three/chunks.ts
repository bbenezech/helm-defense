import type { Point2 } from "./projection.ts";

export type PackedTerrainWord = number;

export type PackedTerrainStack = {
  data: Uint32Array<ArrayBuffer>;
  width: number;
  height: number;
  slices: 8;
  origin: Point2;
};
