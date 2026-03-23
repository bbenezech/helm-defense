import { TERRAIN_TILE_INDEX, type TerrainTileName } from "../../src/game/lib/terrain.ts";
import type { ImageData } from "../../src/game/lib/heightmap.ts";
import {
  terrainSceneSpec,
  type TerrainSceneSpec,
  type TerrainTextureQuarterTurn,
  type TerrainTextureRotation,
} from "./terrain-scene-spec.ts";

export type BinaryFrame = { width: number; height: number; coverage: Uint8Array<ArrayBuffer> };

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };
type Mat3 = [Vec3, Vec3, Vec3];
type ProjectedVertex = { x: number; y: number; depth: number };
type ScreenTriangle = [Vec2, Vec2, Vec2];
export type LocalPoint = { u: number; v: number };
export type LocalUvFrame = {
  width: number;
  height: number;
  coverage: Uint8Array<ArrayBuffer>;
  uValues: Float32Array<ArrayBuffer>;
  vValues: Float32Array<ArrayBuffer>;
};
type CheckerRasterFrame = ImageData;
type NeighborOffset = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

const PIXEL_SAMPLE_BIAS = 1e-6;
const DEPTH_EPSILON = 1e-9;
const TOP_SURFACE_BASE_Y = 32;
const HALF_TILE_WIDTH = 64;
const HALF_TILE_HEIGHT = 32;
const HEIGHT_STEP = 16;
const CHECKER_ALPHA = 255;
export const DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS = 4;
export const DEFAULT_CHECKER_ATLAS_LIGHT_VALUE = 224;
export const DEFAULT_CHECKER_ATLAS_DARK_VALUE = 80;
const CHECKER_FILL_NEIGHBORS: NeighborOffset[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function transpose(matrix: Mat3): Mat3 {
  return [
    { x: matrix[0].x, y: matrix[1].x, z: matrix[2].x },
    { x: matrix[0].y, y: matrix[1].y, z: matrix[2].y },
    { x: matrix[0].z, y: matrix[1].z, z: matrix[2].z },
  ];
}

function multiplyMatrixVector(matrix: Mat3, vector: Vec3): Vec3 {
  return {
    x: matrix[0].x * vector.x + matrix[0].y * vector.y + matrix[0].z * vector.z,
    y: matrix[1].x * vector.x + matrix[1].y * vector.y + matrix[1].z * vector.z,
    z: matrix[2].x * vector.x + matrix[2].y * vector.y + matrix[2].z * vector.z,
  };
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function eulerXYZToMatrix(xRad: number, yRad: number, zRad: number): Mat3 {
  const cosX = Math.cos(xRad);
  const sinX = Math.sin(xRad);
  const cosY = Math.cos(yRad);
  const sinY = Math.sin(yRad);
  const cosZ = Math.cos(zRad);
  const sinZ = Math.sin(zRad);

  return [
    { x: cosZ * cosY, y: cosZ * sinY * sinX - sinZ * cosX, z: cosZ * sinY * cosX + sinZ * sinX },
    { x: sinZ * cosY, y: sinZ * sinY * sinX + cosZ * cosX, z: sinZ * sinY * cosX - cosZ * sinX },
    { x: -sinY, y: cosY * sinX, z: cosY * cosX },
  ];
}

function rotateAroundZ(vector: Vec3, angleRad: number): Vec3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos, z: vector.z };
}

