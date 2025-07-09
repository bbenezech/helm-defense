import sharp from "sharp";
import { Jimp } from "jimp";
import {
  heightmapToRgbaBuffer,
  normalmapToRgbaBuffer,
  type Heightmap,
  type Normalmap,
  type RgbaBuffer,
} from "../../src/game/lib/heightmap.js";
import { log } from "../../src/game/lib/log.js";

export async function saveRgbaBufferToImage({ data, width, height }: RgbaBuffer, filename: string): Promise<void> {
  const startsAt = Date.now();
  const info = await sharp(data, { raw: { width: width, height: height, channels: 4 } }).toFile(filename);

  log(
    "saveRgbaBufferToImageSharp",
    startsAt,
    `Saved RGBA buffer to ${filename} (${width}x${height}, ${Math.round(info.size / 1024)}kb)`,
  );
}

export async function saveNormalmap(normalmap: Normalmap, filename: string): Promise<void> {
  await saveRgbaBufferToImage(normalmapToRgbaBuffer(normalmap), filename);
}

export async function saveHeightmap(heightmap: Heightmap, filename: string): Promise<void> {
  await saveRgbaBufferToImage(heightmapToRgbaBuffer(heightmap), filename);
}

export async function imageToRgbaBuffer(filePath: string): Promise<RgbaBuffer> {
  const startsAt = Date.now();
  const image = await Jimp.read(filePath);
  log(`imageToRgbaBuffer`, startsAt, `Loaded image ${filePath} (${image.bitmap.width}x${image.bitmap.height})`);
  return { ...image.bitmap, data: new Uint8ClampedArray(image.bitmap.data) };
}

export async function saveRgbaBufferToImageJimp({ data, width, height }: RgbaBuffer, filename: string): Promise<void> {
  const startsAt = Date.now();
  await new Jimp({ data: Buffer.from(data), width, height }).write(filename as `${string}.${string}`);
  log("saveRgbaBufferToImageJimp", startsAt, `Saved RGBA buffer to ${filename} (${width}x${height})`);
}
