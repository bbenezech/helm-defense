#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ORDERED_SLOPES } from "./lib/terrain-scene-spec.ts";
import { countCoveredPixels, rasterizeOwnershipFrames, type BinaryFrame } from "./lib/terrain-ownership.ts";
import { imageToImageData, saveImageDataToImage } from "./lib/file.ts";
import {
  assertSceneAndTilesetContracts,
  buildCoverageFixtures,
  evaluateCoverageFixture,
  getCanonicalTileset,
  getCoverageLayersFromTileGidLayers,
  getElevationYOffsetPx,
  hasCoverageFailure,
  type CoverageFixture,
  type CoverageFixtureResult,
  type CoverageImage,
} from "./lib/terrain-coverage-proof.ts";
import type { Tileset } from "../src/game/lib/tileset.ts";

const __dirname = import.meta.dirname;
const DEFAULT_TILESET_DIRECTORY = path.resolve(__dirname, "../public/Grass_23-512x512");
const DEFAULT_REPORT_DIRECTORY = path.resolve(__dirname, "../tmp/terrain-coverage-report");
const ALPHA_THRESHOLD = 127;

type ValidationSummary = {
  tilesetDirectory: string;
  reportDirectory: string;
  fixtures: Array<{ name: string; width: number; height: number; counts: CoverageFixtureResult["counts"] }>;
};

function imageDataToBinaryFrame(
  image: Awaited<ReturnType<typeof imageToImageData>>,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const coverage = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceIndex = ((top + y) * image.width + (left + x)) * 4;
      const alpha = image.data[sourceIndex + 3];
      coverage[y * width + x] = alpha > ALPHA_THRESHOLD ? 1 : 0;
    }
  }
  return { width, height, coverage } satisfies BinaryFrame;
}

async function loadFramesFromTilesetSheet(tilesetDirectory: string, tileset: Tileset) {
  const imagePath = path.join(tilesetDirectory, tileset.image);
  const image = await imageToImageData(imagePath);
  const frames: BinaryFrame[] = [];

  for (let tileIndex = 0; tileIndex < tileset.tilecount; tileIndex++) {
    const column = tileIndex % tileset.columns;
    const row = Math.floor(tileIndex / tileset.columns);
    const left = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
    const top = tileset.margin + row * (tileset.tileheight + tileset.spacing);
    frames.push(imageDataToBinaryFrame(image, left, top, tileset.tilewidth, tileset.tileheight));
  }

  return frames;
}

function createFixtureReportImage(result: CoverageFixtureResult) {
  const image = new Uint8ClampedArray(result.width * result.height * 4);
  for (let index = 0; index < result.oracleCoverage.counts.length; index++) {
    const oracleCount = result.oracleCoverage.counts[index];
    const actualCount = result.actualCoverage.counts[index];
    const pixelIndex = index * 4;

    let rgba: [number, number, number, number] = [255, 0, 255, 255];
    if (oracleCount > 1) rgba = [160, 32, 240, 255];
    else if (actualCount > 1) rgba = [255, 255, 0, 255];
    else if (oracleCount > 0 && actualCount === 0) rgba = [0, 120, 255, 255];
    else if (oracleCount === 0 && actualCount > 0) rgba = [255, 64, 64, 255];
    else if (
      oracleCount === 1 &&
      actualCount === 1 &&
      result.oracleCoverage.ownerIds[index] !== result.actualCoverage.ownerIds[index]
    )
      rgba = [255, 140, 0, 255];
    else if (oracleCount === 1 && actualCount === 1) rgba = [32, 200, 32, 255];

    image[pixelIndex] = rgba[0];
    image[pixelIndex + 1] = rgba[1];
    image[pixelIndex + 2] = rgba[2];
    image[pixelIndex + 3] = rgba[3];
  }
  return { data: image, width: result.width, height: result.height, channels: 4 as const };
}

function createCoverageImage(coverage: CoverageImage, color: [number, number, number]) {
  const image = new Uint8ClampedArray(coverage.width * coverage.height * 4);
  for (let index = 0; index < coverage.counts.length; index++) {
    const pixelIndex = index * 4;
    if (coverage.counts[index] > 0) {
      image[pixelIndex] = color[0];
      image[pixelIndex + 1] = color[1];
      image[pixelIndex + 2] = color[2];
      image[pixelIndex + 3] = 255;
    } else {
      image[pixelIndex + 3] = 0;
    }
  }
  return { data: image, width: coverage.width, height: coverage.height, channels: 4 as const };
}

