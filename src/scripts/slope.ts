import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createTilesetFiles } from "./tileset.ts";

const SCRIPT_NAME = "slope-shading-rotation";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const defaultBlenderBin = process.env["BLENDER"] || "/Applications/Blender.app/Contents/MacOS/Blender";

function generateTileset(texture: string, blenderBin: string, blenderScript: string) {
  console.log(`\n--- Processing: ${path.basename(texture)} ---`);

  // texture.png is read by Blender from the same directory as the script
  const tmpLocalBlenderTexture = path.join(__dirname, "texture.png");
  fs.copyFileSync(texture, tmpLocalBlenderTexture);
  execSync(`${blenderBin} -b ${blenderScript} -a`);
  fs.unlinkSync(tmpLocalBlenderTexture);

  const tmpBlenderOutDir = path.join(__dirname, "out");
  if (!fs.existsSync(tmpBlenderOutDir)) {
    console.error(`Error: Output directory "${tmpBlenderOutDir}" does not exist.`);
    process.exit(1);
  }

  const tilesetName = path.basename(texture, ".png");
  const tilesetDir = path.resolve(`${path.dirname(texture)}/../tilesets`);
  createTilesetFiles(tilesetName, tmpBlenderOutDir, tilesetDir);
  fs.rmSync(tmpBlenderOutDir, { recursive: true, force: true });
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: yarn skew <file1> [file2...] [options]")
    .command("$0 <textures...>", "Generates an isometric tileset for one or more texture files", (y) => {
      y.positional("textures", {
        describe: "One or more textures to process (glob patterns like *.png are supported)",
        type: "string",
        demandOption: true,
      });
    })
    .option("blender", { alias: "b", type: "string", default: defaultBlenderBin })
    .help()
    .alias("h", "help")
    .strict()
    .parse();

  const { blender, textures } = argv;
  const blenderBin = path.resolve(blender);
  if (!fs.existsSync(blenderBin))
    throw new Error(
      `Blender binary "${blenderBin}" not found, set BLENDER=/path/to/blender.exe or use --blender=/path/to/blender.exe`,
    );
  const blenderScript = path.resolve(__dirname, `./${SCRIPT_NAME}.blend`);
  if (!fs.existsSync(blenderScript)) throw new Error(`Error: Blender script "${blenderScript}" not found.`);

  if (!textures || !Array.isArray(textures) || textures.length === 0) throw new Error("No texture files provided.");
  for (const texture of textures)
    if (
      !fs.existsSync(path.resolve(texture)) ||
      !fs.statSync(path.resolve(texture)).isFile() ||
      !texture.endsWith(".png")
    )
      throw new Error(`Texture "${path.resolve(texture)}" not found or not a .png file.`);

  for (const texture of textures) generateTileset(texture, blenderBin, blenderScript);
}

main();
