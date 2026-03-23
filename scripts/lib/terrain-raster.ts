import type { ImageData } from "../../src/game/lib/heightmap.ts";
import {
  ACTIVE_TERRAIN_TEXTURE_ROTATION,
  terrainSceneSpec,
  type TerrainSceneSpec,
  type TerrainTextureRotation,
} from "./terrain-scene-spec.ts";
import {
  applyTerrainTextureRotation,
  flipUnitCoordinateForTextureRows,
  rasterizeOwnershipFrame,
  rasterizeVisibleUvFrame,
  type BinaryFrame,
} from "./terrain-ownership.ts";

type ColorSample = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

type NeighborOffset = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

const PIXEL_SAMPLE_BIAS = 1e-6;
const FILL_NEIGHBORS: NeighborOffset[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function clampTextureCoordinate(coordinate: number): number {
  if (coordinate < 0) return 0;
  if (coordinate >= 1) return 1 - PIXEL_SAMPLE_BIAS;
  return coordinate;
}

function getTexturePixelIndex(coordinate: number, size: number): number {
  if (size <= 0) throw new Error(`Texture size must be greater than zero, received ${size}.`);
  return Math.floor(clampTextureCoordinate(coordinate) * size);
}

function writeOpaqueColor(data: Uint8ClampedArray<ArrayBuffer>, pixelIndex: number, color: ColorSample) {
  const dataIndex = pixelIndex * 4;
  data[dataIndex] = color.red;
  data[dataIndex + 1] = color.green;
  data[dataIndex + 2] = color.blue;
  data[dataIndex + 3] = 255;
}

function copyAssignedColor(data: Uint8ClampedArray<ArrayBuffer>, fromPixelIndex: number, toPixelIndex: number) {
  const fromDataIndex = fromPixelIndex * 4;
  const toDataIndex = toPixelIndex * 4;
  data[toDataIndex] = data[fromDataIndex];
  data[toDataIndex + 1] = data[fromDataIndex + 1];
  data[toDataIndex + 2] = data[fromDataIndex + 2];
  data[toDataIndex + 3] = data[fromDataIndex + 3];
}

function floodFillOwnershipColors(
  ownershipFrame: BinaryFrame,
  assignedCoverage: Uint8Array<ArrayBuffer>,
  data: Uint8ClampedArray<ArrayBuffer>,
) {
  const queue: number[] = [];

  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    if (assignedCoverage[pixelIndex] === 1) queue.push(pixelIndex);
  }

  if (queue.length === 0) {
    throw new Error("Terrain beauty rasterization requires at least one visible UV seed pixel.");
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
    const pixelIndex = queue[queueIndex];
    if (pixelIndex === undefined) throw new Error(`Missing terrain fill queue entry ${queueIndex}.`);

    const pixelX = pixelIndex % ownershipFrame.width;
    const pixelY = Math.floor(pixelIndex / ownershipFrame.width);

    for (const offset of FILL_NEIGHBORS) {
      const neighborX = pixelX + offset.x;
      const neighborY = pixelY + offset.y;
      if (neighborX < 0 || neighborY < 0 || neighborX >= ownershipFrame.width || neighborY >= ownershipFrame.height) {
        continue;
      }

      const neighborIndex = neighborY * ownershipFrame.width + neighborX;
      if (ownershipFrame.coverage[neighborIndex] !== 1 || assignedCoverage[neighborIndex] === 1) continue;

      assignedCoverage[neighborIndex] = 1;
      copyAssignedColor(data, pixelIndex, neighborIndex);
      queue.push(neighborIndex);
    }
  }

  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    if (ownershipFrame.coverage[pixelIndex] === 1 && assignedCoverage[pixelIndex] !== 1) {
      throw new Error(`Terrain beauty flood fill left ownership pixel ${pixelIndex} unassigned.`);
    }
  }
}

export function sampleTerrainTexture(texture: ImageData, uv: { u: number; v: number }): ColorSample {
  if (texture.channels !== 4) {
    throw new Error(`Terrain beauty rasterizer requires RGBA textures, received ${texture.channels} channels.`);
  }

  const textureX = getTexturePixelIndex(uv.u, texture.width);
  const textureY = getTexturePixelIndex(flipUnitCoordinateForTextureRows(uv.v), texture.height);
  const dataIndex = (textureY * texture.width + textureX) * texture.channels;
  const red = texture.data[dataIndex];
  const green = texture.data[dataIndex + 1];
  const blue = texture.data[dataIndex + 2];
  const alpha = texture.data[dataIndex + 3];
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new Error(`Terrain beauty sample ${textureX},${textureY} is out of bounds.`);
  }

  return { red, green, blue, alpha };
}

