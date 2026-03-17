import { getLayerOffset, tileToScreen } from "./projection.ts";
import type { TerrainAssetBundle, TerrainChunk, TileInstanceData } from "./types.ts";

export const DEFAULT_CHUNK_SIZE = 32;

function compareInstances(left: TileInstanceData, right: TileInstanceData): number {
  return left.depth - right.depth || left.level - right.level || left.tileY - right.tileY || left.tileX - right.tileX;
}

export function buildTerrainChunks(bundle: TerrainAssetBundle, chunkSize = DEFAULT_CHUNK_SIZE): TerrainChunk[] {
  const chunkIndex = new Map<string, TerrainChunk>();
  const tilesetFirstGid = bundle.map.tilesets[0].firstgid;

  for (const layer of bundle.map.layers) {
    const layerOffset = getLayerOffset(layer);
    const level = Number(
      layer.properties.find((property) => property.name === "level" && typeof property.value === "number")?.value ?? 0,
    );

    for (let tileY = 0; tileY < layer.height; tileY++) {
      for (let tileX = 0; tileX < layer.width; tileX++) {
        const gid = layer.data[tileY * layer.width + tileX];
        if (gid === 0 || gid === undefined) continue;
        const tileId = gid - tilesetFirstGid;
        const atlasRegion = bundle.atlasRegions.get(tileId);
        if (!atlasRegion) throw new Error(`Missing atlas region for tile id "${tileId}"`);

        const chunkX = Math.floor(tileX / chunkSize);
        const chunkY = Math.floor(tileY / chunkSize);
        const key = `${chunkX}:${chunkY}`;
        let chunk = chunkIndex.get(key);
        if (!chunk) {
          chunk = { chunkX, chunkY, instances: [] };
          chunkIndex.set(key, chunk);
        }

        const screen = tileToScreen(bundle.map, { x: tileX, y: tileY }, layerOffset);
        const depth = screen.y + bundle.elevationYOffsetPx + level * 0.01;
        chunk.instances.push({
          gid,
          tileId,
          tileX,
          tileY,
          chunkX,
          chunkY,
          level,
          depth,
          screen: {
            x: screen.x,
            y: screen.y + bundle.elevationYOffsetPx,
          },
          atlasRegion,
        });
      }
    }
  }

  return [...chunkIndex.values()]
    .map((chunk) => ({ ...chunk, instances: chunk.instances.sort(compareInstances) }))
    .sort((left, right) => left.chunkY - right.chunkY || left.chunkX - right.chunkX);
}