function edgeFunction(a: Vec2, b: Vec2, p: Vec2) {
  return (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
}

function getSceneVertices(sceneSpec: TerrainSceneSpec): Vec3[] {
  return sceneSpec.mesh.vertices.map(([x, y, z]) => ({ x, y, z }));
}

function projectVerticesForPose(sceneSpec: TerrainSceneSpec, poseIndex: number): ProjectedVertex[] {
  const vertices = getSceneVertices(sceneSpec);
  const pose = sceneSpec.poses[poseIndex];
  if (pose === undefined) throw new Error(`Missing pose ${poseIndex}`);

  const camera = sceneSpec.render.camera;
  const cameraMatrix = eulerXYZToMatrix(
    toRadians(camera.rotationDeg.x),
    toRadians(camera.rotationDeg.y),
    toRadians(camera.rotationDeg.z),
  );
  const worldToCamera = transpose(cameraMatrix);
  const cameraLocation: Vec3 = { x: camera.location.x, y: camera.location.y, z: camera.location.z };

  const viewWidth = camera.orthoScale;
  const resolution = sceneSpec.render.resolution;
  const viewHeight = (camera.orthoScale * resolution.height) / resolution.width;
  const translation: Vec3 = { x: pose.x, y: pose.y, z: 0 };

  return vertices.map((vertex) => {
    const world = rotateAroundZ(vertex, pose.rotationZRad);
    world.x += translation.x;
    world.y += translation.y;
    const cameraSpace = multiplyMatrixVector(worldToCamera, subtractVec3(world, cameraLocation));
    return {
      x: (cameraSpace.x / viewWidth + 0.5) * resolution.width,
      y: (0.5 - cameraSpace.y / viewHeight) * resolution.height,
      depth: cameraSpace.z,
    };
  });
}

function rasterizeTriangle(
  coverage: Uint8Array<ArrayBuffer>,
  depthBuffer: Float64Array<ArrayBuffer>,
  frameWidth: number,
  frameHeight: number,
  triangle: [ProjectedVertex, ProjectedVertex, ProjectedVertex],
) {
  let [v0, v1, v2] = triangle;
  let area = edgeFunction(v0, v1, v2);
  if (Math.abs(area) <= DEPTH_EPSILON) return;
  if (area < 0) {
    [v1, v2] = [v2, v1];
    area = -area;
  }

  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(frameWidth - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)) - 1);
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(frameHeight - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)) - 1);
  if (minX > maxX || minY > maxY) return;

  for (let pixelY = minY; pixelY <= maxY; pixelY++) {
    const sampleY = pixelY + 0.5 - PIXEL_SAMPLE_BIAS;
    for (let pixelX = minX; pixelX <= maxX; pixelX++) {
      const sample = { x: pixelX + 0.5 - PIXEL_SAMPLE_BIAS, y: sampleY };
      const weight0 = edgeFunction(v1, v2, sample);
      const weight1 = edgeFunction(v2, v0, sample);
      const weight2 = edgeFunction(v0, v1, sample);
      if (weight0 < 0 || weight1 < 0 || weight2 < 0) continue;

      const barycentric0 = weight0 / area;
      const barycentric1 = weight1 / area;
      const barycentric2 = weight2 / area;
      const depth = barycentric0 * v0.depth + barycentric1 * v1.depth + barycentric2 * v2.depth;
      const index = pixelY * frameWidth + pixelX;
      if (depth <= depthBuffer[index] + DEPTH_EPSILON) continue;
      depthBuffer[index] = depth;
      coverage[index] = 1;
    }
  }
}

function rasterizeUvTriangle(
  coverage: Uint8Array<ArrayBuffer>,
  depthBuffer: Float64Array<ArrayBuffer>,
  uValues: Float32Array<ArrayBuffer>,
  vValues: Float32Array<ArrayBuffer>,
  frameWidth: number,
  frameHeight: number,
  triangle: [ProjectedVertex, ProjectedVertex, ProjectedVertex],
  triangleUvs: [LocalPoint, LocalPoint, LocalPoint],
) {
  let [v0, v1, v2] = triangle;
  let [uv0, uv1, uv2] = triangleUvs;
  let area = edgeFunction(v0, v1, v2);
  if (Math.abs(area) <= DEPTH_EPSILON) return;
  if (area < 0) {
    [v1, v2] = [v2, v1];
    [uv1, uv2] = [uv2, uv1];
    area = -area;
  }

  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(frameWidth - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)) - 1);
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(frameHeight - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)) - 1);
  if (minX > maxX || minY > maxY) return;

  for (let pixelY = minY; pixelY <= maxY; pixelY++) {
    const sampleY = pixelY + 0.5 - PIXEL_SAMPLE_BIAS;
    for (let pixelX = minX; pixelX <= maxX; pixelX++) {
      const sample = { x: pixelX + 0.5 - PIXEL_SAMPLE_BIAS, y: sampleY };
      const weight0 = edgeFunction(v1, v2, sample);
      const weight1 = edgeFunction(v2, v0, sample);
      const weight2 = edgeFunction(v0, v1, sample);
      if (weight0 < 0 || weight1 < 0 || weight2 < 0) continue;

      const barycentric0 = weight0 / area;
      const barycentric1 = weight1 / area;
      const barycentric2 = weight2 / area;
      const depth = barycentric0 * v0.depth + barycentric1 * v1.depth + barycentric2 * v2.depth;
      const index = pixelY * frameWidth + pixelX;
      if (depth <= depthBuffer[index] + DEPTH_EPSILON) continue;

      depthBuffer[index] = depth;
      coverage[index] = 1;
      uValues[index] = barycentric0 * uv0.u + barycentric1 * uv1.u + barycentric2 * uv2.u;
      vValues[index] = barycentric0 * uv0.v + barycentric1 * uv1.v + barycentric2 * uv2.v;
    }
  }
}

