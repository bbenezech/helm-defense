#!/usr/bin/env node

import "dotenv/config";
import yargs from "yargs";
import path from "node:path";
import fs from "node:fs";
import { hideBin } from "yargs/helpers";
import { ORDERED_SLOPES, TERRAIN_RENDER_CONTRACT, ACTIVE_TERRAIN_TEXTURE_ROTATION } from "./lib/terrain-scene-spec.ts";
import { EXAMPLE_TILE_GID_LAYERS } from "./lib/terrain-fixtures.ts";
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
import {
  DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
  DEFAULT_CHECKER_ATLAS_DARK_VALUE,
  DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
  rasterizeCheckerFrames,
} from "./lib/terrain-ownership.ts";
import { createTerrainAtlasImageData, rasterizeTerrainFrames } from "./lib/terrain-raster.ts";

const BIOME_MANIFEST_FILENAME = "biomes.json";
const CHECKER_ATLAS_FILENAME = "tileset.checker.png";

function createTileset(outputDirectory: string, name: string, imageFilename: string, writeTilesetDefinition: boolean) {
  const tileMargin = 0;
  const tilesetMargin = 0;
  const tilewidth = TERRAIN_RENDER_CONTRACT.resolution.width;
  const tileheight = TERRAIN_RENDER_CONTRACT.resolution.height;
  if (tilewidth % 8 !== 0) throw new Error(`tilewidth must be a multiple of 8, got ${tilewidth}`);

  const tileset = getTileset({
    name,
    imageFilename,
    tilewidth,
    tileheight,
    elevationYOffsetPx: (tileheight - tilewidth / 2) / 2,
    terrainTileNames: ORDERED_SLOPES,
    tileMargin,
    tilesetMargin,
  });

  if (writeTilesetDefinition) {
    fs.writeFileSync(path.join(outputDirectory, "tileset.json"), JSON.stringify(tileset, null, 2));
  }

  return tileset;
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

function getTilesetName(texturePath: string): string {
  const textureBasename = path.basename(texturePath, ".png");
  if (textureBasename !== "texture") return textureBasename;

  const directoryBasename = path.basename(path.dirname(texturePath));
  if (directoryBasename.length === 0) {
    throw new Error(`Could not derive a tileset name from "${texturePath}".`);
  }
  return directoryBasename;
}

function writeBiomeManifest(outputDirectory: string, tilesetName: string) {
  fs.writeFileSync(
    path.join(outputDirectory, BIOME_MANIFEST_FILENAME),
    JSON.stringify(
      { biomes: [{ id: getBiomeId(tilesetName), atlas: "tileset.png", checkerAtlas: CHECKER_ATLAS_FILENAME }] },
      null,
      2,
    ),
  );
}

async function writeColorAtlas(
  outputDirectory: string,
  tileset: ReturnType<typeof getTileset>,
  textureImage: Awaited<ReturnType<typeof imageToImageData>>,
) {
  const startsAt = Date.now();
  const frames = rasterizeTerrainFrames(textureImage, undefined, ACTIVE_TERRAIN_TEXTURE_ROTATION);
  const atlasImageData = createTerrainAtlasImageData(frames, tileset);
  const imagePath = path.join(outputDirectory, "tileset.png");
  await saveImageDataToImage(atlasImageData, imagePath);
  log("createTilesetAtlas", startsAt, `Tileset image created at ${imagePath} (${tileset.imagewidth}x${tileset.imageheight})`);
}

async function writeCheckerAtlas(outputDirectory: string, tileset: ReturnType<typeof getTileset>) {
  const frames = rasterizeCheckerFrames({
    cellsPerAxis: DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    lightValue: DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    darkValue: DEFAULT_CHECKER_ATLAS_DARK_VALUE,
    textureRotation: ACTIVE_TERRAIN_TEXTURE_ROTATION,
  });
  const atlasImageData = createTerrainAtlasImageData(frames, tileset);
  await saveImageDataToImage(atlasImageData, path.join(outputDirectory, CHECKER_ATLAS_FILENAME));
}

async function generateAssets(texture: string) {
  console.log(`\n--- Processing: ${path.basename(texture)} ---`);
  const name = getTilesetName(texture);
  const outputDirectory = path.dirname(texture);
  const outputTexturePath = path.join(outputDirectory, "texture.png");

  if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });
  if (path.resolve(texture) !== path.resolve(outputTexturePath)) {
    fs.copyFileSync(texture, outputTexturePath);
  }
  const textureImage = await imageToImageData(texture);

  const tileset = createTileset(outputDirectory, name, "tileset.png", true);
  await writeColorAtlas(outputDirectory, tileset, textureImage);
  await writeCheckerAtlas(outputDirectory, tileset);
  writeBiomeManifest(outputDirectory, name);

  const exampleTilemap = getTilemap(EXAMPLE_TILE_GID_LAYERS, tileset);
  fs.writeFileSync(path.join(outputDirectory, "example.map.json"), JSON.stringify(exampleTilemap));

  const tileableHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 100, maxValue: 10 });
  fs.writeFileSync(path.join(outputDirectory, "random.tileableHeightmap.json"), JSON.stringify(tileableHeightmap));

  const randomTerrain = tileableHeightmapToTileData(tileableHeightmap);
  const randomTilemap = getTilemap(terrainToLayers(randomTerrain, tileset), tileset);
  fs.writeFileSync(path.join(outputDirectory, "random.map.json"), JSON.stringify(randomTilemap));

  const pixelsPerTile = tileset.tilewidth / 8;
  const randomMapMetadata = tileDataToTerrain(randomTerrain, pixelsPerTile);
  await savePrettyHeightmap(randomMapMetadata.heightmap, path.join(outputDirectory, "random.heightmap.png"));
  await saveNormalmap(randomMapMetadata.normalmap, path.join(outputDirectory, "random.normalmap.png"));
  const softNormalmap = fastBoxBlurVectors(randomMapMetadata.normalmap, 10, 3, false);
  await saveNormalmap(softNormalmap, path.join(outputDirectory, "random.soft.normalmap.png"));
  const textureHeightmap = fastBoxBlur(extractHeightmapFromTextureImageData(textureImage), 10, 3, false);
  await savePrettyHeightmap(textureHeightmap, path.join(outputDirectory, "texture.heightmap.png"));
  const textureNormalmap = heightmapToNormalmap(textureHeightmap);
  const textureNormalmapToroidal = fastBoxBlurVectors(heightmapToNormalmap(textureHeightmap), 10, 3, true);
  await saveNormalmap(textureNormalmap, path.join(outputDirectory, "texture.normalmap.png"));
  await saveNormalmap(textureNormalmapToroidal, path.join(outputDirectory, "texture.toroidal.normalmap.png"));
  const finalNormalmap = addTileNormalmapToGlobalNormalmap(softNormalmap, textureNormalmapToroidal, pixelsPerTile);
  await saveNormalmap(finalNormalmap, path.join(outputDirectory, "random.combined.normalmap.png"));
}

const argv = await yargs(hideBin(process.argv))
  .usage("Usage: bun run tile <file1> [file2...]")
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

if (!textures || !Array.isArray(textures) || textures.length === 0) throw new Error("No texture file provided.");
for (const texture of textures) {
  const resolvedTexturePath = path.resolve(texture);
  if (!fs.existsSync(resolvedTexturePath) || !fs.statSync(resolvedTexturePath).isFile() || !texture.endsWith(".png")) {
    throw new Error(`Texture "${resolvedTexturePath}" not found or not a .png file.`);
  }
}

for (const texture of textures) await generateAssets(texture);
