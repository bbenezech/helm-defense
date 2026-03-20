#!/usr/bin/env node

import "dotenv/config";
import yargs from "yargs";
import path from "node:path";
import fs from "node:fs";
import { hideBin } from "yargs/helpers";
import {
  ACTIVE_BLENDER_RENDER_VARIANT,
  ACTIVE_BLENDER_RENDER_VARIANT_NAME,
  BLENDER_SAMPLING_PROFILES,
  BLENDER_RENDER_CONTRACT,
  DEFAULT_BLENDER_SAMPLING_PROFILE,
  ORDERED_SLOPES,
  type BlenderSamplingProfile,
} from "./lib/blender.ts";
import { EXAMPLE_TILE_GID_LAYERS } from "./lib/terrain-fixtures.ts";
import { execSync, spawnSync } from "node:child_process";
import { imageSize } from "image-size";
import { getTilemap, terrainToLayers } from "../src/game/lib/tilemap.ts";
import { tileableHeightmapToTileData, tileDataToTerrain } from "../src/game/lib/terrain.ts";
import {
  addTileNormalmapToGlobalNormalmap,
  generateTilableHeightmap,
  heightmapToNormalmap,
  extractHeightmapFromTextureImageData,
} from "../src/game/lib/heightmap.ts";
import { fastBoxBlur, fastBoxBlurVectors } from "../src/game/lib/blur.ts";
import { log } from "../src/game/lib/log.ts";
import { getTileset } from "../src/game/lib/tileset.ts";
import { saveImageDataToImage, savePrettyHeightmap, saveNormalmap, imageToImageData } from "./lib/file.ts";
import { rasterizeCheckerFrames, rasterizeOwnershipFrames } from "./lib/terrain-ownership.ts";

const __dirname = import.meta.dirname;
const BLENDER_SCRIPT_NAME = "render_tileset.py";
const BIOME_MANIFEST_FILENAME = "biomes.json";
const CHECKER_ATLAS_FILENAME = "tileset.checker.png";
const CHECKER_ATLAS_CELLS_PER_AXIS = 4;
const CHECKER_ATLAS_LIGHT = 224;
const CHECKER_ATLAS_DARK = 80;
const CHECKER_ATLAS_SIDE = 152;
const CHECKER_ATLAS_TOP_ALPHA = 255;
const CHECKER_ATLAS_SIDE_ALPHA = 128;

function createTileset(
  inputDirectory: string,
  outputDirectory: string,
  name: string,
  imageFilename: string,
  writeTilesetDefinition: boolean,
) {
  const tileMargin = 0; // margin around each tile
  const tilesetMargin = 0; // margin around the whole tileset image

  const tilecount = fs.readdirSync(inputDirectory).filter((file) => file.endsWith(".png")).length;
  if (tilecount < 1) throw new Error(`No .png files found in input directory: ${inputDirectory}`);
  if (tilecount !== ORDERED_SLOPES.length)
    throw new Error(`tilecount must be ${ORDERED_SLOPES.length}, got ${tilecount}`);
  const firstTileName = fs.readdirSync(inputDirectory).find((file) => file.endsWith(".png"));
  if (firstTileName === undefined) throw new Error(`No .png files found in input directory: ${inputDirectory}`);
  const firstTilePath = path.join(inputDirectory, firstTileName);
  const tileImage = imageSize(fs.readFileSync(firstTilePath));
  if (tileImage.width % 8 !== 0) throw new Error(`tileimagewidth must be a multiple of 8, got ${tileImage.width}`);

  const tileset = getTileset({
    name,
    imageFilename,
    tilewidth: tileImage.width,
    tileheight: tileImage.height,
    elevationYOffsetPx: (tileImage.height - tileImage.width / 2) / 2,
    terrainTileNames: ORDERED_SLOPES,
    tileMargin,
    tilesetMargin,
  });
  if (writeTilesetDefinition) {
    fs.writeFileSync(path.join(outputDirectory, "tileset.json"), JSON.stringify(tileset, null, 2));
  }

  const startsAt = Date.now();
  const imagePath = path.join(outputDirectory, imageFilename);
  execSync(`magick montage ${inputDirectory}/*.png \
        -quiet \
        +label \
        -filter point \
        -tile ${tileset.columns}x${tileset.rows} \
        -geometry ${tileImage.width}x${tileImage.height}+${tileMargin}+${tileMargin} \
        -background transparent \
        png:- | magick png:- -bordercolor transparent -border ${tilesetMargin} ${imagePath}`);

  log(
    `createMontage`,
    startsAt,
    `Tileset image created at ${imagePath} (${tileset.imagewidth}x${tileset.imageheight})`,
  );

  return tileset;
}

