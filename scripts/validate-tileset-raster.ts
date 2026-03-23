#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { ImageData } from "../src/game/lib/heightmap.ts";
import { imageToImageData, saveImageDataToImage } from "./lib/file.ts";
import {
  DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
  DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
} from "./lib/terrain-ownership.ts";
import { ACTIVE_TERRAIN_TEXTURE_ROTATION, ORDERED_SLOPES } from "./lib/terrain-scene-spec.ts";
import { createTerrainAtlasImageData, rasterizeTerrainFrames } from "./lib/terrain-raster.ts";
import { parseTerrainTileset, type TerrainTileset } from "../three/assets.ts";

type RgbaImageData = ImageData;

type RasterFrameCounts = {
  comparedPixels: number;
  matchingPixels: number;
  mismatchedPixels: number;
  ownedPixels: number;
  backgroundPixels: number;
};

type RasterFrameSummary = {
  frameIndex: number;
  tileName: string;
  counts: RasterFrameCounts;
};

type RasterValidationSummary = {
  tilesetDirectory: string;
  reportDirectory: string;
  counts: RasterFrameCounts;
  frames: RasterFrameSummary[];
};

const __dirname = import.meta.dirname;
const DEFAULT_TILESET_DIRECTORY = path.resolve(__dirname, "../public/Grass_23-512x512");
const DEFAULT_REPORT_DIRECTORY = path.resolve(__dirname, "../tmp/tileset-raster-report");
const REFERENCE_ATLAS_FILENAME = "tileset.checker.png";

function createEmptyCounts(): RasterFrameCounts {
  return {
    comparedPixels: 0,
    matchingPixels: 0,
    mismatchedPixels: 0,
    ownedPixels: 0,
    backgroundPixels: 0,
  };
}

function addCounts(total: RasterFrameCounts, next: RasterFrameCounts) {
  total.comparedPixels += next.comparedPixels;
  total.matchingPixels += next.matchingPixels;
  total.mismatchedPixels += next.mismatchedPixels;
  total.ownedPixels += next.ownedPixels;
  total.backgroundPixels += next.backgroundPixels;
}

export function createCheckerSourceTextureImageData(
  width: number,
  height: number,
  cellsPerAxis: number,
  lightValue: number,
  darkValue: number,
): ImageData {
  if (width <= 0 || height <= 0) throw new Error(`Checker source texture must be positive, received ${width}x${height}.`);
  if (cellsPerAxis <= 0) throw new Error(`Checker cells per axis must be greater than zero, received ${cellsPerAxis}.`);

  const channels: 4 = 4;
  const data = new Uint8ClampedArray(width * height * channels);
  const cellWidth = width / cellsPerAxis;
  const cellHeight = height / cellsPerAxis;
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)) {
    throw new Error(`Checker source texture ${width}x${height} is not divisible by ${cellsPerAxis} cells per axis.`);
  }

  for (let y = 0; y < height; y++) {
    const checkerY = Math.floor(y / cellHeight);
    for (let x = 0; x < width; x++) {
      const checkerX = Math.floor(x / cellWidth);
      const checkerValue = (checkerX + checkerY) % 2 === 0 ? lightValue : darkValue;
      const pixelOffset = (y * width + x) * channels;
      data[pixelOffset] = checkerValue;
      data[pixelOffset + 1] = checkerValue;
      data[pixelOffset + 2] = checkerValue;
      data[pixelOffset + 3] = 255;
    }
  }

  return { data, width, height, channels };
}

function getAtlasFrameOffset(tileset: TerrainTileset, frameIndex: number) {
  if (frameIndex < 0 || frameIndex >= tileset.tilecount) {
    throw new Error(`Frame index ${frameIndex} is out of bounds for tileset "${tileset.name}".`);
  }

  const column = frameIndex % tileset.columns;
  const row = Math.floor(frameIndex / tileset.columns);
  return {
    left: tileset.margin + column * (tileset.tilewidth + tileset.spacing),
    top: tileset.margin + row * (tileset.tileheight + tileset.spacing),
  };
}

