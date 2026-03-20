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
import { rasterizeOwnershipFrames } from "./lib/terrain-ownership.ts";
import { rasterizeMetadataFrames, type RgbaFrame } from "./lib/terrain-metadata.ts";

const __dirname = import.meta.dirname;
const BLENDER_SCRIPT_NAME = "render_tileset.py";
const METADATA_ATLAS_FILENAME = "tileset.metadata.png";
const BIOME_MANIFEST_FILENAME = "biomes.json";
type GeneratedTileset = ReturnType<typeof getTileset>;

function createTileset(inputDirectory: string, outputDirectory: string, name: string) {
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

  const imageFilename = "tileset.png";
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
  fs.writeFileSync(path.join(outputDirectory, "tileset.json"), JSON.stringify(tileset, null, 2));

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

function createFrameAtlasImage(
  frames: RgbaFrame[],
  tileset: GeneratedTileset,
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; channels: 4 } {
  if (frames.length !== tileset.tilecount) {
    throw new Error(`Metadata frame count mismatch: expected ${tileset.tilecount}, received ${frames.length}.`);
  }

  const data = new Uint8ClampedArray(tileset.imagewidth * tileset.imageheight * 4);

  for (const [frameIndex, frame] of frames.entries()) {
    if (frame.width !== tileset.tilewidth || frame.height !== tileset.tileheight) {
      throw new Error(
        `Metadata frame ${frameIndex} size mismatch: expected ${tileset.tilewidth}x${tileset.tileheight}, received ${frame.width}x${frame.height}.`,
      );
    }

    const column = frameIndex % tileset.columns;
    const row = Math.floor(frameIndex / tileset.columns);
    const atlasX = tileset.margin + column * (tileset.tilewidth + tileset.spacing);
    const atlasY = tileset.margin + row * (tileset.tileheight + tileset.spacing);

    for (let pixelY = 0; pixelY < frame.height; pixelY++) {
      const sourceOffset = pixelY * frame.width * 4;
      const targetOffset = ((atlasY + pixelY) * tileset.imagewidth + atlasX) * 4;
      data.set(frame.data.subarray(sourceOffset, sourceOffset + frame.width * 4), targetOffset);
    }
  }

  return {
    data,
    width: tileset.imagewidth,
    height: tileset.imageheight,
    channels: 4,
  };
}

async function writeMetadataAtlas(outputDirectory: string, tileset: GeneratedTileset) {
  const metadataFrames = rasterizeMetadataFrames();
  const ownershipFrames = rasterizeOwnershipFrames();
  if (metadataFrames.length !== ownershipFrames.length) {
    throw new Error(
      `Metadata frame ownership mismatch: expected ${metadataFrames.length} ownership frames, received ${ownershipFrames.length}.`,
    );
  }

  for (const [frameIndex, metadataFrame] of metadataFrames.entries()) {
    const ownershipFrame = ownershipFrames[frameIndex];
    if (ownershipFrame === undefined) throw new Error(`Missing ownership frame ${frameIndex}.`);
    if (metadataFrame.width !== ownershipFrame.width || metadataFrame.height !== ownershipFrame.height) {
      throw new Error(
        `Metadata ownership size mismatch for frame ${frameIndex}: expected ${ownershipFrame.width}x${ownershipFrame.height}, received ${metadataFrame.width}x${metadataFrame.height}.`,
      );
    }

    for (let pixelIndex = 0; pixelIndex < ownershipFrame.coverage.length; pixelIndex++) {
      if (ownershipFrame.coverage[pixelIndex] === 1) continue;
      const rgbaIndex = pixelIndex * 4;
      metadataFrame.data[rgbaIndex] = 0;
      metadataFrame.data[rgbaIndex + 1] = 0;
      metadataFrame.data[rgbaIndex + 2] = 0;
      metadataFrame.data[rgbaIndex + 3] = 0;
    }
  }

  await saveImageDataToImage(createFrameAtlasImage(metadataFrames, tileset), path.join(outputDirectory, METADATA_ATLAS_FILENAME));
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
            metadataAtlas: METADATA_ATLAS_FILENAME,
          },
        ],
      },
      null,
      2,
    ),
  );
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

  // texture.png is read by Blender from the same directory as the script
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

  if (!fs.existsSync(inputDirectory)) {
    console.error(`Error: Output directory "${inputDirectory}" does not exist.`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });
  fs.copyFileSync(texture, path.join(outputDirectory, "texture.png"));
  if (samplingProfile === "strictPixel") hardenStrictPixelFrameEdges(inputDirectory);
  if (samplingProfile === "nativeExact") await clipFramesToOwnershipMasks(inputDirectory);

  const tileset = createTileset(inputDirectory, outputDirectory, name);
  await writeMetadataAtlas(outputDirectory, tileset);
  writeBiomeManifest(outputDirectory, name);
  fs.rmSync(inputDirectory, { recursive: true, force: true });

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
  const textureBuffer = await imageToImageData(texture);
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
