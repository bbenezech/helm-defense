#!/usr/bin/env -S yarn tsx
import "dotenv/config";
const __dirname = path.dirname(new URL(import.meta.url).pathname);

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { createTileset } from "./lib/tileset.js";
import { ORDERED_SLOPES } from "./lib/blender.js";
import { log } from "./lib/log.js";

const SCRIPT_NAME = "tile-no-shading-rotation-fast";

async function generateTileset(texture: string, blenderBin: string, blenderScript: string) {
  console.log(`\n--- Processing: ${path.basename(texture)} ---`);
  const tilesetName = path.basename(texture, ".png");
  const tilesetDir = path.resolve(`${path.dirname(texture)}/tilesets/${tilesetName}`);

  // texture.png is read by Blender from the same directory as the script
  const tmpLocalBlenderTexture = path.join(__dirname, "texture.png");
  fs.copyFileSync(texture, tmpLocalBlenderTexture);

  const startsAt = Date.now();
  execSync(`${blenderBin} -b ${blenderScript} -a`);
  log("blender", startsAt, `${blenderBin} -b ${blenderScript} -a`);
  fs.unlinkSync(tmpLocalBlenderTexture);

  const tmpBlenderOutDir = path.join(__dirname, "out");
  if (!fs.existsSync(tmpBlenderOutDir)) {
    console.error(`Error: Output directory "${tmpBlenderOutDir}" does not exist.`);
    process.exit(1);
  }

  await createTileset(tilesetName, texture, tmpBlenderOutDir, tilesetDir, ORDERED_SLOPES);
  fs.rmSync(tmpBlenderOutDir, { recursive: true, force: true });
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
    throw new Error(`Blender binary "${blenderBin}" not found, set BLENDER_BIN=/path/to/blender.exe`);
  const blenderScript = path.resolve(__dirname, `./${SCRIPT_NAME}.blend`);
  if (!fs.existsSync(blenderScript)) throw new Error(`Blender script "${blenderScript}" not found.`);

  if (!textures || !Array.isArray(textures) || textures.length === 0) throw new Error("No texture files provided.");
  for (const texture of textures)
    if (
      !fs.existsSync(path.resolve(texture)) ||
      !fs.statSync(path.resolve(texture)).isFile() ||
      !texture.endsWith(".png")
    )
      throw new Error(`Texture "${path.resolve(texture)}" not found or not a .png file.`);

  for (const texture of textures) await generateTileset(texture, blenderBin, blenderScript);
}

main();
