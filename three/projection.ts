import type { PickedTile, Point2, Rect, TerrainMap, TerrainMapLayer } from "./types.ts";

export type CameraState = {
  center: Point2;
  zoom: number;
  coverZoom: number;
  zooms: number[];
};

export type Viewport = {
  width: number;
  height: number;
};

export function getLayerOffset(layer: TerrainMapLayer): Point2 {
  return {
    x: layer.x + (layer.offsetx ?? 0),
    y: layer.y + (layer.offsety ?? 0),
  };
}

export function tileToScreen(map: TerrainMap, tile: Point2, layerOffset: Point2): Point2 {
  if (map.orientation === "orthogonal") {
    return {
      x: tile.x * map.tilewidth + layerOffset.x,
      y: tile.y * map.tileheight + layerOffset.y,
    };
  }

  return {
    x: (tile.x - tile.y) * map.tilewidth * 0.5 + map.tilewidth * 0.5 + layerOffset.x,
    y: (tile.x + tile.y) * map.tileheight * 0.5 + map.tileheight * 0.5 + layerOffset.y,
  };
}

export function screenToTile(map: TerrainMap, screen: Point2, layerOffset: Point2): Point2 {
  const x = screen.x - layerOffset.x;
  const y = screen.y - layerOffset.y;

  if (map.orientation === "orthogonal") {
    return {
      x: x / map.tilewidth,
      y: y / map.tileheight,
    };
  }

  const halfTileWidthInv = 2 / map.tilewidth;
  const halfTileHeightInv = 2 / map.tileheight;

  return {
    x: (x * halfTileWidthInv + y * halfTileHeightInv) * 0.5 - 1,
    y: (y * halfTileHeightInv - x * halfTileWidthInv) * 0.5,
  };
}

export function getMapBounds(map: TerrainMap): Rect {
  const layerOffsets = map.layers.map(getLayerOffset);
  const minOffsetY = Math.min(...layerOffsets.map((layer) => layer.y));
  const maxOffsetY = Math.max(...layerOffsets.map((layer) => layer.y));
  const minOffsetX = Math.min(...layerOffsets.map((layer) => layer.x));
  const maxOffsetX = Math.max(...layerOffsets.map((layer) => layer.x));
  const fullWidth = map.width * map.tilewidth + (maxOffsetX - minOffsetX);
  const fullHeight = map.height * map.tileheight + (maxOffsetY - minOffsetY);

  if (map.orientation === "orthogonal") {
    return {
      x: minOffsetX,
      y: minOffsetY,
      width: fullWidth,
      height: fullHeight,
    };
  }

  return {
    x: -(map.width * map.tilewidth) / 2 + map.tilewidth / 2 + minOffsetX,
    y: map.tileheight / 2 + minOffsetY,
    width: fullWidth,
    height: fullHeight,
  };
}

export function createInitialCameraState(bounds: Rect, viewport: Viewport): CameraState {
  const coverZoom = Math.max(viewport.width / bounds.width, viewport.height / bounds.height);
  const zooms = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2].filter((zoom) => zoom > coverZoom * 1.25);
  zooms.unshift(coverZoom);

  return {
    center: {
      x: bounds.x + bounds.width * 0.5,
      y: bounds.y + bounds.height * 0.5,
    },
    zoom: zooms[0],
    coverZoom,
    zooms,
  };
}

export function clampCameraCenter(center: Point2, bounds: Rect, viewport: Viewport, zoom: number): Point2 {
  const visibleWidth = viewport.width / zoom;
  const visibleHeight = viewport.height / zoom;
  const minX = bounds.x + visibleWidth * 0.5;
  const maxX = bounds.x + bounds.width - visibleWidth * 0.5;
  const minY = bounds.y + visibleHeight * 0.5;
  const maxY = bounds.y + bounds.height - visibleHeight * 0.5;

  return {
    x: minX > maxX ? bounds.x + bounds.width * 0.5 : Math.min(Math.max(center.x, minX), maxX),
    y: minY > maxY ? bounds.y + bounds.height * 0.5 : Math.min(Math.max(center.y, minY), maxY),
  };
}

export function resizeCameraState(state: CameraState, bounds: Rect, viewport: Viewport): CameraState {
  const nextState = createInitialCameraState(bounds, viewport);
  const zoom = nextState.zooms.includes(state.zoom)
    ? state.zoom
    : (nextState.zooms.toReversed().find((candidate) => candidate <= state.zoom) ?? nextState.zooms[0]);

  return {
    center: clampCameraCenter(state.center, bounds, viewport, zoom),
    zoom,
    coverZoom: nextState.coverZoom,
    zooms: nextState.zooms,
  };
}

export function screenPointToWorld(screen: Point2, camera: CameraState, viewport: Viewport): Point2 {
  return {
    x: camera.center.x + (screen.x - viewport.width * 0.5) / camera.zoom,
    y: camera.center.y + (screen.y - viewport.height * 0.5) / camera.zoom,
  };
}

export function getContinuousZoom(currentZoom: number, deltaY: number, zooms: number[]): number {
  const zoomDelta = -deltaY * 0.002;
  const nextZoom = currentZoom + zoomDelta;
  return Math.min(Math.max(nextZoom, zooms[0]), zooms[zooms.length - 1]);
}

export function getDiscreteZoom(currentZoom: number, zooms: number[], direction: 1 | -1): number {
  if (direction > 0) {
    return zooms.find((zoom) => zoom > currentZoom) ?? currentZoom;
  }

  return zooms.toReversed().find((zoom) => zoom < currentZoom) ?? currentZoom;
}

export function pickTile(map: TerrainMap, screen: Point2): PickedTile | null {
  const tileset = map.tilesets[0];
  const layers = map.layers.toReversed();

  for (const [reverseIndex, layer] of layers.entries()) {
    const offset = getLayerOffset(layer);
    const tile = screenToTile(map, screen, offset);
    const tileX = Math.floor(tile.x);
    const tileY = Math.floor(tile.y);
    if (tileX < 0 || tileY < 0 || tileX >= layer.width || tileY >= layer.height) continue;

    const gid = layer.data[tileY * layer.width + tileX];
    if (gid === 0 || gid === undefined) continue;

    const level = Number(
      layer.properties.find((property) => property.name === "level" && typeof property.value === "number")?.value ?? 0,
    );

    return {
      gid,
      tileId: gid - tileset.firstgid,
      tileX,
      tileY,
      level,
      layerIndex: map.layers.length - reverseIndex - 1,
      offset,
    };
  }

  return null;
}