function rasterizeSceneSilhouetteFrame(sceneSpec: TerrainSceneSpec, poseIndex: number): BinaryFrame {
  const width = sceneSpec.render.resolution.width;
  const height = sceneSpec.render.resolution.height;
  const projectedVertices = projectVerticesForPose(sceneSpec, poseIndex);
  const coverage = new Uint8Array(width * height);
  const depthBuffer = new Float64Array(width * height).fill(Number.NEGATIVE_INFINITY);

  for (const polygon of sceneSpec.mesh.polygons) {
    if (polygon.indices.length < 3) continue;
    for (let triangleIndex = 1; triangleIndex < polygon.indices.length - 1; triangleIndex++) {
      const vertex0 = projectedVertices[polygon.indices[0]];
      const vertex1 = projectedVertices[polygon.indices[triangleIndex]];
      const vertex2 = projectedVertices[polygon.indices[triangleIndex + 1]];
      if (vertex0 === undefined || vertex1 === undefined || vertex2 === undefined) {
        throw new Error(`Scene spec polygon references a missing vertex.`);
      }
      rasterizeTriangle(coverage, depthBuffer, width, height, [vertex0, vertex1, vertex2]);
    }
  }

  return { width, height, coverage };
}

export function rasterizeVisibleUvFrame(sceneSpec: TerrainSceneSpec, poseIndex: number): LocalUvFrame {
  const width = sceneSpec.render.resolution.width;
  const height = sceneSpec.render.resolution.height;
  const projectedVertices = projectVerticesForPose(sceneSpec, poseIndex);
  const coverage = new Uint8Array(width * height);
  const depthBuffer = new Float64Array(width * height).fill(Number.NEGATIVE_INFINITY);
  const uValues = new Float32Array(width * height);
  const vValues = new Float32Array(width * height);

  for (const polygon of sceneSpec.mesh.polygons) {
    if (polygon.indices.length < 3) continue;
    for (let triangleIndex = 1; triangleIndex < polygon.indices.length - 1; triangleIndex++) {
      const vertex0 = projectedVertices[polygon.indices[0]];
      const vertex1 = projectedVertices[polygon.indices[triangleIndex]];
      const vertex2 = projectedVertices[polygon.indices[triangleIndex + 1]];
      const uv0 = polygon.uvs[0];
      const uv1 = polygon.uvs[triangleIndex];
      const uv2 = polygon.uvs[triangleIndex + 1];
      if (
        vertex0 === undefined ||
        vertex1 === undefined ||
        vertex2 === undefined ||
        uv0 === undefined ||
        uv1 === undefined ||
        uv2 === undefined
      ) {
        throw new Error(`Scene spec polygon references a missing vertex or UV.`);
      }

      rasterizeUvTriangle(
        coverage,
        depthBuffer,
        uValues,
        vValues,
        width,
        height,
        [vertex0, vertex1, vertex2],
        [
          { u: uv0[0], v: uv0[1] },
          { u: uv1[0], v: uv1[1] },
          { u: uv2[0], v: uv2[1] },
        ],
      );
    }
  }

  return { width, height, coverage, uValues, vValues };
}

const toScreen = (x: number, y: number, height: number): Vec2 => ({
  x: HALF_TILE_WIDTH + HALF_TILE_WIDTH * (x - y),
  y: TOP_SURFACE_BASE_Y + HALF_TILE_HEIGHT * (x + y) - HEIGHT_STEP * height,
});

function getTopSurfaceScreenVertices(tileName: TerrainTileName) {
  const tile = TERRAIN_TILE_INDEX[tileName];
  if (tile === undefined) throw new Error(`Unknown terrain tile "${tileName}"`);
  return {
    N: toScreen(0, 0, tile.N),
    E: toScreen(1, 0, tile.E),
    S: toScreen(1, 1, tile.S),
    W: toScreen(0, 1, tile.W),
    C: toScreen(0.5, 0.5, tile.CENTER),
  };
}

