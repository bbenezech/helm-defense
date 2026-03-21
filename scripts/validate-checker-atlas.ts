#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parseTerrainTileset, type TerrainTileset } from "../three/assets.ts";
import {
  ACTIVE_BLENDER_RENDER_VARIANT,
  BLENDER_RENDER_CONTRACT,
  ORDERED_SLOPES,
} from "./lib/blender.ts";
import { imageToImageData, saveImageDataToImage } from "./lib/file.ts";
import {
  assertSceneAndTilesetContracts,
  getCanonicalTileset,
  type CoverageTileset,
} from "./lib/terrain-coverage-proof.ts";
import {
  DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
  DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
  rasterizeCheckerSeedFrames,
  rasterizeOwnershipFrames,
  type BinaryFrame,
} from "./lib/terrain-ownership.ts";

type RgbaImageData = {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  channels: 4;
};

export type CheckerAtlasComparisonCounts = {
  comparedPixels: number;
  ownedPixels: number;
  seedPixels: number;
  floodFilledPixels: number;
  backgroundPixels: number;
  matchingPixels: number;
  mismatchedPixels: number;
  seedMismatchPixels: number;
  floodFilledMismatchPixels: number;
  backgroundMismatchPixels: number;
};

type CheckerFrameComparison = {
  counts: CheckerAtlasComparisonCounts;
  diffImage: RgbaImageData;
};

type CheckerFrameSummary = {
  frameIndex: number;
  tileName: string;
  counts: CheckerAtlasComparisonCounts;
};

type CheckerAtlasValidationSummary = {
  tilesetDirectory: string;
  reportDirectory: string;
  textureRotation: string;
  cellsPerAxis: number;
  lightValue: number;
  darkValue: number;
  counts: CheckerAtlasComparisonCounts;
  frames: CheckerFrameSummary[];
};

const __dirname = import.meta.dirname;
const DEFAULT_TILESET_DIRECTORY = path.resolve(__dirname, "../public/Grass_23-512x512");
const DEFAULT_REPORT_DIRECTORY = path.resolve(__dirname, "../tmp/checker-atlas-report");
const BLENDER_SCRIPT_NAME = "render_tileset.py";
const REFERENCE_ATLAS_FILENAME = "tileset.checker.png";
const SOURCE_TEXTURE_FILENAME = "source-texture.png";

function createEmptyCounts(): CheckerAtlasComparisonCounts {
  return {
    comparedPixels: 0,
    ownedPixels: 0,
    seedPixels: 0,
    floodFilledPixels: 0,
    backgroundPixels: 0,
    matchingPixels: 0,
    mismatchedPixels: 0,
    seedMismatchPixels: 0,
    floodFilledMismatchPixels: 0,
    backgroundMismatchPixels: 0,
  };
}

function addCounts(total: CheckerAtlasComparisonCounts, next: CheckerAtlasComparisonCounts) {
  total.comparedPixels += next.comparedPixels;
  total.ownedPixels += next.ownedPixels;
  total.seedPixels += next.seedPixels;
  total.floodFilledPixels += next.floodFilledPixels;
  total.backgroundPixels += next.backgroundPixels;
  total.matchingPixels += next.matchingPixels;
  total.mismatchedPixels += next.mismatchedPixels;
  total.seedMismatchPixels += next.seedMismatchPixels;
  total.floodFilledMismatchPixels += next.floodFilledMismatchPixels;
  total.backgroundMismatchPixels += next.backgroundMismatchPixels;
}

function createImage(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): RgbaImageData {
  return {
    data,
    width,
    height,
    channels: 4,
  };
}

function toCoverageTileset(tileset: TerrainTileset): CoverageTileset {
  return {
    type: tileset.type,
    name: tileset.name,
    image: tileset.image,
    tilewidth: tileset.tilewidth,
    tileheight: tileset.tileheight,
    tilecount: tileset.tilecount,
    rows: tileset.rows,
    columns: tileset.columns,
    spacing: tileset.spacing,
    margin: tileset.margin,
    imagewidth: tileset.imagewidth,
    imageheight: tileset.imageheight,
    tiles: tileset.tiles.map((tile) => ({
      id: tile.id,
      probability: tile.probability,
      properties: tile.properties.map((property) => ({
        name: property.name,
        type: property.type,
        value: property.value,
      })),
    })),
    version: tileset.version,
    tiledversion: tileset.tiledversion,
    properties: tileset.properties.map((property) => ({
      name: property.name,
      type: property.type,
      value: property.value,
    })),
  };
}