async function writeFixtureDiagnostics(reportDirectory: string, result: CoverageFixtureResult) {
  const fixtureDirectory = path.join(reportDirectory, result.fixture.name);
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  await Promise.all([
    saveImageDataToImage(
      createCoverageImage(result.oracleCoverage, [255, 255, 255]),
      path.join(fixtureDirectory, "oracle.png"),
    ),
    saveImageDataToImage(
      createCoverageImage(result.actualCoverage, [0, 255, 255]),
      path.join(fixtureDirectory, "actual.png"),
    ),
    saveImageDataToImage(createFixtureReportImage(result), path.join(fixtureDirectory, "diff.png")),
  ]);
  fs.writeFileSync(path.join(fixtureDirectory, "summary.json"), JSON.stringify(result.counts, null, 2));
}

function cloneFrames(frames: BinaryFrame[]) {
  return frames.map((frame) => ({
    width: frame.width,
    height: frame.height,
    coverage: new Uint8Array(frame.coverage),
  }));
}

function shiftFrame(frame: BinaryFrame, dx: number, dy: number) {
  const shifted = new Uint8Array(frame.width * frame.height);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.coverage[y * frame.width + x] === 0) continue;
      const shiftedX = x + dx;
      const shiftedY = y + dy;
      if (shiftedX < 0 || shiftedX >= frame.width || shiftedY < 0 || shiftedY >= frame.height) continue;
      shifted[shiftedY * frame.width + shiftedX] = 1;
    }
  }
  return { ...frame, coverage: shifted } satisfies BinaryFrame;
}

function dilateFrame(frame: BinaryFrame) {
  const dilated = new Uint8Array(frame.width * frame.height);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.coverage[y * frame.width + x] === 0) continue;
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleX >= frame.width || sampleY < 0 || sampleY >= frame.height) continue;
          dilated[sampleY * frame.width + sampleX] = 1;
        }
      }
    }
  }
  return { ...frame, coverage: dilated } satisfies BinaryFrame;
}

function erodeFrame(frame: BinaryFrame) {
  const eroded = new Uint8Array(frame.width * frame.height);
  for (let y = 1; y < frame.height - 1; y++) {
    for (let x = 1; x < frame.width - 1; x++) {
      let keep = 1;
      for (let offsetY = -1; offsetY <= 1 && keep === 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          if (frame.coverage[(y + offsetY) * frame.width + (x + offsetX)] === 0) {
            keep = 0;
            break;
          }
        }
      }
      eroded[y * frame.width + x] = keep;
    }
  }
  return { ...frame, coverage: eroded } satisfies BinaryFrame;
}

function assertNegativeCheck(
  label: string,
  result: CoverageFixtureResult,
  predicate: (counts: CoverageFixtureResult["counts"]) => boolean,
) {
  if (!predicate(result.counts)) throw new Error(`Negative self-check "${label}" did not fail as expected.`);
}

function runNegativeSelfChecks(tileset: Tileset, oracleFrames: BinaryFrame[], actualFrames: BinaryFrame[]) {
  const elevationYOffsetPx = getElevationYOffsetPx(tileset);
  const singleTileFixture: CoverageFixture = {
    name: "self-check-single",
    layers: getCoverageLayersFromTileGidLayers([[[1]]], elevationYOffsetPx),
  };
  const adjacentFixture: CoverageFixture = {
    name: "self-check-adjacent",
    layers: getCoverageLayersFromTileGidLayers(
      [
        [
          [1, 1],
          [1, 1],
        ],
      ],
      elevationYOffsetPx,
    ),
  };

  const shiftedFrames = cloneFrames(actualFrames);
  shiftedFrames[0] = shiftFrame(shiftedFrames[0], 1, 0);
  assertNegativeCheck(
    "shifted tile",
    evaluateCoverageFixture(singleTileFixture, tileset, oracleFrames, shiftedFrames),
    (counts) => counts.uncovered > 0 || counts.stray > 0 || counts.wrongOwner > 0,
  );

  const dilatedFrames = cloneFrames(actualFrames);
  dilatedFrames[0] = dilateFrame(dilatedFrames[0]);
  assertNegativeCheck(
    "dilated tile",
    evaluateCoverageFixture(adjacentFixture, tileset, oracleFrames, dilatedFrames),
    (counts) => counts.actualOverlap > 0 || counts.stray > 0,
  );

  const erodedFrames = cloneFrames(actualFrames);
  erodedFrames[0] = erodeFrame(erodedFrames[0]);
  assertNegativeCheck(
    "eroded tile",
    evaluateCoverageFixture(singleTileFixture, tileset, oracleFrames, erodedFrames),
    (counts) => counts.uncovered > 0,
  );
}