function hardenStrictPixelFrameEdges(inputDirectory: string) {
  const pngFiles = getSortedPngFiles(inputDirectory);

  const startsAt = Date.now();
  for (const pngFile of pngFiles) {
    const imagePath = path.join(inputDirectory, pngFile);
    const result = spawnSync(
      "magick",
      ["mogrify", "-alpha", "on", "-channel", "A", "-threshold", "50%", "+channel", imagePath],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ImageMagick alpha hardening failed for "${imagePath}"`);
  }

  log("strictPixel", startsAt, `Applied binary alpha edges to ${pngFiles.length} rendered frames`);
}

function getSortedPngFiles(inputDirectory: string) {
  return fs
    .readdirSync(inputDirectory)
    .filter((file) => file.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function clipFramesToOwnershipMasks(inputDirectory: string) {
  const pngFiles = getSortedPngFiles(inputDirectory);
  if (pngFiles.length !== ORDERED_SLOPES.length)
    throw new Error(`Expected ${ORDERED_SLOPES.length} rendered frames, got ${pngFiles.length}`);

  const ownershipFrames = rasterizeOwnershipFrames();
  const startsAt = Date.now();
  for (const [frameIndex, pngFile] of pngFiles.entries()) {
    const imagePath = path.join(inputDirectory, pngFile);
    const frameImage = await imageToImageData(imagePath);
    const ownershipFrame = ownershipFrames[frameIndex];
    if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}`);
    if (frameImage.width !== ownershipFrame.width || frameImage.height !== ownershipFrame.height)
      throw new Error(
        `Ownership frame mismatch for "${pngFile}": expected ${ownershipFrame.width}x${ownershipFrame.height}, got ${frameImage.width}x${frameImage.height}`,
      );

    for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
      const sourceAlpha = frameImage.data[pixelIndex * 4 + 3];
      if (ownershipFrame.coverage[pixelIndex] === 1 && sourceAlpha === 0)
        throw new Error(
          `nativeExact would reveal fully transparent RGB in "${pngFile}" at pixel ${pixelIndex} (${ORDERED_SLOPES[frameIndex]}).`,
        );
      frameImage.data[pixelIndex * 4 + 3] = ownershipFrame.coverage[pixelIndex] === 1 ? 255 : 0;
    }

    await saveImageDataToImage(frameImage, imagePath);
  }

  log("nativeExact", startsAt, `Applied ownership masks to ${pngFiles.length} rendered frames`);
}

function getBiomeId(name: string): string {
  const biomeIdCandidate = name.split(/[^A-Za-z]+/u)[0];
  if (biomeIdCandidate === undefined) {
    throw new Error(`Could not derive a biome id from "${name}".`);
  }
  const biomeId = biomeIdCandidate.toLowerCase();
  if (biomeId.length === 0) {
    throw new Error(`Could not derive a biome id from "${name}".`);
  }
  return biomeId;
}

function writeBiomeManifest(outputDirectory: string, tilesetName: string) {
  fs.writeFileSync(
    path.join(outputDirectory, BIOME_MANIFEST_FILENAME),
    JSON.stringify(
      {
        biomes: [
          {
            id: getBiomeId(tilesetName),
            atlas: "tileset.png",
            checkerAtlas: CHECKER_ATLAS_FILENAME,
          },
        ],
      },
      null,
      2,
    ),
  );
}

function renderTilesetFrames(
  texture: string,
  blenderBin: string,
  blenderScript: string,
  samplingProfile: BlenderSamplingProfile,
  inputDirectory: string,
) {
  const temporaryLocalBlenderTexture = path.join(__dirname, "texture.png");
  fs.copyFileSync(texture, temporaryLocalBlenderTexture);

  const startsAt = Date.now();
  fs.rmSync(inputDirectory, { recursive: true, force: true });
  try {
    const blenderArguments = [
      "-b",
      "--factory-startup",
      "--python",
      blenderScript,
      "--",
      "--texture",
      temporaryLocalBlenderTexture,
      "--output-dir",
      inputDirectory,
      "--engine",
      ACTIVE_BLENDER_RENDER_VARIANT.engine,
      "--shading",
      ACTIVE_BLENDER_RENDER_VARIANT.shading,
      "--texture-rotation",
      ACTIVE_BLENDER_RENDER_VARIANT.textureRotation,
      "--sampling-profile",
      samplingProfile,
      "--samples",
      String(BLENDER_RENDER_CONTRACT.cyclesSamples),
    ];
    const renderResult = spawnSync(blenderBin, blenderArguments, { stdio: "inherit" });
    if (renderResult.error) throw renderResult.error;
    if (renderResult.status !== 0)
      throw new Error(`Blender render failed for variant "${ACTIVE_BLENDER_RENDER_VARIANT_NAME}"`);
    log("blender", startsAt, `${blenderBin} ${blenderArguments.join(" ")}`);
  } finally {
    if (fs.existsSync(temporaryLocalBlenderTexture)) fs.unlinkSync(temporaryLocalBlenderTexture);
  }
}