function assertRgbaImage(image: { width: number; height: number; channels: number; data: Uint8ClampedArray<ArrayBuffer> }): RgbaImageData {
  if (image.channels !== 4) throw new Error(`Expected RGBA image data, received ${image.channels} channels.`);
  return createImage(image.data, image.width, image.height);
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

export function createCheckerSourceTextureImageData(
  width: number,
  height: number,
  cellsPerAxis: number,
  lightValue: number,
  darkValue: number,
): RgbaImageData {
  if (width <= 0 || height <= 0) {
    throw new Error(`Checker source texture dimensions must be positive, received ${width}x${height}.`);
  }
  if (cellsPerAxis <= 0) {
    throw new Error(`Checker source texture cellsPerAxis must be positive, received ${cellsPerAxis}.`);
  }
  if (width % cellsPerAxis !== 0 || height % cellsPerAxis !== 0) {
    throw new Error(
      `Checker source texture dimensions ${width}x${height} must be divisible by ${cellsPerAxis} cells.`,
    );
  }

  const cellWidth = width / cellsPerAxis;
  const cellHeight = height / cellsPerAxis;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const checkerY = Math.floor(y / cellHeight);
    for (let x = 0; x < width; x++) {
      const checkerX = Math.floor(x / cellWidth);
      const checkerValue = (checkerX + checkerY) % 2 === 0 ? lightValue : darkValue;
      const pixelOffset = (y * width + x) * 4;
      data[pixelOffset] = checkerValue;
      data[pixelOffset + 1] = checkerValue;
      data[pixelOffset + 2] = checkerValue;
      data[pixelOffset + 3] = 255;
    }
  }

  return createImage(data, width, height);
}

function createAtlasImageData(frames: RgbaImageData[], tileset: TerrainTileset): RgbaImageData {
  if (frames.length !== tileset.tilecount) {
    throw new Error(`Atlas frame count mismatch: expected ${tileset.tilecount}, received ${frames.length}.`);
  }

  const data = new Uint8ClampedArray(tileset.imagewidth * tileset.imageheight * 4);
  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.width !== tileset.tilewidth || frame.height !== tileset.tileheight) {
      throw new Error(
        `Atlas frame ${frameIndex} size mismatch: expected ${tileset.tilewidth}x${tileset.tileheight}, received ${frame.width}x${frame.height}.`,
      );
    }

    const offset = getAtlasFrameOffset(tileset, frameIndex);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const frameOffset = (y * frame.width + x) * 4;
        const atlasOffset = ((offset.top + y) * tileset.imagewidth + offset.left + x) * 4;
        data[atlasOffset] = frame.data[frameOffset];
        data[atlasOffset + 1] = frame.data[frameOffset + 1];
        data[atlasOffset + 2] = frame.data[frameOffset + 2];
        data[atlasOffset + 3] = frame.data[frameOffset + 3];
      }
    }
  }

  return createImage(data, tileset.imagewidth, tileset.imageheight);
}

function extractAtlasFrame(image: RgbaImageData, tileset: TerrainTileset, frameIndex: number): RgbaImageData {
  const offset = getAtlasFrameOffset(tileset, frameIndex);
  const data = new Uint8ClampedArray(tileset.tilewidth * tileset.tileheight * 4);

  for (let y = 0; y < tileset.tileheight; y++) {
    for (let x = 0; x < tileset.tilewidth; x++) {
      const sourceOffset = ((offset.top + y) * image.width + offset.left + x) * 4;
      const frameOffset = (y * tileset.tilewidth + x) * 4;
      data[frameOffset] = image.data[sourceOffset];
      data[frameOffset + 1] = image.data[sourceOffset + 1];
      data[frameOffset + 2] = image.data[sourceOffset + 2];
      data[frameOffset + 3] = image.data[sourceOffset + 3];
    }
  }

  return createImage(data, tileset.tilewidth, tileset.tileheight);
}