function rasterizeTopSurfaceFrame(
  tileName: TerrainTileName,
  sceneSpec: TerrainSceneSpec,
  excludeSouthAndEastBoundaries: boolean,
): BinaryFrame {
  const uvFrame = rasterizeTopSurfaceLocalUvFrame(tileName, sceneSpec, excludeSouthAndEastBoundaries);
  return { width: uvFrame.width, height: uvFrame.height, coverage: uvFrame.coverage };
}

function rasterizeTopSurfaceLocalUvFrame(
  tileName: TerrainTileName,
  sceneSpec: TerrainSceneSpec,
  excludeSouthAndEastBoundaries: boolean,
): LocalUvFrame {
  const width = sceneSpec.render.resolution.width;
  const height = sceneSpec.render.resolution.height;
  const { N, E, S, W, C } = getTopSurfaceScreenVertices(tileName);
  const coverage = new Uint8Array(width * height);
  const uValues = new Float32Array(width * height);
  const vValues = new Float32Array(width * height);
  const triangles: Array<{ screen: ScreenTriangle; local: [LocalPoint, LocalPoint, LocalPoint] }> = [
    {
      screen: [W, N, C],
      local: [
        { u: 0, v: 1 },
        { u: 0, v: 0 },
        { u: 0.5, v: 0.5 },
      ],
    },
    {
      screen: [N, E, C],
      local: [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0.5, v: 0.5 },
      ],
    },
    {
      screen: [E, S, C],
      local: [
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 0.5, v: 0.5 },
      ],
    },
    {
      screen: [S, W, C],
      local: [
        { u: 1, v: 1 },
        { u: 0, v: 1 },
        { u: 0.5, v: 0.5 },
      ],
    },
  ];

  for (const { screen, local } of triangles) {
    let [v0, v1, v2] = screen;
    let [local0, local1, local2] = local;
    let area = edgeFunction(v0, v1, v2);
    if (Math.abs(area) <= DEPTH_EPSILON) continue;
    if (area < 0) {
      [v1, v2] = [v2, v1];
      [local1, local2] = [local2, local1];
      area = -area;
    }

    const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)) - 1);
    const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)) - 1);
    if (minX > maxX || minY > maxY) continue;

    for (let pixelY = minY; pixelY <= maxY; pixelY++) {
      for (let pixelX = minX; pixelX <= maxX; pixelX++) {
        const sample = { x: pixelX + 0.5, y: pixelY + 0.5 };
        const barycentric0 = edgeFunction(v1, v2, sample) / area;
        const barycentric1 = edgeFunction(v2, v0, sample) / area;
        const barycentric2 = edgeFunction(v0, v1, sample) / area;
        if (barycentric0 < -PIXEL_SAMPLE_BIAS || barycentric1 < -PIXEL_SAMPLE_BIAS || barycentric2 < -PIXEL_SAMPLE_BIAS)
          continue;

        const localU = barycentric0 * local0.u + barycentric1 * local1.u + barycentric2 * local2.u;
        const localV = barycentric0 * local0.v + barycentric1 * local1.v + barycentric2 * local2.v;
        const ownsU = localU >= -PIXEL_SAMPLE_BIAS && localU < 1 - PIXEL_SAMPLE_BIAS;
        const ownsV = localV >= -PIXEL_SAMPLE_BIAS && localV < 1 - PIXEL_SAMPLE_BIAS;
        const fullU = localU >= -PIXEL_SAMPLE_BIAS && localU <= 1 + PIXEL_SAMPLE_BIAS;
        const fullV = localV >= -PIXEL_SAMPLE_BIAS && localV <= 1 + PIXEL_SAMPLE_BIAS;

        if (excludeSouthAndEastBoundaries ? ownsU && ownsV : fullU && fullV) {
          const pixelIndex = pixelY * width + pixelX;
          coverage[pixelIndex] = 1;
          uValues[pixelIndex] = localU;
          vValues[pixelIndex] = localV;
        }
      }
    }
  }

  return { width, height, coverage, uValues, vValues };
}