function extractAtlasFrame(image: RgbaImageData, tileset: TerrainTileset, frameIndex: number): RgbaImageData {
  const offset = getAtlasFrameOffset(tileset, frameIndex);
  const channels: 4 = 4;
  const data = new Uint8ClampedArray(tileset.tilewidth * tileset.tileheight * channels);

  for (let y = 0; y < tileset.tileheight; y++) {
    for (let x = 0; x < tileset.tilewidth; x++) {
      const sourceOffset = ((offset.top + y) * image.width + offset.left + x) * channels;
      const frameOffset = (y * tileset.tilewidth + x) * channels;
      data[frameOffset] = image.data[sourceOffset];
      data[frameOffset + 1] = image.data[sourceOffset + 1];
      data[frameOffset + 2] = image.data[sourceOffset + 2];
      data[frameOffset + 3] = image.data[sourceOffset + 3];
    }
  }

  return { data, width: tileset.tilewidth, height: tileset.tileheight, channels };
}

export function compareRasterFrameImages(referenceFrame: RgbaImageData, rasterFrame: RgbaImageData) {
  if (referenceFrame.width !== rasterFrame.width || referenceFrame.height !== rasterFrame.height) {
    throw new Error(
      `Raster frame comparison size mismatch: reference is ${referenceFrame.width}x${referenceFrame.height}, raster is ${rasterFrame.width}x${rasterFrame.height}.`,
    );
  }

  const counts = createEmptyCounts();
  const channels: 4 = 4;
  const diffData = new Uint8ClampedArray(referenceFrame.data.length);
  for (let pixelIndex = 0; pixelIndex < referenceFrame.width * referenceFrame.height; pixelIndex++) {
    const pixelOffset = pixelIndex * channels;
    const referenceAlpha = referenceFrame.data[pixelOffset + 3];
    const pixelsMatch =
      referenceFrame.data[pixelOffset] === rasterFrame.data[pixelOffset] &&
      referenceFrame.data[pixelOffset + 1] === rasterFrame.data[pixelOffset + 1] &&
      referenceFrame.data[pixelOffset + 2] === rasterFrame.data[pixelOffset + 2] &&
      referenceFrame.data[pixelOffset + 3] === rasterFrame.data[pixelOffset + 3];

    counts.comparedPixels++;
    if (referenceAlpha === 0) counts.backgroundPixels++;
    else counts.ownedPixels++;

    if (pixelsMatch) {
      counts.matchingPixels++;
      diffData[pixelOffset] = referenceFrame.data[pixelOffset];
      diffData[pixelOffset + 1] = referenceFrame.data[pixelOffset + 1];
      diffData[pixelOffset + 2] = referenceFrame.data[pixelOffset + 2];
      diffData[pixelOffset + 3] = referenceFrame.data[pixelOffset + 3];
      continue;
    }

    counts.mismatchedPixels++;
    diffData[pixelOffset] = 255;
    diffData[pixelOffset + 1] = 64;
    diffData[pixelOffset + 2] = 64;
    diffData[pixelOffset + 3] = 255;
  }

  return {
    counts,
    diffImage: {
      data: diffData,
      width: referenceFrame.width,
      height: referenceFrame.height,
      channels,
    },
  };
}