export function normalizeFrameToOwnershipCoverage(frame: RgbaImageData, ownershipFrame: BinaryFrame): RgbaImageData {
  if (frame.width !== ownershipFrame.width || frame.height !== ownershipFrame.height) {
    throw new Error(
      `Ownership clip size mismatch: image is ${frame.width}x${frame.height}, ownership is ${ownershipFrame.width}x${ownershipFrame.height}.`,
    );
  }

  const data = new Uint8ClampedArray(frame.data.length);
  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    const pixelOffset = pixelIndex * 4;
    if (ownershipFrame.coverage[pixelIndex] !== 1) {
      data[pixelOffset] = 0;
      data[pixelOffset + 1] = 0;
      data[pixelOffset + 2] = 0;
      data[pixelOffset + 3] = 0;
      continue;
    }

    data[pixelOffset] = frame.data[pixelOffset];
    data[pixelOffset + 1] = frame.data[pixelOffset + 1];
    data[pixelOffset + 2] = frame.data[pixelOffset + 2];
    data[pixelOffset + 3] = 255;
  }

  return createImage(data, frame.width, frame.height);
}

function getDiffColor(seedPixel: boolean, ownedPixel: boolean): [number, number, number, number] {
  if (seedPixel) return [255, 64, 64, 255];
  if (ownedPixel) return [64, 160, 255, 255];
  return [255, 224, 64, 255];
}

export function compareCheckerFrameImages(
  referenceFrame: RgbaImageData,
  blenderFrame: RgbaImageData,
  seedFrame: BinaryFrame,
  ownershipFrame: BinaryFrame,
): CheckerFrameComparison {
  if (referenceFrame.width !== blenderFrame.width || referenceFrame.height !== blenderFrame.height) {
    throw new Error(
      `Frame comparison size mismatch: reference is ${referenceFrame.width}x${referenceFrame.height}, blender is ${blenderFrame.width}x${blenderFrame.height}.`,
    );
  }
  if (
    referenceFrame.width !== seedFrame.width ||
    referenceFrame.height !== seedFrame.height ||
    referenceFrame.width !== ownershipFrame.width ||
    referenceFrame.height !== ownershipFrame.height
  ) {
    throw new Error("Frame comparison mask sizes must match image sizes.");
  }

  const counts = createEmptyCounts();
  const diffData = new Uint8ClampedArray(referenceFrame.data.length);
  for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
    const pixelOffset = pixelIndex * 4;
    const seedPixel = seedFrame.coverage[pixelIndex] === 1;
    const ownedPixel = ownershipFrame.coverage[pixelIndex] === 1;
    const pixelsMatch =
      referenceFrame.data[pixelOffset] === blenderFrame.data[pixelOffset] &&
      referenceFrame.data[pixelOffset + 1] === blenderFrame.data[pixelOffset + 1] &&
      referenceFrame.data[pixelOffset + 2] === blenderFrame.data[pixelOffset + 2] &&
      referenceFrame.data[pixelOffset + 3] === blenderFrame.data[pixelOffset + 3];

    counts.comparedPixels++;
    if (ownedPixel) {
      counts.ownedPixels++;
      if (seedPixel) counts.seedPixels++;
      else counts.floodFilledPixels++;
    } else {
      counts.backgroundPixels++;
    }

    diffData[pixelOffset] = referenceFrame.data[pixelOffset];
    diffData[pixelOffset + 1] = referenceFrame.data[pixelOffset + 1];
    diffData[pixelOffset + 2] = referenceFrame.data[pixelOffset + 2];
    diffData[pixelOffset + 3] = referenceFrame.data[pixelOffset + 3];

    if (pixelsMatch) {
      counts.matchingPixels++;
      continue;
    }

    counts.mismatchedPixels++;
    if (seedPixel) counts.seedMismatchPixels++;
    else if (ownedPixel) counts.floodFilledMismatchPixels++;
    else counts.backgroundMismatchPixels++;

    const diffColor = getDiffColor(seedPixel, ownedPixel);
    diffData[pixelOffset] = diffColor[0];
    diffData[pixelOffset + 1] = diffColor[1];
    diffData[pixelOffset + 2] = diffColor[2];
    diffData[pixelOffset + 3] = diffColor[3];
  }

  return {
    counts,
    diffImage: createImage(diffData, referenceFrame.width, referenceFrame.height),
  };
}

