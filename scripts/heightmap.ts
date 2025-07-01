#!/usr/bin/env -S yarn tsx

import { generateHeightmap, heightmapToNormalmap, saveHeightmap, saveNormalmap } from "./lib/heightmap.js";
import { terrainToMetadata, heightmapToTerrain } from "./lib/terrain.js";

const maxValue = 5;

const terrain = heightmapToTerrain(generateHeightmap({ tileWidth: 100, tileHeight: 100, maxValue, scale: 0.07 }));
const pixelsPerTile = 16;
const { heightmap, normalmap: normalmap1 } = terrainToMetadata(terrain, pixelsPerTile);
// const softenedHeightmap = fastBoxBlur(rawHeightmap, 4, 3);
// const softenedNormalmap = heightmapToNormalmap(softenedHeightmap, pixelsPerTile);

// printHeightmap(rawHeightmap, maxValue);
// printNormalmap(rawNormalmap);

// saveHeightmap(rawHeightmap, "fine-heightmap.png");
// const softenedHeightmap = fastBoxBlur(rawHeightmap, 4, 3);
// saveHeightmapAsImage(softenedHeightmap, "softened-heightmap.png");
const normalmap2 = heightmapToNormalmap(heightmap, pixelsPerTile, 1);
// const normalmap2 = fastBoxBlurVectors(normalmap1, 4, 3);

saveHeightmap(heightmap, "heightmap.png");
saveNormalmap(normalmap1, "normalmap1.png");
saveNormalmap(normalmap2, "normalmap2.png");