async function writeFrameDiagnostics(
  reportDirectory: string,
  frameIndex: number,
  tileName: string,
  referenceFrame: RgbaImageData,
  rasterFrame: RgbaImageData,
  diffFrame: RgbaImageData,
  counts: RasterFrameCounts,
) {
  const frameDirectory = path.join(reportDirectory, `${String(frameIndex).padStart(2, "0")}-${tileName}`);
  fs.mkdirSync(frameDirectory, { recursive: true });
  await Promise.all([
    saveImageDataToImage(referenceFrame, path.join(frameDirectory, "reference.png")),
    saveImageDataToImage(rasterFrame, path.join(frameDirectory, "raster.png")),
    saveImageDataToImage(diffFrame, path.join(frameDirectory, "diff.png")),
  ]);
  fs.writeFileSync(path.join(frameDirectory, "summary.json"), JSON.stringify({ counts }, null, 2));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: bun run validate:tileset-raster [tileset-directory] [options]")
    .command(
      "$0 [tileset-directory]",
      "Render a canonical checker through the CPU beauty rasterizer and compare it to tileset.checker.png",
      (builder) =>
        builder.positional("tileset-directory", {
          type: "string",
          default: DEFAULT_TILESET_DIRECTORY,
          describe: "Directory containing tileset.json and tileset.checker.png",
        }),
    )
    .option("report-dir", {
      type: "string",
      default: DEFAULT_REPORT_DIRECTORY,
      describe: "Directory for diagnostic images and summaries",
    })
    .help()
    .alias("h", "help")
    .strict()
    .parse();

  const tilesetDirectory = path.resolve(String(argv["tileset-directory"]));
  const reportDirectory = path.resolve(String(argv["report-dir"]));
  const tilesetJsonPath = path.join(tilesetDirectory, "tileset.json");
  const referenceAtlasPath = path.join(tilesetDirectory, REFERENCE_ATLAS_FILENAME);
  if (!fs.existsSync(tilesetJsonPath)) throw new Error(`Missing tileset.json in ${tilesetDirectory}.`);
  if (!fs.existsSync(referenceAtlasPath)) throw new Error(`Missing ${REFERENCE_ATLAS_FILENAME} in ${tilesetDirectory}.`);

  fs.rmSync(reportDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  const tilesetJson = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8"));
  const tileset = parseTerrainTileset(tilesetJson);
  const referenceAtlas = await imageToImageData(referenceAtlasPath);
  const checkerSourceTexture = createCheckerSourceTextureImageData(
    tileset.tilewidth,
    tileset.tilewidth,
    DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  );
  const rasterFrames = rasterizeTerrainFrames(checkerSourceTexture, undefined, ACTIVE_TERRAIN_TEXTURE_ROTATION);
  const rasterAtlas = createTerrainAtlasImageData(rasterFrames, tileset);

  const frameSummaries: RasterFrameSummary[] = [];
  const totalCounts = createEmptyCounts();
  const diffFrames: RgbaImageData[] = [];

  for (let frameIndex = 0; frameIndex < tileset.tilecount; frameIndex++) {
    const tileName = ORDERED_SLOPES[frameIndex];
    if (tileName === undefined) throw new Error(`Missing terrain tile name for frame ${frameIndex}.`);
    const referenceFrame = extractAtlasFrame(referenceAtlas, tileset, frameIndex);
    const rasterFrame = rasterFrames[frameIndex];
    if (rasterFrame === undefined) throw new Error(`Missing raster frame ${frameIndex}.`);
    const comparison = compareRasterFrameImages(referenceFrame, rasterFrame);
    frameSummaries.push({
      frameIndex,
      tileName,
      counts: comparison.counts,
    });
    addCounts(totalCounts, comparison.counts);
    diffFrames.push(comparison.diffImage);
    await writeFrameDiagnostics(
      reportDirectory,
      frameIndex,
      tileName,
      referenceFrame,
      rasterFrame,
      comparison.diffImage,
      comparison.counts,
    );
  }

  const diffAtlas = createTerrainAtlasImageData(diffFrames, tileset);
  await Promise.all([
    saveImageDataToImage(referenceAtlas, path.join(reportDirectory, "reference-atlas.png")),
    saveImageDataToImage(rasterAtlas, path.join(reportDirectory, "raster-atlas.png")),
    saveImageDataToImage(diffAtlas, path.join(reportDirectory, "diff-atlas.png")),
  ]);

  const summary: RasterValidationSummary = {
    tilesetDirectory,
    reportDirectory,
    counts: totalCounts,
    frames: frameSummaries,
  };
  fs.writeFileSync(path.join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(
    `tileset-raster: mismatched=${totalCounts.mismatchedPixels}, matching=${totalCounts.matchingPixels}, owned=${totalCounts.ownedPixels}, background=${totalCounts.backgroundPixels}`,
  );
  if (totalCounts.mismatchedPixels > 0) {
    throw new Error(`CPU tileset raster validation found ${totalCounts.mismatchedPixels} mismatched pixels.`);
  }
}

await main();