export function rasterizeOwnershipFrame(sceneSpec: TerrainSceneSpec, poseIndex: number): BinaryFrame {
  const tileName = sceneSpec.order[poseIndex];
  if (tileName === undefined) throw new Error(`Missing terrain tile order entry ${poseIndex}`);

  const sceneFrame = rasterizeSceneSilhouetteFrame(sceneSpec, poseIndex);
  const topSurfaceFull = rasterizeTopSurfaceFrame(tileName, sceneSpec, false);
  const topSurfaceFullExpanded = dilateBinaryFrame(topSurfaceFull);
  const topSurfaceOwned = rasterizeTopSurfaceFrame(tileName, sceneSpec, true);
  const coverage = new Uint8Array(sceneFrame.coverage.length);

  for (let pixelIndex = 0; pixelIndex < sceneFrame.coverage.length; pixelIndex++) {
    const ownedTopPixel = topSurfaceOwned.coverage[pixelIndex];
    const sidePixel =
      sceneFrame.coverage[pixelIndex] === 1 && topSurfaceFullExpanded.coverage[pixelIndex] === 0 ? 1 : 0;
    coverage[pixelIndex] = ownedTopPixel === 1 || sidePixel === 1 ? 1 : 0;
  }

  return { width: sceneFrame.width, height: sceneFrame.height, coverage };
}

export function rasterizeOwnershipFrames(sceneSpec: TerrainSceneSpec = terrainSceneSpec): BinaryFrame[] {
  return sceneSpec.poses.map((_, poseIndex) => rasterizeOwnershipFrame(sceneSpec, poseIndex));
}

function rasterizeCheckerSeedFrame(sceneSpec: TerrainSceneSpec, poseIndex: number): BinaryFrame {
  const ownershipFrame = rasterizeOwnershipFrame(sceneSpec, poseIndex);
  const visibleUvFrame = rasterizeVisibleUvFrame(sceneSpec, poseIndex);
  const coverage = new Uint8Array(ownershipFrame.coverage.length);

  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    coverage[pixelIndex] =
      ownershipFrame.coverage[pixelIndex] === 1 && visibleUvFrame.coverage[pixelIndex] === 1 ? 1 : 0;
  }

  return { width: ownershipFrame.width, height: ownershipFrame.height, coverage };
}

export function rasterizeCheckerSeedFrames(sceneSpec: TerrainSceneSpec = terrainSceneSpec): BinaryFrame[] {
  return sceneSpec.poses.map((_, poseIndex) => rasterizeCheckerSeedFrame(sceneSpec, poseIndex));
}

function getCheckerCellIndex(coordinate: number, cellsPerAxis: number): number {
  const clampedCoordinate = coordinate < 0 ? 0 : coordinate >= 1 ? 1 - PIXEL_SAMPLE_BIAS : coordinate;
  return Math.floor(clampedCoordinate * cellsPerAxis);
}

export function flipUnitCoordinateForTextureRows(coordinate: number): number {
  return 1 - coordinate;
}

function writeCheckerPixel(data: Uint8ClampedArray<ArrayBuffer>, pixelIndex: number, checkerValue: number) {
  const dataOffset = pixelIndex * 4;
  data[dataOffset] = checkerValue;
  data[dataOffset + 1] = checkerValue;
  data[dataOffset + 2] = checkerValue;
  data[dataOffset + 3] = CHECKER_ALPHA;
}

function floodFillCheckerCoverage(
  ownershipFrame: BinaryFrame,
  assignedCoverage: Uint8Array<ArrayBuffer>,
  checkerValues: Uint8Array<ArrayBuffer>,
  data: Uint8ClampedArray<ArrayBuffer>,
) {
  const queue: number[] = [];
  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    if (assignedCoverage[pixelIndex] === 1) queue.push(pixelIndex);
  }

  if (queue.length === 0) {
    throw new Error("Checker rasterization requires at least one visible UV seed pixel.");
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const pixelIndex = queue[queueIndex];
    if (pixelIndex === undefined) throw new Error(`Missing checker fill queue entry ${queueIndex}.`);
    const checkerValue = checkerValues[pixelIndex];
    const pixelX = pixelIndex % ownershipFrame.width;
    const pixelY = Math.floor(pixelIndex / ownershipFrame.width);

    for (const offset of CHECKER_FILL_NEIGHBORS) {
      const neighborX = pixelX + offset.x;
      const neighborY = pixelY + offset.y;
      if (neighborX < 0 || neighborY < 0 || neighborX >= ownershipFrame.width || neighborY >= ownershipFrame.height)
        continue;

      const neighborIndex = neighborY * ownershipFrame.width + neighborX;
      if (ownershipFrame.coverage[neighborIndex] !== 1 || assignedCoverage[neighborIndex] === 1) continue;

      assignedCoverage[neighborIndex] = 1;
      checkerValues[neighborIndex] = checkerValue;
      writeCheckerPixel(data, neighborIndex, checkerValue);
      queue.push(neighborIndex);
    }
  }

  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    if (ownershipFrame.coverage[pixelIndex] === 1 && assignedCoverage[pixelIndex] !== 1) {
      throw new Error(`Checker flood fill left ownership pixel ${pixelIndex} unassigned.`);
    }
  }
}

