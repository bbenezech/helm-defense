import type { TerrainMap, TerrainMapLayer } from "./assets.ts";

export type Point2 = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PickedTile = {
  gid: number;
  tileId: number;
  tileX: number;
  tileY: number;
  level: number;
  layerIndex: number;
  offset: Point2;
};

export type CameraState = {
  center: Point2;
  zoom: number;
  rotationRad: number;
  coverZoom: number;
  zooms: number[];
};

export type Viewport = {
  width: number;
  height: number;
};

export type CompassCardinal = "north" | "east" | "south" | "west";

export type CompassVector = Point2;

export type ThreeCompassState = {
  north: CompassVector;
  east: CompassVector;
  south: CompassVector;
  west: CompassVector;
};

export function getLayerOffset(layer: TerrainMapLayer): Point2 {
  return {
    x: layer.x + layer.offsetx,
    y: layer.y + layer.offsety,
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
  const layerOffsets = map.layers.map((layer) => getLayerOffset(layer));
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
    rotationRad: 0,
    coverZoom,
    zooms,
  };
}

function rotateScreenVector(vector: Point2, rotationRad: number): Point2 {
  const cosRotation = Math.cos(rotationRad);
  const sinRotation = Math.sin(rotationRad);

  return {
    x: vector.x * cosRotation - vector.y * sinRotation,
    y: vector.x * sinRotation + vector.y * cosRotation,
  };
}

function normalizeCompassVector(vector: Point2, label: CompassCardinal): CompassVector {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) throw new Error(`Compass vector "${label}" must not be zero.`);

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getCameraWorldHalfExtents(viewport: Viewport, zoom: number, rotationRad: number): Point2 {
  const halfWidth = viewport.width * 0.5 / zoom;
  const halfHeight = viewport.height * 0.5 / zoom;
  const cosRotation = Math.abs(Math.cos(rotationRad));
  const sinRotation = Math.abs(Math.sin(rotationRad));

  return {
    x: halfWidth * cosRotation + halfHeight * sinRotation,
    y: halfWidth * sinRotation + halfHeight * cosRotation,
  };
}

export function clampCameraCenter(
  center: Point2,
  bounds: Rect,
  viewport: Viewport,
  zoom: number,
  rotationRad: number,
): Point2 {
  const visibleHalfExtents = getCameraWorldHalfExtents(viewport, zoom, rotationRad);
  const minX = bounds.x + visibleHalfExtents.x;
  const maxX = bounds.x + bounds.width - visibleHalfExtents.x;
  const minY = bounds.y + visibleHalfExtents.y;
  const maxY = bounds.y + bounds.height - visibleHalfExtents.y;

  return {
    x: minX > maxX ? bounds.x + bounds.width * 0.5 : Math.min(Math.max(center.x, minX), maxX),
    y: minY > maxY ? bounds.y + bounds.height * 0.5 : Math.min(Math.max(center.y, minY), maxY),
  };
}

export function resizeCameraState(state: CameraState, bounds: Rect, viewport: Viewport): CameraState {
  const nextState = createInitialCameraState(bounds, viewport);
  let zoom = nextState.zooms[0];

  if (nextState.zooms.includes(state.zoom)) {
    zoom = state.zoom;
  } else {
    for (const candidate of nextState.zooms.toReversed()) {
      if (candidate <= state.zoom) {
        zoom = candidate;
        break;
      }
    }
  }

  return {
    center: clampCameraCenter(state.center, bounds, viewport, zoom, state.rotationRad),
    zoom,
    rotationRad: state.rotationRad,
    coverZoom: nextState.coverZoom,
    zooms: nextState.zooms,
  };
}

export function worldOffsetToScreenOffset(offset: Point2, camera: CameraState): Point2 {
  return rotateScreenVector(
    {
      x: offset.x * camera.zoom,
      y: offset.y * camera.zoom,
    },
    camera.rotationRad,
  );
}

export function screenOffsetToWorldOffset(offset: Point2, camera: CameraState): Point2 {
  const worldOffset = rotateScreenVector(offset, -camera.rotationRad);

  return {
    x: worldOffset.x / camera.zoom,
    y: worldOffset.y / camera.zoom,
  };
}

export function screenPointToWorld(screen: Point2, camera: CameraState, viewport: Viewport): Point2 {
  const worldOffset = screenOffsetToWorldOffset(
    {
      x: screen.x - viewport.width * 0.5,
      y: screen.y - viewport.height * 0.5,
    },
    camera,
  );

  return {
    x: camera.center.x + worldOffset.x,
    y: camera.center.y + worldOffset.y,
  };
}

export function worldPointToScreen(world: Point2, camera: CameraState, viewport: Viewport): Point2 {
  const screenOffset = worldOffsetToScreenOffset(
    {
      x: world.x - camera.center.x,
      y: world.y - camera.center.y,
    },
    camera,
  );

  return {
    x: viewport.width * 0.5 + screenOffset.x,
    y: viewport.height * 0.5 + screenOffset.y,
  };
}

export function getContinuousZoom(currentZoom: number, deltaY: number, zooms: number[]): number {
  const zoomDelta = -deltaY * 0.002;
  const nextZoom = currentZoom + zoomDelta;
  return Math.min(Math.max(nextZoom, zooms[0]), zooms[zooms.length - 1]);
}

export function getDiscreteZoom(currentZoom: number, zooms: number[], direction: 1 | -1): number {
  if (direction > 0) {
    for (const zoom of zooms) {
      if (zoom > currentZoom) return zoom;
    }

    return currentZoom;
  }

  for (const zoom of zooms.toReversed()) {
    if (zoom < currentZoom) return zoom;
  }

  return currentZoom;
}

function getLevel(layer: TerrainMapLayer): number {
  for (const property of layer.properties) {
    if (property.name === "level" && typeof property.value === "number") return property.value;
  }

  return 0;
}

function getBaseCompassState(map: TerrainMap): ThreeCompassState {
  const layerOffset = { x: 0, y: 0 };
  const origin = tileToScreen(map, { x: 1, y: 1 }, layerOffset);
  const north = tileToScreen(map, { x: 1, y: 0 }, layerOffset);
  const east = tileToScreen(map, { x: 2, y: 1 }, layerOffset);
  const south = tileToScreen(map, { x: 1, y: 2 }, layerOffset);
  const west = tileToScreen(map, { x: 0, y: 1 }, layerOffset);

  return {
    north: normalizeCompassVector({ x: north.x - origin.x, y: north.y - origin.y }, "north"),
    east: normalizeCompassVector({ x: east.x - origin.x, y: east.y - origin.y }, "east"),
    south: normalizeCompassVector({ x: south.x - origin.x, y: south.y - origin.y }, "south"),
    west: normalizeCompassVector({ x: west.x - origin.x, y: west.y - origin.y }, "west"),
  };
}

export function getProjectedCompassState(map: TerrainMap, rotationRad: number): ThreeCompassState {
  const baseCompassState = getBaseCompassState(map);

  return {
    north: rotateScreenVector(baseCompassState.north, rotationRad),
    east: rotateScreenVector(baseCompassState.east, rotationRad),
    south: rotateScreenVector(baseCompassState.south, rotationRad),
    west: rotateScreenVector(baseCompassState.west, rotationRad),
  };
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

    return {
      gid,
      tileId: gid - tileset.firstgid,
      tileX,
      tileY,
      level: getLevel(layer),
      layerIndex: map.layers.length - reverseIndex - 1,
      offset,
    };
  }

  return null;
}