async function renderTilesetAtlas(
  texture: string,
  blenderBin: string,
  blenderScript: string,
  samplingProfile: BlenderSamplingProfile,
  inputDirectory: string,
  outputDirectory: string,
  name: string,
  imageFilename: string,
  writeTilesetDefinition: boolean,
) {
  renderTilesetFrames(texture, blenderBin, blenderScript, samplingProfile, inputDirectory);

  if (!fs.existsSync(inputDirectory)) {
    console.error(`Error: Output directory "${inputDirectory}" does not exist.`);
    process.exit(1);
  }

  if (samplingProfile === "strictPixel") hardenStrictPixelFrameEdges(inputDirectory);
  if (samplingProfile === "nativeExact") await clipFramesToOwnershipMasks(inputDirectory);

  const tileset = createTileset(inputDirectory, outputDirectory, name, imageFilename, writeTilesetDefinition);
  fs.rmSync(inputDirectory, { recursive: true, force: true });
  return tileset;
}

function createGeneratedAtlasImageData(
  frames: ReturnType<typeof rasterizeCheckerFrames>,
  tileset: ReturnType<typeof getTileset>,
) {
  if (frames.length !== tileset.tilecount) {
    throw new Error(`Checker frame count mismatch: expected ${tileset.tilecount}, received ${frames.length}.`);
  }

  const channels: 4 = 4;
  const data = new Uint8ClampedArray(tileset.imagewidth * tileset.imageheight * channels);

  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.channels !== 4) throw new Error(`Checker frame ${frameIndex} must use RGBA channels.`);
    if (frame.width !== tileset.tilewidth || frame.height !== tileset.tileheight) {
      throw new Error(
        `Checker frame ${frameIndex} size mismatch: expected ${tileset.tilewidth}x${tileset.tileheight}, received ${frame.width}x${frame.height}.`,
      );
    }

    const column = frameIndex % tileset.columns;
    const row = Math.floor(frameIndex / tileset.columns);
    const atlasOffsetX = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
    const atlasOffsetY = tileset.margin + row * (tileset.tileheight + tileset.spacing);

    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const frameOffset = (y * frame.width + x) * channels;
        const atlasOffset = ((atlasOffsetY + y) * tileset.imagewidth + atlasOffsetX + x) * channels;
        data[atlasOffset] = frame.data[frameOffset];
        data[atlasOffset + 1] = frame.data[frameOffset + 1];
        data[atlasOffset + 2] = frame.data[frameOffset + 2];
        data[atlasOffset + 3] = frame.data[frameOffset + 3];
      }
    }
  }

  return {
    width: tileset.imagewidth,
    height: tileset.imageheight,
    channels,
    data,
  };
}

async function writeCheckerAtlas(outputDirectory: string, tileset: ReturnType<typeof getTileset>) {
  const precision = tileset.tilewidth / 8;
  const frames = rasterizeCheckerFrames({
    precision,
    cellsPerAxis: CHECKER_ATLAS_CELLS_PER_AXIS,
    lightValue: CHECKER_ATLAS_LIGHT,
    darkValue: CHECKER_ATLAS_DARK,
    sideValue: CHECKER_ATLAS_SIDE,
    topAlphaValue: CHECKER_ATLAS_TOP_ALPHA,
    sideAlphaValue: CHECKER_ATLAS_SIDE_ALPHA,
  });
  const atlasImageData = createGeneratedAtlasImageData(frames, tileset);
  await saveImageDataToImage(atlasImageData, path.join(outputDirectory, CHECKER_ATLAS_FILENAME));
}

