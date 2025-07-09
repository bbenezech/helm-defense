#!/usr/bin/env -S yarn tsx

import "dotenv/config";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ORDERED_SLOPES } from "./lib/blender.js";
import path from "node:path";
import fs, { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { imageSize } from "image-size";
import { getTilemap, terrainToLayers } from "../src/game/lib/tilemap.js";
import { tileableHeightmapToTerrain, terrainToMetadata } from "../src/game/lib/terrain.js";
import {
  addTileNormalmapToGlobalNormalmap,
  generateTilableHeightmap,
  heightmapToNormalmap,
  rgbaBufferToHeightmap,
} from "../src/game/lib/heightmap.js";
import { fastBoxBlur, fastBoxBlurVectors } from "../src/game/lib/blur.js";
import { log } from "../src/game/lib/log.js";
import { getTileset } from "../src/game/lib/tileset.js";
import { imageToRgbaBuffer, saveHeightmap, saveNormalmap } from "./lib/file.js";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const SCRIPT_NAME = "tiles-shading-rotation-fast";
const EXAMPLE_TILE_INDEXES = [
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 2, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 7, 7, 7, 7, 2, 1, 3, 14, 15, 2, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 13, 9, 9, 12, 10, 2, 4, 17, 16, 5, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 6, 1, 1, 8, 13, 18, 7, 19, 5, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 10, 7, 7, 11, 10, 11, 0, 10, 2, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 9, 9, 9, 9, 9, 9, 9, 9, 5, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 7, 2, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 2, 1, 1, 3, 14, 0, 15, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 5, 1, 1, 8, 0, 0, 0, 6, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 17, 0, 16, 5, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 9, 5, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 6, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
];

function createTileset(inputDir: string, outputDir: string, name: string) {
  const tileMargin = 0; // margin around each tile
  const tilesetMargin = 0; // margin around the whole tileset image

  const tilecount = fs.readdirSync(inputDir).filter((file) => file.endsWith(".png")).length;
  if (tilecount < 1) throw new Error(`No PNG files found in input directory: ${inputDir}`);
  if (tilecount !== ORDERED_SLOPES.length)
    throw new Error(`tilecount must be ${ORDERED_SLOPES.length}, got ${tilecount}`);
  const firstTilePath = path.join(inputDir, fs.readdirSync(inputDir).find((file) => file.endsWith(".png"))!);
  const tileImage = imageSize(readFileSync(firstTilePath));
  if (tileImage.width % 8 !== 0) throw new Error(`tileimagewidth must be a multiple of 8, got ${tileImage.width}`);

  const imageFilename = "tileset.png";
  const tileset = getTileset({
    name,
    imageFilename,
    tilewidth: tileImage.width,
    tileheight: tileImage.height,
    slopeheight: (tileImage.height - tileImage.width / 2) / 2,
    terrainTileNames: ORDERED_SLOPES,
    tileMargin,
    tilesetMargin,
  });
  fs.writeFileSync(path.join(outputDir, "tileset.json"), JSON.stringify(tileset, null, 2));

  const startsAt = Date.now();
  const imagePath = path.join(outputDir, imageFilename);
  execSync(`magick montage ${inputDir}/*.png \
        -quiet \
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

async function generateAssets(texture: string, blenderBin: string, blenderScript: string) {
  console.log(`\n--- Processing: ${path.basename(texture)} ---`);
  const name = path.basename(texture, ".png");
  const outputDir = path.resolve(`${path.dirname(texture)}/tilesets/${name}`);

  // texture.png is read by Blender from the same directory as the script
  const tmpLocalBlenderTexture = path.join(__dirname, "texture.png");
  fs.copyFileSync(texture, tmpLocalBlenderTexture);

  const startsAt = Date.now();
  execSync(`${blenderBin} -b ${blenderScript} -a`);
  log("blender", startsAt, `${blenderBin} -b ${blenderScript} -a`);
  fs.unlinkSync(tmpLocalBlenderTexture);

  const inputDir = path.join(__dirname, "out"); // Blender outputs to a fixed .out directory
  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Output directory "${inputDir}" does not exist.`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(texture, path.join(outputDir, "texture.png"));

  const tileset = createTileset(inputDir, outputDir, name);
  fs.rmSync(inputDir, { recursive: true, force: true });

  const exampleTilemap = getTilemap(EXAMPLE_TILE_INDEXES, tileset);
  fs.writeFileSync(path.join(outputDir, "example.map.json"), JSON.stringify(exampleTilemap));

  const tileableHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 100, maxValue: 10 });
  fs.writeFileSync(path.join(outputDir, `random.tileableHeightmap.json`), JSON.stringify(tileableHeightmap));

  const randomTerrain = tileableHeightmapToTerrain(tileableHeightmap);
  const randomTilemap = getTilemap(terrainToLayers(randomTerrain, tileset), tileset);
  fs.writeFileSync(path.join(outputDir, `random.map.json`), JSON.stringify(randomTilemap));

  const pixelsPerTile = tileset.tilewidth / 8;
  const randomMapMetadata = terrainToMetadata(randomTerrain, pixelsPerTile);
  await saveHeightmap(randomMapMetadata.heightmap, path.join(outputDir, `random.heightmap.png`));
  await saveNormalmap(randomMapMetadata.normalmap, path.join(outputDir, `random.normalmap.png`));
  const softNormalmap = fastBoxBlurVectors(randomMapMetadata.normalmap, 10);
  await saveNormalmap(softNormalmap, path.join(outputDir, `random.soft.normalmap.png`));
  const textureBuffer = await imageToRgbaBuffer(texture);
  const textureHeightmap = fastBoxBlur(rgbaBufferToHeightmap(textureBuffer), 10);
  await saveHeightmap(textureHeightmap, path.join(outputDir, `texture.heightmap.png`));
  const textureNormalmap = heightmapToNormalmap(textureHeightmap);
  const textureNormalmapToroidal = fastBoxBlurVectors(heightmapToNormalmap(textureHeightmap), 10, 4, true);
  await saveNormalmap(textureNormalmap, path.join(outputDir, `texture.normalmap.png`));
  await saveNormalmap(textureNormalmapToroidal, path.join(outputDir, `texture.toroidal.normalmap.png`));
  const finalNormalmap = addTileNormalmapToGlobalNormalmap(softNormalmap, textureNormalmapToroidal, pixelsPerTile);
  await saveNormalmap(finalNormalmap, path.join(outputDir, `random.combined.normalmap.png`));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: yarn tile <file1> [file2...] [options]")
    .command("$0 <textures...>", "Generates an isometric tileset for one or more texture files", (y) => {
      y.positional("textures", {
        describe: "One or more textures to process (glob patterns like *.png are supported)",
        type: "string",
        demandOption: true,
      });
    })
    .help()
    .alias("h", "help")
    .strict()
    .parse();

  const { textures } = argv;
  const blenderBin = process.env["BLENDER_BIN"];
  if (!blenderBin) throw new Error(`Blender binary not specified. Set BLENDER_BIN=/path/to/blender`);
  if (!fs.existsSync(blenderBin))
    throw new Error(`Blender binary "${blenderBin}" not found, set BLENDER_BIN=/path/to/blender`);
  const blenderScript = path.resolve(__dirname, `./${SCRIPT_NAME}.blend`);
  if (!fs.existsSync(blenderScript)) throw new Error(`Blender script "${blenderScript}" not found.`);

  if (!textures || !Array.isArray(textures) || textures.length === 0) throw new Error("No texture file provided.");
  for (const texture of textures)
    if (
      !fs.existsSync(path.resolve(texture)) ||
      !fs.statSync(path.resolve(texture)).isFile() ||
      !texture.endsWith(".png")
    )
      throw new Error(`Texture "${path.resolve(texture)}" not found or not a .png file.`);

  for (const texture of textures) await generateAssets(texture, blenderBin, blenderScript);
}

main();
