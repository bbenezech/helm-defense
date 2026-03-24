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
const DEFAULT_COLOR_ATLAS_FILENAME = "tileset.png";
const DEFAULT_CHECKER_ATLAS_FILENAME = "tileset.checker.png";
const DEFAULT_EXAMPLE_BIOME_GRID_FILENAME = "example.biome-grid.json";
const DEFAULT_RANDOM_BIOME_GRID_FILENAME = "random.biome-grid.json";

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
  const textureBasename = path.parse(texturePath).name;
  if (textureBasename !== "texture") return textureBasename;

  const directoryBasename = path.basename(path.dirname(texturePath));
  if (directoryBasename.length === 0) {
    throw new Error(`Could not derive a tileset name from "${texturePath}".`);
  }
  return directoryBasename;
}

function getColorAtlasFilename(biomeId: string, isPrimary: boolean): string {
  return isPrimary ? DEFAULT_COLOR_ATLAS_FILENAME : `tileset.${biomeId}.png`;
}

function getCheckerAtlasFilename(biomeId: string, isPrimary: boolean): string {
  return isPrimary ? DEFAULT_CHECKER_ATLAS_FILENAME : `tileset.${biomeId}.checker.png`;
}

function getTextureCopyFilename(biomeId: string, isPrimary: boolean): string {
  return isPrimary ? "texture.png" : `texture.${biomeId}.png`;
}

function hash01(value: number): number {
  return Math.abs(Math.sin(value * 12.9898) * 43_758.545_312_3) % 1;
}

function createExampleBiomeGrid(width: number, height: number, biomeCount: number) {
  const data: number[] = [];

  for (let tileY = 0; tileY < height; tileY++) {
    for (let tileX = 0; tileX < width; tileX++) {
      const bandX = Math.floor((tileX / Math.max(width, 1)) * biomeCount);
      const bandY = Math.floor((tileY / Math.max(height, 1)) * biomeCount);
      data.push((bandX + bandY) % biomeCount);
    }
  }

  return {
    type: "biome-grid",
    width,
    height,
    data,
  };
}

function createRandomBiomeGrid(width: number, height: number, biomeCount: number) {
  if (biomeCount === 1) {
    return {
      type: "biome-grid",
      width,
      height,
      data: Array.from<number>({ length: width * height }).fill(0),
    };
  }

  const columns = Math.ceil(Math.sqrt(biomeCount));
  const rows = Math.ceil(biomeCount / columns);
  const regionWidth = width / columns;
  const regionHeight = height / rows;
  const seeds = Array.from({ length: biomeCount }, (_unused, biomeIndex) => {
    const column = biomeIndex % columns;
    const row = Math.floor(biomeIndex / columns);
    return {
      biomeIndex,
      x: (column + 0.25 + hash01(biomeIndex + 1) * 0.5) * regionWidth,
      y: (row + 0.25 + hash01((biomeIndex + 1) * 17) * 0.5) * regionHeight,
    };
  });
  const data: number[] = [];

  for (let tileY = 0; tileY < height; tileY++) {
    for (let tileX = 0; tileX < width; tileX++) {
      let closestBiomeIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const seed of seeds) {
        const deltaX = tileX + 0.5 - seed.x;
        const deltaY = tileY + 0.5 - seed.y;
        const distance = deltaX * deltaX + deltaY * deltaY;

        if (distance < closestDistance) {
          closestDistance = distance;
          closestBiomeIndex = seed.biomeIndex;
        }
      }

      data.push(closestBiomeIndex);
    }
  }

  return {
    type: "biome-grid",
    width,
    height,
    data,
  };
}

function writeBiomeManifest(
  outputDirectory: string,
  biomes: Array<{ id: string; atlas: string; checkerAtlas: string }>,
) {
  fs.writeFileSync(
    path.join(outputDirectory, BIOME_MANIFEST_FILENAME),
    JSON.stringify({ biomes }, null, 2),
  );
}

async function writeColorAtlas(
  outputDirectory: string,
  tileset: ReturnType<typeof getTileset>,
  textureImage: Awaited<ReturnType<typeof imageToImageData>>,
  atlasFilename: string,
) {
  const startsAt = Date.now();
  const frames = rasterizeTerrainFrames(textureImage, undefined, ACTIVE_TERRAIN_TEXTURE_ROTATION);
  const atlasImageData = createTerrainAtlasImageData(frames, tileset);
  const imagePath = path.join(outputDirectory, atlasFilename);
  await saveImageDataToImage(atlasImageData, imagePath);
  log("createTilesetAtlas", startsAt, `Tileset image created at ${imagePath} (${tileset.imagewidth}x${tileset.imageheight})`);
}

async function writeCheckerAtlas(outputDirectory: string, tileset: ReturnType<typeof getTileset>, atlasFilename: string) {
  const frames = rasterizeCheckerFrames({
    cellsPerAxis: DEFAULT_CHECKER_ATLAS_CELLS_PER_AXIS,
    lightValue: DEFAULT_CHECKER_ATLAS_LIGHT_VALUE,
    darkValue: DEFAULT_CHECKER_ATLAS_DARK_VALUE,
    textureRotation: ACTIVE_TERRAIN_TEXTURE_ROTATION,
  });
  const atlasImageData = createTerrainAtlasImageData(frames, tileset);
  await saveImageDataToImage(atlasImageData, path.join(outputDirectory, atlasFilename));
}