async function generateAssets(
  texture: string,
  blenderBin: string,
  blenderScript: string,
  samplingProfile: BlenderSamplingProfile,
) {
  console.log(`\n--- Processing: ${path.basename(texture)} ---`);
  const name = path.basename(texture, ".png");
  const outputDirectory = path.resolve(`${path.dirname(texture)}/tilesets/${name}`);
  const inputDirectory = path.join(__dirname, BLENDER_RENDER_CONTRACT.outputDirectoryName);

  if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });
  fs.copyFileSync(texture, path.join(outputDirectory, "texture.png"));
  const textureBuffer = await imageToImageData(texture);

  const tileset = await renderTilesetAtlas(
    texture,
    blenderBin,
    blenderScript,
    samplingProfile,
    inputDirectory,
    outputDirectory,
    name,
    "tileset.png",
    true,
  );
  await writeCheckerAtlas(outputDirectory, tileset);
  writeBiomeManifest(outputDirectory, name);

  const exampleTilemap = getTilemap(EXAMPLE_TILE_GID_LAYERS, tileset);
  fs.writeFileSync(path.join(outputDirectory, "example.map.json"), JSON.stringify(exampleTilemap));

  const tileableHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 100, maxValue: 10 });
  fs.writeFileSync(path.join(outputDirectory, `random.tileableHeightmap.json`), JSON.stringify(tileableHeightmap));

  const randomTerrain = tileableHeightmapToTileData(tileableHeightmap);
  const randomTilemap = getTilemap(terrainToLayers(randomTerrain, tileset), tileset);
  fs.writeFileSync(path.join(outputDirectory, `random.map.json`), JSON.stringify(randomTilemap));

  const pixelsPerTile = tileset.tilewidth / 8;
  const randomMapMetadata = tileDataToTerrain(randomTerrain, pixelsPerTile);
  await savePrettyHeightmap(randomMapMetadata.heightmap, path.join(outputDirectory, `random.heightmap.png`));
  await saveNormalmap(randomMapMetadata.normalmap, path.join(outputDirectory, `random.normalmap.png`));
  const softNormalmap = fastBoxBlurVectors(randomMapMetadata.normalmap, 10, 3, false);
  await saveNormalmap(softNormalmap, path.join(outputDirectory, `random.soft.normalmap.png`));
  const textureHeightmap = fastBoxBlur(extractHeightmapFromTextureImageData(textureBuffer), 10, 3, false);
  await savePrettyHeightmap(textureHeightmap, path.join(outputDirectory, `texture.heightmap.png`));
  const textureHeightmapToroidal = fastBoxBlur(extractHeightmapFromTextureImageData(textureBuffer), 10, 3, true);
  await savePrettyHeightmap(textureHeightmapToroidal, path.join(outputDirectory, `texture.toroidal.heightmap.png`));
  const textureNormalmap = heightmapToNormalmap(textureHeightmap);
  const textureNormalmapToroidal = fastBoxBlurVectors(heightmapToNormalmap(textureHeightmap), 10, 3, true);
  await saveNormalmap(textureNormalmap, path.join(outputDirectory, `texture.normalmap.png`));
  await saveNormalmap(textureNormalmapToroidal, path.join(outputDirectory, `texture.toroidal.normalmap.png`));
  const finalNormalmap = addTileNormalmapToGlobalNormalmap(softNormalmap, textureNormalmapToroidal, pixelsPerTile);
  await saveNormalmap(finalNormalmap, path.join(outputDirectory, `random.combined.normalmap.png`));
}

const argv = await yargs(hideBin(process.argv))
  .usage("Usage: bun run tile <file1> [file2...] [options]")
  .command("$0 <textures...>", "Generates an isometric tileset for one or more texture files", (y) => {
    y.positional("textures", {
      describe: "One or more textures to process (glob patterns like *.png are supported)",
      type: "string",
      demandOption: true,
    });
  })
  .option("sampling-profile", {
    describe: "Selects the Blender sampling pipeline",
    choices: [...BLENDER_SAMPLING_PROFILES],
    default: DEFAULT_BLENDER_SAMPLING_PROFILE,
  })
  .help()
  .alias("h", "help")
  .strict()
  .parse();

const { textures } = argv;
const samplingProfileCandidate = argv["sampling-profile"];
if (!BLENDER_SAMPLING_PROFILES.includes(samplingProfileCandidate)) {
  throw new Error(`Invalid sampling profile "${samplingProfileCandidate}".`);
}
const samplingProfile: BlenderSamplingProfile = samplingProfileCandidate;
const blenderBin = process.env["BLENDER_BIN"];
if (!blenderBin) throw new Error(`Blender binary not specified. Set BLENDER_BIN=/path/to/blender`);
if (!fs.existsSync(blenderBin))
  throw new Error(`Blender binary "${blenderBin}" not found, set BLENDER_BIN=/path/to/blender`);
const blenderScript = path.resolve(__dirname, `./${BLENDER_SCRIPT_NAME}`);
if (!fs.existsSync(blenderScript)) throw new Error(`Blender script "${blenderScript}" not found.`);

if (!textures || !Array.isArray(textures) || textures.length === 0) throw new Error("No texture file provided.");
for (const texture of textures)
  if (
    !fs.existsSync(path.resolve(texture)) ||
    !fs.statSync(path.resolve(texture)).isFile() ||
    !texture.endsWith(".png")
  )
    throw new Error(`Texture "${path.resolve(texture)}" not found or not a .png file.`);

for (const texture of textures) await generateAssets(texture, blenderBin, blenderScript, samplingProfile);
