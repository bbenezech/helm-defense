#!/usr/bin/env -S yarn tsx

import { generateTilableHeightmap, heightmapToNormalmap, printHeightmap } from "../src/game/lib/heightmap.js";
import { terrainToMetadata, tileableHeightmapToTerrain } from "../src/game/lib/terrain.js";
import { saveHeightmap, saveNormalmap } from "./lib/file.js";

const tileHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 40, maxValue: 5 });
printHeightmap(tileHeightmap);

const terrain = tileableHeightmapToTerrain(tileHeightmap);
const metadata = terrainToMetadata(terrain, 16);

heightmapToNormalmap(metadata.heightmap, 10);

saveHeightmap(metadata.heightmap, "heightmap.png");
saveNormalmap(metadata.normalmap, "normalmap1.png");
saveNormalmap(heightmapToNormalmap(metadata.heightmap), "normalmap2.png");
