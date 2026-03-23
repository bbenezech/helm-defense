#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { ImageData } from "../src/game/lib/heightmap.ts";
import { parseTerrainTileset } from "../three/assets.ts";
import { imageToImageData, saveImageDataToImage } from "./lib/file.ts";
import { rasterizeVisibleUvFrame } from "./lib/terrain-ownership.ts";
import { createTerrainAtlasImageData, rasterizeTerrainFrames } from "./lib/terrain-raster.ts";
import { ORDERED_SLOPES, terrainSceneSpec } from "./lib/terrain-scene-spec.ts";

type CompassDirection = "ne" | "se" | "sw" | "nw";

type Point = {
  x: number;
  y: number;
};

type NeedleDiagnostic = {
  point: Point;
  direction: CompassDirection;
  distanceSquared: number;
  rgba: [number, number, number, number];
};

type FrameDiagnostic = {
  frameIndex: number;
  tileName: string;
  center: Point;
  redNeedle: NeedleDiagnostic;
  blueNeedle: NeedleDiagnostic;
  passed: boolean;
};

const __dirname = import.meta.dirname;
const DEFAULT_TILESET_DIRECTORY = path.resolve(__dirname, "../public/Grass_23-512x512");
const DEFAULT_REPORT_DIRECTORY = path.resolve(__dirname, "../tmp/tileset-compass-report");
const DEFAULT_COMPASS_PATH = path.resolve(__dirname, "../assets/compass.png");
const MIN_NEEDLE_RADIUS_SQUARED = 6 * 6;
const MAX_NEEDLE_RADIUS_SQUARED = 32 * 32;

const SCREEN_DIRECTIONS: Array<{ direction: CompassDirection; vector: Point }> = [
  { direction: "ne", vector: { x: 2, y: -1 } },
  { direction: "se", vector: { x: 2, y: 1 } },
  { direction: "sw", vector: { x: -2, y: 1 } },
  { direction: "nw", vector: { x: -2, y: -1 } },
];

function getCompassFrameIndices() {
  return ORDERED_SLOPES.map((tileName, frameIndex) => ({ tileName, frameIndex }));
}

function getPixelRgba(image: ImageData, x: number, y: number): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new Error(`Image pixel ${x},${y} is out of bounds for ${image.width}x${image.height}.`);
  }

  const pixelOffset = (y * image.width + x) * 4;
  const red = image.data[pixelOffset];
  const green = image.data[pixelOffset + 1];
  const blue = image.data[pixelOffset + 2];
  const alpha = image.data[pixelOffset + 3];
  return [red, green, blue, alpha];
}

function classifyCompassDirection(vector: Point): CompassDirection {
  let bestDirection: CompassDirection | null = null;
  let bestDot = Number.NEGATIVE_INFINITY;

  for (const candidate of SCREEN_DIRECTIONS) {
    const dot = vector.x * candidate.vector.x + vector.y * candidate.vector.y;
    if (dot <= bestDot) continue;

    bestDot = dot;
    bestDirection = candidate.direction;
  }

  if (bestDirection === null) throw new Error(`Could not classify compass direction for vector ${vector.x},${vector.y}.`);
  return bestDirection;
}

function findVisibleUvCenter(frameIndex: number): Point {
  const uvFrame = rasterizeVisibleUvFrame(terrainSceneSpec, frameIndex);
  let bestPixelIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let pixelIndex = 0; pixelIndex < uvFrame.coverage.length; pixelIndex++) {
    if (uvFrame.coverage[pixelIndex] !== 1) continue;

    const du = uvFrame.uValues[pixelIndex] - 0.5;
    const dv = uvFrame.vValues[pixelIndex] - 0.5;
    const distance = du * du + dv * dv;
    if (distance >= bestDistance) continue;

    bestDistance = distance;
    bestPixelIndex = pixelIndex;
  }

  if (bestPixelIndex < 0) throw new Error(`Missing visible UV center for frame ${frameIndex}.`);
  return {
    x: bestPixelIndex % terrainSceneSpec.render.resolution.width,
    y: Math.floor(bestPixelIndex / terrainSceneSpec.render.resolution.width),
  };
}

function isRedCompassPixel(rgba: [number, number, number, number]) {
  const [red, green, blue, alpha] = rgba;
  if (alpha < 160) return false;
  if (red < 140) return false;
  if (red - green < 60) return false;
  if (red - blue < 60) return false;
  return true;
}

function isBlueCompassPixel(rgba: [number, number, number, number]) {
  const [red, green, blue, alpha] = rgba;
  if (alpha < 160) return false;
  if (blue < 90) return false;
  if (blue - red < 35) return false;
  if (blue - green < 20) return false;
  return true;
}

