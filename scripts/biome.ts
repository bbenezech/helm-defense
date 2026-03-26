#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import biomeJson from "../three/biome.json" with { type: "json" };
import { parseTerrainTileset } from "../three/assets.ts";
import { imageToImageData, saveImageDataToImage } from "./lib/file.ts";
import { createTerrainAtlasImageData, rasterizeTerrainFrames } from "./lib/terrain-raster.ts";

const SOURCE_FILENAME = "source.png";
const TILESET_FILENAME = "tileset.png";

function getBiomeName(texturePath: string): string {
  const name = path.parse(texturePath).name.toLowerCase();
  if (name.length === 0) {
    throw new Error(`Could not derive a biome name from "${texturePath}".`);
  }
  return name;
}

async function buildBiome(sourceTexturePath: string) {
  const biomeName = getBiomeName(sourceTexturePath);
  const outputDirectory = path.resolve(import.meta.dirname, "../public/biome", biomeName);
  const sourceOutputPath = path.join(outputDirectory, SOURCE_FILENAME);
  const tilesetOutputPath = path.join(outputDirectory, TILESET_FILENAME);
  const sharedTileset = parseTerrainTileset(biomeJson);

  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.copyFileSync(sourceTexturePath, sourceOutputPath);

  const textureImage = await imageToImageData(sourceTexturePath);
  const frames = rasterizeTerrainFrames(textureImage);
  const atlasImageData = createTerrainAtlasImageData(frames, sharedTileset);
  await saveImageDataToImage(atlasImageData, tilesetOutputPath);

  console.log(`biome=${biomeName} source=${sourceOutputPath} tileset=${tilesetOutputPath}`);
}

const argv = await yargs(hideBin(process.argv))
  .usage("Usage: bun biome <source.png>")
  .command("$0 <source>", "Build one biome atlas into public/biome/<name>", (builder) =>
    builder.positional("source", {
      describe: "PNG source texture to rasterize into a terrain biome atlas",
      type: "string",
      demandOption: true,
    }),
  )
  .help()
  .alias("h", "help")
  .strict()
  .parse();

const sourceTexturePath = path.resolve(String(argv["source"]));
if (path.extname(sourceTexturePath).toLowerCase() !== ".png") {
  throw new Error(`Biome source "${sourceTexturePath}" must be a PNG.`);
}
if (!fs.existsSync(sourceTexturePath) || !fs.statSync(sourceTexturePath).isFile()) {
  throw new Error(`Biome source "${sourceTexturePath}" does not exist.`);
}

await buildBiome(sourceTexturePath);