export function rasterizeTerrainFrame(
  texture: ImageData,
  poseIndex: number,
  sceneSpec: TerrainSceneSpec = terrainSceneSpec,
  textureRotation: TerrainTextureRotation = ACTIVE_TERRAIN_TEXTURE_ROTATION,
): ImageData {
  const pose = sceneSpec.poses[poseIndex];
  if (pose === undefined) throw new Error(`Missing terrain pose ${poseIndex}.`);

  const ownershipFrame = rasterizeOwnershipFrame(sceneSpec, poseIndex);
  const visibleUvFrame = rasterizeVisibleUvFrame(sceneSpec, poseIndex);
  const data = new Uint8ClampedArray(ownershipFrame.coverage.length * 4);
  const assignedCoverage = new Uint8Array(ownershipFrame.coverage.length);

  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    if (ownershipFrame.coverage[pixelIndex] !== 1) continue;
    if (visibleUvFrame.coverage[pixelIndex] !== 1) continue;

    const sampledColor = sampleTerrainTexture(
      texture,
      applyTerrainTextureRotation(textureRotation, pose, {
        u: visibleUvFrame.uValues[pixelIndex],
        v: visibleUvFrame.vValues[pixelIndex],
      }),
    );
    if (sampledColor.alpha === 0) {
      throw new Error(`Terrain beauty raster would reveal fully transparent RGB at pose ${poseIndex}, pixel ${pixelIndex}.`);
    }

    assignedCoverage[pixelIndex] = 1;
    writeOpaqueColor(data, pixelIndex, sampledColor);
  }

  floodFillOwnershipColors(ownershipFrame, assignedCoverage, data);

  const channels = 4;
  return {
    data,
    width: ownershipFrame.width,
    height: ownershipFrame.height,
    channels,
  };
}

export function rasterizeTerrainFrames(
  texture: ImageData,
  sceneSpec: TerrainSceneSpec = terrainSceneSpec,
  textureRotation: TerrainTextureRotation = ACTIVE_TERRAIN_TEXTURE_ROTATION,
): ImageData[] {
  return sceneSpec.poses.map((_, poseIndex) => rasterizeTerrainFrame(texture, poseIndex, sceneSpec, textureRotation));
}

function getAtlasFrameOffset(
  tileset: {
    tilecount: number;
    columns: number;
    tilewidth: number;
    tileheight: number;
    spacing: number;
    margin: number;
  },
  frameIndex: number,
) {
  if (frameIndex < 0 || frameIndex >= tileset.tilecount) {
    throw new Error(`Atlas frame index ${frameIndex} is out of bounds for tilecount ${tileset.tilecount}.`);
  }

  const column = frameIndex % tileset.columns;
  const row = Math.floor(frameIndex / tileset.columns);
  return {
    left: tileset.margin + column * (tileset.tilewidth + tileset.spacing),
    top: tileset.margin + row * (tileset.tileheight + tileset.spacing),
  };
}

export function createTerrainAtlasImageData(
  frames: ImageData[],
  tileset: {
    imagewidth: number;
    imageheight: number;
    tilecount: number;
    columns: number;
    tilewidth: number;
    tileheight: number;
    spacing: number;
    margin: number;
  },
): ImageData {
  if (frames.length !== tileset.tilecount) {
    throw new Error(`Atlas frame count mismatch: expected ${tileset.tilecount}, received ${frames.length}.`);
  }

  const channels = 4;
  const data = new Uint8ClampedArray(tileset.imagewidth * tileset.imageheight * channels);

  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.channels !== channels) {
      throw new Error(`Atlas frame ${frameIndex} must use RGBA channels, received ${frame.channels}.`);
    }
    if (frame.width !== tileset.tilewidth || frame.height !== tileset.tileheight) {
      throw new Error(
        `Atlas frame ${frameIndex} size mismatch: expected ${tileset.tilewidth}x${tileset.tileheight}, received ${frame.width}x${frame.height}.`,
      );
    }

    const offset = getAtlasFrameOffset(tileset, frameIndex);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const frameDataIndex = (y * frame.width + x) * channels;
        const atlasDataIndex = ((offset.top + y) * tileset.imagewidth + offset.left + x) * channels;
        data[atlasDataIndex] = frame.data[frameDataIndex];
        data[atlasDataIndex + 1] = frame.data[frameDataIndex + 1];
        data[atlasDataIndex + 2] = frame.data[frameDataIndex + 2];
        data[atlasDataIndex + 3] = frame.data[frameDataIndex + 3];
      }
    }
  }

  return {
    data,
    width: tileset.imagewidth,
    height: tileset.imageheight,
    channels,
  };
}
