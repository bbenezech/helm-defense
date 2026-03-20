import { terrainSceneSpec, type TerrainSceneSpec } from "./terrain-scene-spec.ts";

export type RgbaFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};

type Vec2 = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };
type Mat3 = [Vec3, Vec3, Vec3];
type ProjectedVertex = { x: number; y: number; depth: number };

const PIXEL_SAMPLE_BIAS = 1e-6;
const DEPTH_EPSILON = 1e-9;

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

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizeVec3(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= DEPTH_EPSILON) throw new Error("Terrain metadata rasterizer reached a zero-length normal.");
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
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

function getWorldPolygonNormal(sceneSpec: TerrainSceneSpec, poseIndex: number, polygonIndex: number): Vec3 {
  const pose = sceneSpec.poses[poseIndex];
  if (pose === undefined) throw new Error(`Missing pose ${poseIndex}`);
  const polygon = sceneSpec.mesh.polygons[polygonIndex];
  if (polygon === undefined) throw new Error(`Missing polygon ${polygonIndex}`);
  if (polygon.indices.length < 3) throw new Error(`Polygon ${polygonIndex} must contain at least three vertices.`);

  const vertices = getSceneVertices(sceneSpec);
  const vertex0 = vertices[polygon.indices[0]];
  const vertex1 = vertices[polygon.indices[1]];
  const vertex2 = vertices[polygon.indices[2]];
  if (vertex0 === undefined || vertex1 === undefined || vertex2 === undefined) {
    throw new Error(`Polygon ${polygonIndex} references a missing vertex.`);
  }

  const world0 = rotateAroundZ(vertex0, pose.rotationZRad);
  const world1 = rotateAroundZ(vertex1, pose.rotationZRad);
  const world2 = rotateAroundZ(vertex2, pose.rotationZRad);
  return normalizeVec3(crossVec3(subtractVec3(world1, world0), subtractVec3(world2, world0)));
}

function encodeNormalComponent(value: number): number {
  const encoded = Math.round((value * 0.5 + 0.5) * 255);
  return Math.min(255, Math.max(0, encoded));
}

function rasterizeMetadataTriangle(
  frame: RgbaFrame,
  depthBuffer: Float64Array<ArrayBuffer>,
  triangle: [ProjectedVertex, ProjectedVertex, ProjectedVertex],
  normal: Vec3,
) {
  let [v0, v1, v2] = triangle;
  let area = edgeFunction(v0, v1, v2);
  if (Math.abs(area) <= DEPTH_EPSILON) return;
  if (area < 0) {
    [v1, v2] = [v2, v1];
    area = -area;
  }

  const minX = Math.max(0, Math.floor(Math.min(v0.x, v1.x, v2.x)));
  const maxX = Math.min(frame.width - 1, Math.ceil(Math.max(v0.x, v1.x, v2.x)) - 1);
  const minY = Math.max(0, Math.floor(Math.min(v0.y, v1.y, v2.y)));
  const maxY = Math.min(frame.height - 1, Math.ceil(Math.max(v0.y, v1.y, v2.y)) - 1);
  if (minX > maxX || minY > maxY) return;

  const encodedRed = encodeNormalComponent(normal.x);
  const encodedGreen = encodeNormalComponent(normal.y);
  const encodedBlue = encodeNormalComponent(normal.z);

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
      const depthIndex = pixelY * frame.width + pixelX;
      if (depth <= depthBuffer[depthIndex] + DEPTH_EPSILON) continue;
      depthBuffer[depthIndex] = depth;

      const pixelIndex = depthIndex * 4;
      frame.data[pixelIndex] = encodedRed;
      frame.data[pixelIndex + 1] = encodedGreen;
      frame.data[pixelIndex + 2] = encodedBlue;
      frame.data[pixelIndex + 3] = 255;
    }
  }
}

export function rasterizeMetadataFrame(sceneSpec: TerrainSceneSpec, poseIndex: number): RgbaFrame {
  const width = sceneSpec.render.resolution.width;
  const height = sceneSpec.render.resolution.height;
  const projectedVertices = projectVerticesForPose(sceneSpec, poseIndex);
  const frame: RgbaFrame = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
  const depthBuffer = new Float64Array(width * height).fill(Number.NEGATIVE_INFINITY);

  for (const [polygonIndex, polygon] of sceneSpec.mesh.polygons.entries()) {
    if (polygon.indices.length < 3) continue;
    const normal = getWorldPolygonNormal(sceneSpec, poseIndex, polygonIndex);

    for (let triangleIndex = 1; triangleIndex < polygon.indices.length - 1; triangleIndex++) {
      const vertex0 = projectedVertices[polygon.indices[0]];
      const vertex1 = projectedVertices[polygon.indices[triangleIndex]];
      const vertex2 = projectedVertices[polygon.indices[triangleIndex + 1]];
      if (vertex0 === undefined || vertex1 === undefined || vertex2 === undefined) {
        throw new Error(`Scene spec polygon ${polygonIndex} references a missing projected vertex.`);
      }

      rasterizeMetadataTriangle(frame, depthBuffer, [vertex0, vertex1, vertex2], normal);
    }
  }

  return frame;
}

export function rasterizeMetadataFrames(sceneSpec: TerrainSceneSpec = terrainSceneSpec): RgbaFrame[] {
  return sceneSpec.poses.map((_, poseIndex) => rasterizeMetadataFrame(sceneSpec, poseIndex));
}
