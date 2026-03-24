import type { Point2 } from "./projection.ts";

export type PackedTerrainWord = number;

export type PackedTerrainStack = {
  data: Uint32Array<ArrayBuffer>;
  width: number;
  height: number;
  slices: 8;
  origin: Point2;
};

export type SurfaceCellGrid = {
  data: Uint32Array<ArrayBuffer>;
  width: number;
  height: number;
};

export type BiomeCellGrid = {
  data: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
};