function normalizeCompassImage(image: ImageData): ImageData {
  const data = new Uint8ClampedArray(image.data.length);

  for (let pixelOffset = 0; pixelOffset < image.data.length; pixelOffset += 4) {
    const alpha = image.data[pixelOffset + 3];
    data[pixelOffset] = Math.round((image.data[pixelOffset] * alpha) / 255);
    data[pixelOffset + 1] = Math.round((image.data[pixelOffset + 1] * alpha) / 255);
    data[pixelOffset + 2] = Math.round((image.data[pixelOffset + 2] * alpha) / 255);
    data[pixelOffset + 3] = 255;
  }

  return {
    width: image.width,
    height: image.height,
    channels: image.channels,
    data,
  };
}

function tintCompassImage(image: ImageData): ImageData {
  const data = new Uint8ClampedArray(image.data.length);
  const centerX = (image.width - 1) / 2;
  const centerY = (image.height - 1) / 2;

  for (let pixelOffset = 0; pixelOffset < image.data.length; pixelOffset += 4) {
    const pixelIndex = pixelOffset / 4;
    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    const brightness = (image.data[pixelOffset] + image.data[pixelOffset + 1] + image.data[pixelOffset + 2]) / 3;
    if (brightness < 48) {
      data[pixelOffset + 3] = 255;
      continue;
    }

    const intensity = brightness / 255;
    const dx = x - centerX;
    const dy = centerY - y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx <= absDy * 0.35) {
      if (dy >= 0) {
        data[pixelOffset] = Math.round(255 * intensity);
        data[pixelOffset + 1] = 0;
        data[pixelOffset + 2] = 0;
      } else {
        data[pixelOffset] = 0;
        data[pixelOffset + 1] = 0;
        data[pixelOffset + 2] = Math.round(255 * intensity);
      }
      data[pixelOffset + 3] = 255;
      continue;
    }

    if (absDy <= absDx * 0.35) {
      if (dx >= 0) {
        data[pixelOffset] = 0;
        data[pixelOffset + 1] = Math.round(255 * intensity);
        data[pixelOffset + 2] = 0;
      } else {
        data[pixelOffset] = Math.round(255 * intensity);
        data[pixelOffset + 1] = Math.round(255 * intensity);
        data[pixelOffset + 2] = 0;
      }
      data[pixelOffset + 3] = 255;
      continue;
    }

    data[pixelOffset + 3] = 255;
  }

  return {
    width: image.width,
    height: image.height,
    channels: image.channels,
    data,
  };
}

function findNeedleTip(
  frame: ImageData,
  center: Point,
  matchesPixel: (rgba: [number, number, number, number]) => boolean,
  needleName: string,
): NeedleDiagnostic {
  let bestDiagnostic: NeedleDiagnostic | null = null;

  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const dx = x - center.x;
      const dy = y - center.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < MIN_NEEDLE_RADIUS_SQUARED || distanceSquared > MAX_NEEDLE_RADIUS_SQUARED) continue;

      const rgba = getPixelRgba(frame, x, y);
      if (!matchesPixel(rgba)) continue;

      if (bestDiagnostic !== null && distanceSquared <= bestDiagnostic.distanceSquared) continue;
      bestDiagnostic = {
        point: { x, y },
        direction: classifyCompassDirection({ x: dx, y: dy }),
        distanceSquared,
        rgba,
      };
    }
  }

  if (bestDiagnostic === null) {
    throw new Error(`Could not locate ${needleName} needle tip near ${center.x},${center.y}.`);
  }
  return bestDiagnostic;
}

function markPoint(image: ImageData, point: Point, rgba: [number, number, number, number]) {
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const x = point.x + offsetX;
      const y = point.y + offsetY;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;

      const pixelOffset = (y * image.width + x) * 4;
      image.data[pixelOffset] = rgba[0];
      image.data[pixelOffset + 1] = rgba[1];
      image.data[pixelOffset + 2] = rgba[2];
      image.data[pixelOffset + 3] = rgba[3];
    }
  }
}

function createOverlayImage(frame: ImageData, center: Point, redNeedle: NeedleDiagnostic, blueNeedle: NeedleDiagnostic): ImageData {
  const overlay = {
    width: frame.width,
    height: frame.height,
    channels: frame.channels,
    data: new Uint8ClampedArray(frame.data),
  };
  markPoint(overlay, center, [255, 255, 255, 255]);
  markPoint(overlay, redNeedle.point, [255, 0, 255, 255]);
  markPoint(overlay, blueNeedle.point, [0, 255, 255, 255]);
  return overlay;
}

