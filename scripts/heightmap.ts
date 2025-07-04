#!/usr/bin/env -S yarn tsx

import {
  generateTilableHeightmap,
  heightmapToNormalmap,
  printHeightmap,
  saveHeightmap,
  saveNormalmap,
} from "./lib/heightmap.js";
import { terrainToMetadata, tileableHeightmapToTerrain } from "./lib/terrain.js";

const tileHeightmap = generateTilableHeightmap({ tileWidth: 100, tileHeight: 40, maxValue: 5 });
printHeightmap(tileHeightmap);

const terrain = tileableHeightmapToTerrain(tileHeightmap);
const metadata = terrainToMetadata(terrain, 16);

heightmapToNormalmap(metadata.heightmap, 10);

saveHeightmap(metadata.heightmap, "heightmap.png");
saveNormalmap(metadata.normalmap, "normalmap1.png");
saveNormalmap(heightmapToNormalmap(metadata.heightmap), "normalmap2.png");
