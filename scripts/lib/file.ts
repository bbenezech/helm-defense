import sharp from "sharp";
import { Jimp } from "jimp";
import {
  heightmapToPrettyImageData,
  normalmapToImageData,
  type Heightmap,
  type Normalmap,
} from "../../src/game/lib/heightmap.js";
import { log } from "../../src/game/lib/log.js";
type ImageData = { data: Uint8ClampedArray; width: number; height: number; channels: 1 | 2 | 3 | 4 };

export async function saveImageDataToImage(
  { data, width, height, channels }: ImageData,
  filename: string,
): Promise<void> {
  const startsAt = Date.now();
  const info = await sharp(data, { raw: { width, height, channels } }).toFile(filename);

  log(
    "saveImageDataToImage",
    startsAt,
    `Saved ImageData to ${filename} (${width}x${height}, ${Math.round(info.size / 1024)}kb)`,
  );
}

export async function saveNormalmap(normalmap: Normalmap, filename: string): Promise<void> {
  await saveImageDataToImage(normalmapToImageData(normalmap), filename);
}

export async function savePrettyHeightmap(heightmap: Heightmap, filename: string): Promise<void> {
  await saveImageDataToImage(heightmapToPrettyImageData(heightmap), filename);
}

export async function imageToImageData(filePath: string): Promise<ImageData> {
  const startsAt = Date.now();
  const image = await Jimp.read(filePath);
  log(`imageToImageData`, startsAt, `Loaded image ${filePath} (${image.bitmap.width}x${image.bitmap.height})`);
  return { ...image.bitmap, channels: 4, data: new Uint8ClampedArray(image.bitmap.data) };
}

export async function saveImageDataToImageJimp({ data, width, height }: ImageData, filename: string): Promise<void> {
  const startsAt = Date.now();
  await new Jimp({ data: Buffer.from(data), width, height }).write(filename as `${string}.${string}`);
  log("saveImageDataToImageJimp", startsAt, `Saved ImageData to ${filename} (${width}x${height})`);
}
