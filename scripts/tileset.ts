import path from "node:path";
import fs, { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { imageSize } from "image-size";
import { getExampleMap } from "./map.js";

const TILE_MARGIN = 0; // margin around each tile
const TILESET_MARGIN = 0; // margin around the whole tileset image
const TILESET_COLUMNS = 4;

function getTileset({
  imageFilename,
  name,
  tilecount,
  tileheight,
  tilewidth,
  slopes,
}: {
  name: string;
  imageFilename: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  slopes: string[];
}) {
  const rows = Math.ceil(tilecount / TILESET_COLUMNS);
  const columns = Math.min(TILESET_COLUMNS, tilecount);
  const spacing = TILE_MARGIN * 2;
  const margin = TILESET_MARGIN + TILE_MARGIN;
  const imagewidth = (tilewidth + 2 * TILE_MARGIN) * columns + TILESET_MARGIN * 2;
  const imageheight = (tileheight + 2 * TILE_MARGIN) * rows + TILESET_MARGIN * 2;

  if (tilecount !== slopes.length) throw new Error(`tilecount must be ${slopes.length}, got ${tilecount}`);

  const tiles = Array.from({ length: tilecount }, (_, i) => {
    return { id: i, properties: [{ name: "SLOPE", type: "string", value: slopes[i] }] };
  });

  return {
    type: "tileset",
    name,
    image: imageFilename,
    tilewidth,
    tileheight,
    tilecount,
    rows,
    columns,
    spacing,
    margin,
    imagewidth,
    imageheight,
    tiles,
    version: "1.10",
    tiledversion: "1.11.2",
  };
}

function getMontageCommand({
  tileset,
  inputDir,
  output,
}: {
  tileset: ReturnType<typeof getTileset>;
  inputDir: string;
  output: string;
}) {
  return `magick montage ${inputDir}/*.png \
        -tile ${tileset.columns}x${tileset.rows} \
        -geometry ${tileset.tilewidth}x${tileset.tileheight}+${TILE_MARGIN}+${TILE_MARGIN} \
        -background transparent \
        png:- | magick png:- -bordercolor transparent -border ${TILESET_MARGIN} ${output}`;
}

export const createTilesetFiles = (name: string, inputDir: string, outputDir: string, slopes: string[]) => {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const tilecount = fs.readdirSync(inputDir).filter((file) => file.endsWith(".png")).length;
  if (tilecount < 1) throw new Error(`No PNG files found in input directory: ${inputDir}`);
  const firstTilePath = path.join(inputDir, fs.readdirSync(inputDir).find((file) => file.endsWith(".png"))!);
  const tileImage = imageSize(readFileSync(firstTilePath));
  const tileimagewidth = tileImage.width;
  if (tileimagewidth % 8 !== 0) throw new Error(`tileimagewidth must be a multiple of 8, got ${tileimagewidth}`);
  const tileimageheight = tileImage.height;
  const tilewidth = tileimagewidth;
  const tileheight = tilewidth / 2;
  const slopeheight = (tileimageheight - tileheight) / 2; // one slope height at the top and one slope height at the bottom

  const imageFilename = `${name}.png`;
  const tileset = getTileset({
    name,
    imageFilename,
    tilewidth: tileimagewidth,
    tileheight: tileimageheight,
    tilecount,
    slopes,
  });

  const exampleMapFilename = `${name}-example-map.json`;
  const tilesetFilename = `${name}.json`;
  const exampleMap = getExampleMap({ tilesetSource: tilesetFilename, tilewidth, tileheight, slopeheight });

  execSync(getMontageCommand({ tileset, inputDir, output: path.join(outputDir, imageFilename) }));
  fs.writeFileSync(path.join(outputDir, tilesetFilename), JSON.stringify(tileset, null, 2));
  fs.writeFileSync(path.join(outputDir, exampleMapFilename), JSON.stringify(exampleMap, null, 2));
};