function rotateTerrainUvByQuarterTurn(quarterTurn: TerrainTextureQuarterTurn, uv: LocalPoint): LocalPoint {
  switch (quarterTurn) {
    case 0: {
      return uv;
    }
    case 1: {
      return { u: 1 - uv.v, v: uv.u };
    }
    case 2: {
      return { u: 1 - uv.u, v: 1 - uv.v };
    }
    case 3: {
      return { u: uv.v, v: 1 - uv.u };
    }
    default: {
      throw new Error(`Unexpected quarter turn ${quarterTurn satisfies never}.`);
    }
  }
}

export function getTerrainTextureQuarterTurn(
  textureRotation: TerrainTextureRotation,
  pose: TerrainSceneSpec["poses"][number],
): TerrainTextureQuarterTurn {
  if (textureRotation === "cameraAlignedLegacy") return pose.textureQuarterTurn;
  if (textureRotation === "quarterTurn") return 1;
  return 0;
}

export function applyTerrainTextureRotation(
  textureRotation: TerrainTextureRotation,
  pose: TerrainSceneSpec["poses"][number],
  uv: LocalPoint,
): LocalPoint {
  return rotateTerrainUvByQuarterTurn(getTerrainTextureQuarterTurn(textureRotation, pose), uv);
}

export function rasterizeCheckerFrames(
  {
    cellsPerAxis,
    lightValue,
    darkValue,
    textureRotation,
  }: { cellsPerAxis: number; lightValue: number; darkValue: number; textureRotation: TerrainTextureRotation },
  sceneSpec: TerrainSceneSpec = terrainSceneSpec,
): CheckerRasterFrame[] {
  if (cellsPerAxis <= 0) throw new Error(`Checker cells per axis must be greater than zero, received ${cellsPerAxis}.`);

  return sceneSpec.poses.map((pose, poseIndex) => {
    const ownershipFrame = rasterizeOwnershipFrame(sceneSpec, poseIndex);
    const visibleUvFrame = rasterizeVisibleUvFrame(sceneSpec, poseIndex);
    const data = new Uint8ClampedArray(ownershipFrame.coverage.length * 4);
    const assignedCoverage = new Uint8Array(ownershipFrame.coverage.length);
    const checkerValues = new Uint8Array(ownershipFrame.coverage.length);

    for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
      if (ownershipFrame.coverage[pixelIndex] !== 1) continue;
      if (visibleUvFrame.coverage[pixelIndex] !== 1) continue;

      const rotatedUv = applyTerrainTextureRotation(textureRotation, pose, {
        u: visibleUvFrame.uValues[pixelIndex],
        v: visibleUvFrame.vValues[pixelIndex],
      });
      const checkerU = getCheckerCellIndex(rotatedUv.u, cellsPerAxis);
      const checkerV = getCheckerCellIndex(flipUnitCoordinateForTextureRows(rotatedUv.v), cellsPerAxis);
      const checkerValue = (checkerU + checkerV) % 2 === 0 ? lightValue : darkValue;
      assignedCoverage[pixelIndex] = 1;
      checkerValues[pixelIndex] = checkerValue;
      writeCheckerPixel(data, pixelIndex, checkerValue);
    }

    floodFillCheckerCoverage(ownershipFrame, assignedCoverage, checkerValues, data);

    return { width: ownershipFrame.width, height: ownershipFrame.height, channels: 4, data };
  });
}

export function countCoveredPixels(frame: BinaryFrame) {
  return frame.coverage.reduce((count, pixel) => count + pixel, 0);
}

function dilateBinaryFrame(frame: BinaryFrame): BinaryFrame {
  const coverage = new Uint8Array(frame.coverage.length);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.coverage[y * frame.width + x] === 0) continue;
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const sampleY = y + offsetY;
        if (sampleY < 0 || sampleY >= frame.height) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const sampleX = x + offsetX;
          if (sampleX < 0 || sampleX >= frame.width) continue;
          coverage[sampleY * frame.width + sampleX] = 1;
        }
      }
    }
  }
  return { width: frame.width, height: frame.height, coverage };
}
