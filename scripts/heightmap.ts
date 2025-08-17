#!/usr/bin/env node

import { generateTilableHeightmap, printHeightmap } from "../src/game/lib/heightmap.ts";
import { packTerrain, tileDataToTerrain, tileableHeightmapToTileData } from "../src/game/lib/terrain.ts";
import { saveImageDataToImage, saveNormalmap } from "./lib/file.ts";

const tileHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 40, maxValue: 5 });
printHeightmap(tileHeightmap);

const tileData = tileableHeightmapToTileData(tileHeightmap);
const terrain = tileDataToTerrain(tileData, 16);
const terrainData = packTerrain(terrain);
saveImageDataToImage(terrainData.imageData, "heightmap.png");
saveNormalmap(terrain.normalmap, "normalmap.png");