async function writeFrameReport(
  reportDirectory: string,
  diagnostic: FrameDiagnostic,
  frame: ImageData,
  overlay: ImageData,
) {
  const frameDirectory = path.join(reportDirectory, `${String(diagnostic.frameIndex).padStart(2, "0")}-${diagnostic.tileName}`);
  fs.mkdirSync(frameDirectory, { recursive: true });
  await Promise.all([
    saveImageDataToImage(frame, path.join(frameDirectory, "raster.png")),
    saveImageDataToImage(overlay, path.join(frameDirectory, "overlay.png")),
  ]);
  fs.writeFileSync(path.join(frameDirectory, "summary.json"), JSON.stringify(diagnostic, null, 2));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: bun run validate:tileset-compass [tileset-directory] [options]")
    .command(
      "$0 [tileset-directory]",
      "Render the vendored compass texture and verify that every terrain frame keeps the cardinal needles screen-locked.",
      (builder) =>
        builder.positional("tileset-directory", {
          type: "string",
          default: DEFAULT_TILESET_DIRECTORY,
          describe: "Directory containing tileset.json for atlas layout",
        }),
    )
    .option("report-dir", {
      type: "string",
      default: DEFAULT_REPORT_DIRECTORY,
      describe: "Directory for compass diagnostic images and summaries",
    })
    .option("compass", {
      type: "string",
      default: DEFAULT_COMPASS_PATH,
      describe: "Compass PNG to render through the terrain rasterizer",
    })
    .help()
    .alias("h", "help")
    .strict()
    .parse();

  const tilesetDirectory = path.resolve(String(argv["tileset-directory"]));
  const reportDirectory = path.resolve(String(argv["report-dir"]));
  const compassPath = path.resolve(String(argv.compass));
  const tilesetJsonPath = path.join(tilesetDirectory, "tileset.json");
  if (!fs.existsSync(tilesetJsonPath)) throw new Error(`Missing tileset.json in ${tilesetDirectory}.`);
  if (!fs.existsSync(compassPath)) throw new Error(`Missing compass PNG at ${compassPath}.`);

  fs.rmSync(reportDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  const tilesetJson = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8"));
  const tileset = parseTerrainTileset(tilesetJson);
  const sourceCompassImage = normalizeCompassImage(await imageToImageData(compassPath));
  const tintedCompassImage = tintCompassImage(sourceCompassImage);
  const rasterFrames = rasterizeTerrainFrames(tintedCompassImage);
  const rasterAtlas = createTerrainAtlasImageData(rasterFrames, tileset);

  await Promise.all([
    saveImageDataToImage(sourceCompassImage, path.join(reportDirectory, "source-compass.png")),
    saveImageDataToImage(tintedCompassImage, path.join(reportDirectory, "tinted-compass.png")),
    saveImageDataToImage(rasterAtlas, path.join(reportDirectory, "raster-atlas.png")),
  ]);

  const diagnostics: FrameDiagnostic[] = [];
  for (const tile of getCompassFrameIndices()) {
    const frame = rasterFrames[tile.frameIndex];
    if (frame === undefined) throw new Error(`Missing compass raster frame ${tile.frameIndex}.`);

    const center = findVisibleUvCenter(tile.frameIndex);
    const redNeedle = findNeedleTip(frame, center, isRedCompassPixel, "red");
    const blueNeedle = findNeedleTip(frame, center, isBlueCompassPixel, "blue");
    const passed = redNeedle.direction === "ne" && blueNeedle.direction === "sw";
    const diagnostic: FrameDiagnostic = {
      frameIndex: tile.frameIndex,
      tileName: tile.tileName,
      center,
      redNeedle,
      blueNeedle,
      passed,
    };
    diagnostics.push(diagnostic);

    const overlay = createOverlayImage(frame, center, redNeedle, blueNeedle);
    await writeFrameReport(reportDirectory, diagnostic, frame, overlay);
  }

  const summary = {
    compassPath,
    tilesetDirectory,
    reportDirectory,
    diagnostics,
  };
  fs.writeFileSync(path.join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));

  const failedDiagnostics = diagnostics.filter((diagnostic) => diagnostic.passed === false);
  for (const diagnostic of diagnostics) {
    console.log(
      `${diagnostic.tileName}: red=${diagnostic.redNeedle.direction} @ ${diagnostic.redNeedle.point.x},${diagnostic.redNeedle.point.y}; blue=${diagnostic.blueNeedle.direction} @ ${diagnostic.blueNeedle.point.x},${diagnostic.blueNeedle.point.y}`,
    );
  }
  if (failedDiagnostics.length > 0) {
    const failedTileNames = failedDiagnostics.map((diagnostic) => diagnostic.tileName).join(", ");
    throw new Error(`Compass rotation validation failed for ${failedTileNames}.`);
  }
}

if (import.meta.main) {
  await main();
}