function runOracleSelfChecks(tileset: Tileset, oracleFrames: BinaryFrame[]) {
  const elevationYOffsetPx = getElevationYOffsetPx(tileset);
  const fixtures: CoverageFixture[] = [
    {
      name: "oracle-single-flat",
      layers: getCoverageLayersFromTileGidLayers([[[1]]], elevationYOffsetPx),
    },
    {
      name: "oracle-flat-neighbors",
      layers: getCoverageLayersFromTileGidLayers(
        [
          [
            [1, 1],
            [1, 1],
          ],
        ],
        elevationYOffsetPx,
      ),
    },
  ];

  for (const fixture of fixtures) {
    const result = evaluateCoverageFixture(fixture, tileset, oracleFrames, oracleFrames);
    if (hasCoverageFailure(result))
      throw new Error(`Ownership oracle self-check "${fixture.name}" failed: ${JSON.stringify(result.counts)}`);
  }
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: bun run validate:terrain-coverage [tileset-directory] [options]")
    .command("$0 [tileset-directory]", "Validate exact native terrain coverage against the ownership rasterizer", (y) =>
      y.positional("tileset-directory", {
        type: "string",
        default: DEFAULT_TILESET_DIRECTORY,
        describe: "Directory containing tileset.png and tileset.json",
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

  const tilesetDirectory = path.resolve(String(argv["tileset-directory"] ?? DEFAULT_TILESET_DIRECTORY));
  const reportDirectory = path.resolve(String(argv["report-dir"] ?? DEFAULT_REPORT_DIRECTORY));

  const tilesetJsonPath = path.join(tilesetDirectory, "tileset.json");
  if (!fs.existsSync(tilesetJsonPath)) throw new Error(`Missing tileset.json in ${tilesetDirectory}`);
  if (!fs.existsSync(path.join(tilesetDirectory, "tileset.png")))
    throw new Error(`Missing tileset.png in ${tilesetDirectory}`);

  fs.rmSync(reportDirectory, { recursive: true, force: true });
  fs.mkdirSync(reportDirectory, { recursive: true });

  const actualTileset = JSON.parse(fs.readFileSync(tilesetJsonPath, "utf8")) as Tileset;
  const canonicalTileset = getCanonicalTileset(actualTileset);
  assertSceneAndTilesetContracts(actualTileset, canonicalTileset);

  const [oracleFrames, actualFrames] = await Promise.all([
    Promise.resolve(rasterizeOwnershipFrames()),
    loadFramesFromTilesetSheet(tilesetDirectory, actualTileset),
  ]);

  for (const [frameIndex, frame] of oracleFrames.entries()) {
    const coverageCount = countCoveredPixels(frame);
    if (coverageCount === 0) throw new Error(`Oracle frame ${frameIndex} (${ORDERED_SLOPES[frameIndex]}) is empty.`);
  }

  runOracleSelfChecks(canonicalTileset, oracleFrames);
  runNegativeSelfChecks(canonicalTileset, oracleFrames, actualFrames);

  const fixtures = buildCoverageFixtures(canonicalTileset);
  const results: CoverageFixtureResult[] = [];
  for (const fixture of fixtures) {
    const result = evaluateCoverageFixture(fixture, actualTileset, oracleFrames, actualFrames);
    results.push(result);
    await writeFixtureDiagnostics(reportDirectory, result);
  }

  const summary: ValidationSummary = {
    tilesetDirectory,
    reportDirectory,
    fixtures: results.map((result) => ({
      name: result.fixture.name,
      width: result.width,
      height: result.height,
      counts: result.counts,
    })),
  };
  fs.writeFileSync(path.join(reportDirectory, "summary.json"), JSON.stringify(summary, null, 2));

  const failureCount = results.filter((element) => hasCoverageFailure(element)).length;
  for (const result of results) {
    console.log(
      `${result.fixture.name}: oracleOverlap=${result.counts.oracleOverlap}, uncovered=${result.counts.uncovered}, actualOverlap=${result.counts.actualOverlap}, stray=${result.counts.stray}, wrongOwner=${result.counts.wrongOwner}`,
    );
  }

  if (failureCount > 0) {
    throw new Error(
      `Terrain coverage validation failed for ${failureCount}/${results.length} fixtures. See ${reportDirectory}`,
    );
  }

  console.log(`Terrain coverage validation passed for ${results.length} fixtures. Diagnostics: ${reportDirectory}`);
}

await main();
