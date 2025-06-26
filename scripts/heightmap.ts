#!/usr/bin/env -S yarn tsx

import { generateHeightmap, printHeightmap } from "./lib/heightmap.js";

const maxValue = 5;

const heightmap = generateHeightmap({ width: 100, height: 50, maxValue, scale: 0.07 });
printHeightmap(heightmap, maxValue);