function getSortedPngFiles(directory: string): string[] {
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".png"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "-");
}

function getFrameDirectoryName(frameIndex: number, tileName: string): string {
  return `${String(frameIndex).padStart(2, "0")}-${sanitizePathSegment(tileName)}`;
}

function loadRenderedFrames(directory: string, expectedFrameCount: number): Promise<RgbaImageData[]> {
  const pngFiles = getSortedPngFiles(directory);
  if (pngFiles.length !== expectedFrameCount) {
    throw new Error(`Expected ${expectedFrameCount} rendered checker frames, received ${pngFiles.length} in ${directory}.`);
  }

  return Promise.all(
    pngFiles.map(async (pngFile) => assertRgbaImage(await imageToImageData(path.join(directory, pngFile)))),
  );
}

async function writeFrameDiagnostics(
  reportDirectory: string,
  frameIndex: number,
  tileName: string,
  referenceFrame: RgbaImageData,
  blenderFrame: RgbaImageData,
  diffFrame: RgbaImageData,
  counts: CheckerAtlasComparisonCounts,
) {
  const frameDirectory = path.join(reportDirectory, getFrameDirectoryName(frameIndex, tileName));
  fs.mkdirSync(frameDirectory, { recursive: true });
  await Promise.all([
    saveImageDataToImage(referenceFrame, path.join(frameDirectory, "reference.png")),
    saveImageDataToImage(blenderFrame, path.join(frameDirectory, "blender.png")),
    saveImageDataToImage(diffFrame, path.join(frameDirectory, "diff.png")),
  ]);
  fs.writeFileSync(path.join(frameDirectory, "summary.json"), JSON.stringify(counts, null, 2));
}

