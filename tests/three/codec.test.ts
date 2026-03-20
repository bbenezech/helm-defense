import { describe, expect, it } from "vitest";
import { parseTerrainMap, parseTerrainTileset, type TerrainMap, type TerrainMapLayer } from "../../three/assets.ts";
import { createPackedTerrainCodec } from "../../three/codec.ts";
import { tileToScreen } from "../../three/projection.ts";
import { sampleMap, sampleTileset } from "./fixtures.ts";

function createLayer(width: number, height: number, level: number, tileX: number, tileY: number, gid = 1): TerrainMapLayer {
  const data = Array.from<number>({ length: width * height }).fill(0);
  data[tileY * width + tileX] = gid;

  return {
    id: level + 1,
    name: `level-${level}`,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: -16 * level,
    width,
    height,
    data,
    properties: [{ name: "level", type: "int", value: level }],
  };
}

function createTestMap(levels: number[], tileX: number, tileY: number): TerrainMap {
  return parseTerrainMap({
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width: 6,
    height: 6,
    tilewidth: 128,
    tileheight: 64,
    layers: levels.map((level) => createLayer(6, 6, level, tileX, tileY)),
    tilesets: [{ firstgid: 1, ...sampleTileset }],
  });
}

function createColorAtlas(
  width: number,
  height: number,
  depth: number,
  fill: (tileId: number, x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8Array(width * height * depth * 4);

  for (let layer = 0; layer < depth; layer++) {
    for (let tileId = 0; tileId < sampleTileset.tilecount; tileId++) {
      const column = tileId % sampleTileset.columns;
      const row = Math.floor(tileId / sampleTileset.columns);
      const tileLeft = column * sampleTileset.tilewidth;
      const tileTop = row * sampleTileset.tileheight;

      for (let y = 0; y < sampleTileset.tileheight; y++) {
        for (let x = 0; x < sampleTileset.tilewidth; x++) {
          const atlasX = tileLeft + x;
          const atlasY = tileTop + y;
          const index = layer * width * height * 4 + (atlasY * width + atlasX) * 4;
          const [r, g, b, a] = fill(tileId, x, y);
          data[index] = r;
          data[index + 1] = g;
          data[index + 2] = b;
          data[index + 3] = a;
        }
      }
    }
  }

  return { data, width, height, depth };
}

describe("packed terrain codec", () => {
  it("preserves screen placement when folding levels above 8, 16, and 24", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = createTestMap([0, 8, 16, 24], 4, 3);
    const codec = createPackedTerrainCodec(map, tileset, 16, 0);

    for (const level of [0, 8, 16, 24]) {
      const octave = Math.floor(level / 8);
      const slice = level % 8;
      const packedX = 4 - 2 * octave;
      const packedY = 3 - 2 * octave;
      const packedScreen = codec.getPackedScreen(packedX, packedY, slice);
      const screen = tileToScreen(map, { x: 4, y: 3 }, { x: 0, y: -16 * level });

      expect(packedScreen.x).toBe(screen.x);
      expect(packedScreen.y).toBe(screen.y);
    }
  });

  it("never enumerates more than 24 candidates for a screen pixel", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap(sampleMap);
    const codec = createPackedTerrainCodec(map, tileset, 16, 0);

    for (let screenY = -64; screenY <= 256; screenY += 13) {
      for (let screenX = -256; screenX <= 256; screenX += 17) {
        expect(codec.enumerateCandidates(screenX, screenY).length).toBeLessThanOrEqual(24);
      }
    }
  });

  it("resolves the last painted opaque tile in overlapping coverage", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = parseTerrainMap(sampleMap);
    const codec = createPackedTerrainCodec(map, tileset, 16, 0);
    const atlas = createColorAtlas(sampleTileset.imagewidth, sampleTileset.imageheight, 1, (tileId) => {
      switch (tileId) {
        case 0: {
          return [255, 0, 0, 255];
        }
        case 1: {
          return [0, 255, 0, 255];
        }
        case 2: {
          return [0, 0, 255, 255];
        }
        default: {
          return [255, 255, 0, 255];
        }
      }
    });
    const screen = tileToScreen(map, { x: 1, y: 1 }, { x: 0, y: -16 });
    const hit = codec.resolveVisibleTile(atlas, screen.x, screen.y);

    expect(hit).not.toBeNull();
    if (hit === null) throw new Error("Expected a visible tile hit.");
    expect(hit.tileId).toBe(1);
    expect(hit.rgba).toEqual([0, 255, 0, 255]);
  });

  it("returns null when the visible tile pixel is transparent", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = createTestMap([0], 2, 2);
    const codec = createPackedTerrainCodec(map, tileset, 16, 0);
    const atlas = createColorAtlas(sampleTileset.imagewidth, sampleTileset.imageheight, 1, () => [255, 255, 255, 0]);
    const screen = tileToScreen(map, { x: 2, y: 2 }, { x: 0, y: 0 });

    expect(codec.resolveVisibleTile(atlas, screen.x, screen.y)).toBeNull();
  });

  it("resolves the top row of a tall frame from the tile screen anchor", () => {
    const tileset = parseTerrainTileset(sampleTileset);
    const map = createTestMap([0], 2, 2);
    const codec = createPackedTerrainCodec(map, tileset, 16, 0);
    const atlas = createColorAtlas(sampleTileset.imagewidth, sampleTileset.imageheight, 1, (_tileId, _x, y) =>
      y === 0 ? [255, 255, 255, 255] : [255, 255, 255, 0],
    );
    const screen = tileToScreen(map, { x: 2, y: 2 }, { x: 0, y: 0 });
    const frameTopOffset = sampleTileset.tileheight - map.tileheight;
    const frameTopScreenY = screen.y - frameTopOffset;
    const hit = codec.resolveVisibleTile(atlas, screen.x, frameTopScreenY);

    expect(hit).not.toBeNull();
    if (hit === null) throw new Error("Expected the top frame row to resolve.");
    expect(hit.rgba).toEqual([255, 255, 255, 255]);
  });
});