async function generateAssets(textures: string[]) {
  const primaryTexture = textures[0];
  if (primaryTexture === undefined) throw new Error("No biome textures were provided.");
  console.log(`\n--- Processing: ${textures.map((texture) => path.basename(texture)).join(", ")} ---`);
  const name = getTilesetName(primaryTexture);
  const outputDirectory = path.dirname(primaryTexture);

  if (!fs.existsSync(outputDirectory)) fs.mkdirSync(outputDirectory, { recursive: true });

  const biomeTextures = await Promise.all(
    textures.map(async (texturePath, index) => {
      const biomeName = getTilesetName(texturePath);
      const biomeId = getBiomeId(biomeName);
      const isPrimary = index === 0;
      const textureCopyFilename = getTextureCopyFilename(biomeId, isPrimary);
      const outputTexturePath = path.join(outputDirectory, textureCopyFilename);
      const textureImage = await imageToImageData(texturePath);
      await saveImageDataToImage(textureImage, outputTexturePath);

      return {
        biomeId,
        atlasFilename: getColorAtlasFilename(biomeId, isPrimary),
        checkerAtlasFilename: getCheckerAtlasFilename(biomeId, isPrimary),
        textureImage,
      };
    }),
  );
  const biomeIds = new Set<string>();
  for (const biomeTexture of biomeTextures) {
    if (biomeIds.has(biomeTexture.biomeId)) {
      throw new Error(`Duplicate biome id "${biomeTexture.biomeId}" in biome pack generation.`);
    }
    biomeIds.add(biomeTexture.biomeId);
  }
  const primaryBiome = biomeTextures[0];
  if (primaryBiome === undefined) throw new Error("Expected a primary biome texture.");

  const tileset = createTileset(outputDirectory, name, primaryBiome.atlasFilename, true);
  for (const biomeTexture of biomeTextures) {
    await writeColorAtlas(outputDirectory, tileset, biomeTexture.textureImage, biomeTexture.atlasFilename);
    await writeCheckerAtlas(outputDirectory, tileset, biomeTexture.checkerAtlasFilename);
  }
  writeBiomeManifest(
    outputDirectory,
    biomeTextures.map((biomeTexture) => ({
      id: biomeTexture.biomeId,
      atlas: biomeTexture.atlasFilename,
      checkerAtlas: biomeTexture.checkerAtlasFilename,
    })),
  );

  const exampleTilemap = getTilemap(EXAMPLE_TILE_GID_LAYERS, tileset);
  fs.writeFileSync(path.join(outputDirectory, "example.map.json"), JSON.stringify(exampleTilemap));
  fs.writeFileSync(
    path.join(outputDirectory, DEFAULT_EXAMPLE_BIOME_GRID_FILENAME),
    JSON.stringify(createExampleBiomeGrid(exampleTilemap.width, exampleTilemap.height, biomeTextures.length)),
  );

  const tileableHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 100, maxValue: 10 });
  const randomTerrain = tileableHeightmapToTileData(tileableHeightmap);
  const randomTilemap = getTilemap(terrainToLayers(randomTerrain, tileset), tileset);
  fs.writeFileSync(path.join(outputDirectory, "random.map.json"), JSON.stringify(randomTilemap));
  fs.writeFileSync(
    path.join(outputDirectory, DEFAULT_RANDOM_BIOME_GRID_FILENAME),
    JSON.stringify(createRandomBiomeGrid(randomTilemap.width, randomTilemap.height, biomeTextures.length)),
  );

  const pixelsPerTile = tileset.tilewidth / 8;
  const randomMapMetadata = tileDataToTerrain(randomTerrain, pixelsPerTile);
  await savePrettyHeightmap(randomMapMetadata.heightmap, path.join(outputDirectory, "random.heightmap.png"));
  await saveNormalmap(randomMapMetadata.normalmap, path.join(outputDirectory, "random.normalmap.png"));
  const softNormalmap = fastBoxBlurVectors(randomMapMetadata.normalmap, 10, 3, false);
  await saveNormalmap(softNormalmap, path.join(outputDirectory, "random.soft.normalmap.png"));
  const textureHeightmap = fastBoxBlur(extractHeightmapFromTextureImageData(primaryBiome.textureImage), 10, 3, false);
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
  .command("$0 <textures...>", "Generates one biome pack from one or more source textures", (y) => {
    y.positional("textures", {
      describe: "One or more biome source textures to pack together (glob patterns like *.png are supported)",
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
  const extension = path.extname(resolvedTexturePath).toLowerCase();
  const supportedTexture = extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".avif";
  if (!fs.existsSync(resolvedTexturePath) || !fs.statSync(resolvedTexturePath).isFile() || !supportedTexture) {
    throw new Error(`Texture "${resolvedTexturePath}" not found or not a supported image file.`);
  }
}

await generateAssets(textures.map((texture) => path.resolve(texture)));