function renderCheckerFramesWithBlender(
  blenderBin: string,
  blenderScript: string,
  sourceTexturePath: string,
  outputDirectory: string,
) {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });

  const blenderArguments = [
    "-b",
    "--factory-startup",
    "--python",
    blenderScript,
    "--",
    "--texture",
    sourceTexturePath,
    "--output-dir",
    outputDirectory,
    "--render-kind",
    "textured",
    "--engine",
    "CYCLES",
    "--shading",
    "flat",
    "--texture-rotation",
    ACTIVE_BLENDER_RENDER_VARIANT.textureRotation,
    "--sampling-profile",
    "strictPixel",
    "--samples",
    String(BLENDER_RENDER_CONTRACT.cyclesSamples),
  ];
  const renderResult = spawnSync(blenderBin, blenderArguments, { stdio: "inherit" });
  if (renderResult.error !== undefined) throw renderResult.error;
  if (renderResult.status !== 0) {
    throw new Error(`Blender checker atlas render failed with status ${renderResult.status}.`);
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: bun run validate:checker-atlas [tileset-directory] [options]")
    .command("$0 [tileset-directory]", "Render a canonical checker through Blender and compare it to tileset.checker.png", (y) =>
      y.positional("tileset-directory", {
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

  const blenderBin = process.env["BLENDER_BIN"];
  if (typeof blenderBin !== "string" || blenderBin.length === 0) {
    throw new Error(`Blender binary not specified. Set BLENDER_BIN=/path/to/blender`);
  }
  if (!fs.existsSync(blenderBin)) {
    throw new Error(`Blender binary "${blenderBin}" not found, set BLENDER_BIN=/path/to/blender`);
  }

  const blenderScript = path.resolve(__dirname, `./${BLENDER_SCRIPT_NAME}`);
  if (!fs.existsSync(blenderScript)) throw new Error(`Blender script "${blenderScript}" not found.`);

  fs.rmSync(reportDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  const tilesetJson = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8"));
  const tileset = parseTerrainTileset(tilesetJson);
  const coverageTileset = toCoverageTileset(tileset);
  const canonicalTileset = getCanonicalTileset(coverageTileset);
  assertSceneAndTilesetContracts(coverageTileset, canonicalTileset);

  const sourceTexture = createCheckerSourceTextureImageData(
    tileset.tilewidth,
    tileset.tilewidth,
    DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  );
  const sourceTexturePath = path.join(reportDirectory, SOURCE_TEXTURE_FILENAME);
  await saveImageDataToImage(sourceTexture, sourceTexturePath);

  const blenderFramesDirectory = path.join(reportDirectory, "blender-frames");
  renderCheckerFramesWithBlender(blenderBin, blenderScript, sourceTexturePath, blenderFramesDirectory);

  const [referenceAtlas, renderedFrames, ownershipFrames, seedFrames] = await Promise.all([
    imageToImageData(referenceAtlasPath).then(assertRgbaImage),
    loadRenderedFrames(blenderFramesDirectory, tileset.tilecount),
    Promise.resolve(rasterizeOwnershipFrames()),
    Promise.resolve(rasterizeCheckerSeedFrames()),
  ]);

  const blenderFrames = renderedFrames.map((frame, frameIndex) => {
    const ownershipFrame = ownershipFrames[frameIndex];
    if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}.`);
    return normalizeFrameToOwnershipCoverage(frame, ownershipFrame);
  });
  const referenceFrames = Array.from({ length: tileset.tilecount }, (_, frameIndex) =>
    extractAtlasFrame(referenceAtlas, tileset, frameIndex),
  );
  const diffFrames: RgbaImageData[] = [];
  const frameSummaries: CheckerFrameSummary[] = [];
  const totalCounts = createEmptyCounts();

  for (let frameIndex = 0; frameIndex < tileset.tilecount; frameIndex++) {
    const referenceFrame = referenceFrames[frameIndex];
    const blenderFrame = blenderFrames[frameIndex];
    const seedFrame = seedFrames[frameIndex];
    const ownershipFrame = ownershipFrames[frameIndex];
    const tileName = ORDERED_SLOPES[frameIndex];

    if (referenceFrame === undefined || blenderFrame === undefined || seedFrame === undefined || ownershipFrame === undefined) {
      throw new Error(`Missing checker comparison inputs for frame ${frameIndex}.`);
    }
    if (tileName === undefined) throw new Error(`Missing terrain tile name for frame ${frameIndex}.`);

    const comparison = compareCheckerFrameImages(referenceFrame, blenderFrame, seedFrame, ownershipFrame);
    diffFrames.push(comparison.diffImage);
    frameSummaries.push({
      frameIndex,
      tileName,
      counts: comparison.counts,
    });
    addCounts(totalCounts, comparison.counts);
    await writeFrameDiagnostics(
      reportDirectory,
      frameIndex,
      tileName,
      referenceFrame,
      blenderFrame,
      comparison.diffImage,
      comparison.counts,
    );
  }

  const blenderAtlas = createAtlasImageData(blenderFrames, tileset);
  const diffAtlas = createAtlasImageData(diffFrames, tileset);
  await Promise.all([
    saveImageDataToImage(referenceAtlas, path.join(reportDirectory, "reference-atlas.png")),
    saveImageDataToImage(blenderAtlas, path.join(reportDirectory, "blender-atlas.png")),
    saveImageDataToImage(diffAtlas, path.join(reportDirectory, "diff-atlas.png")),
  ]);

  const summary: CheckerAtlasValidationSummary = {
    tilesetDirectory,
    reportDirectory,
    textureRotation: ACTIVE_BLENDER_RENDER_VARIANT.textureRotation,
    cellsPerAxis: DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    lightValue: DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    darkValue: DEFAULT_CHECKER_ATLAS_DARK_VALUE,
    counts: totalCounts,
    frames: frameSummaries,
  };
  fs.writeFileSync(path.join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(
    `checker-atlas: mismatched=${totalCounts.mismatchedPixels}, seed=${totalCounts.seedMismatchPixels}, flood=${totalCounts.floodFilledMismatchPixels}, background=${totalCounts.backgroundMismatchPixels}`,
  );
  console.log(`Checker atlas diagnostics written to ${reportDirectory}`);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedFilePath === currentFilePath) {
  await main();
}
