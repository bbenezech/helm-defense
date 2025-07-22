#!/usr/bin/env -S yarn tsx

import { generateTilableHeightmap, packMetadata, printHeightmap } from "../src/game/lib/heightmap.js";
import { terrainToMetadata, tileableHeightmapToTerrain } from "../src/game/lib/terrain.js";
import { saveImageDataToImage, saveNormalmap } from "./lib/file.js";

const tileHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 40, maxValue: 5 });
printHeightmap(tileHeightmap);

const terrain = tileableHeightmapToTerrain(tileHeightmap);
const metadata = terrainToMetadata(terrain, 16);
const packedMetadata = packMetadata(metadata.heightmap, metadata.normalmap);
saveImageDataToImage(packedMetadata.imageData, "heightmap.png");
saveNormalmap(metadata.normalmap, "normalmap.png");
