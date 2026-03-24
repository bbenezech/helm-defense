import type { TerrainMap } from "../../three/assets.ts";
import { describe, expect, it } from "vitest";
import {
  clampCameraCenter,
  createInitialCameraState,
  getProjectedCompassState,
  getMapBounds,
  worldPointToScreen,
  screenToTile,
  screenPointToWorld,
  tileToScreen,
} from "../../three/projection.ts";
import { sampleMap } from "./fixtures.ts";

describe("iso projection", () => {
  it("round-trips tile coordinates through screen space", () => {
    const offset = { x: 0, y: 0 };
    const screen = tileToScreen(sampleMap, { x: 1, y: 2 }, offset);
    const tile = screenToTile(sampleMap, screen, offset);

    expect(tile.x).toBeCloseTo(1);
    expect(tile.y).toBeCloseTo(2);
  });

  it("keeps the camera within map bounds", () => {
    const bounds = getMapBounds(sampleMap);
    const state = createInitialCameraState(bounds, { width: 800, height: 600 });
    const clamped = clampCameraCenter({ x: -10_000, y: 10_000 }, bounds, { width: 800, height: 600 }, state.zoom, state.rotationRad);

    expect(clamped.x).toBeGreaterThanOrEqual(bounds.x);
    expect(clamped.y).toBeLessThanOrEqual(bounds.y + bounds.height);
  });

  it("projects isometric cardinals with the expected zero-rotation screen directions", () => {
    const compass = getProjectedCompassState(sampleMap, 0);

    expect(compass.north.x).toBeGreaterThan(0);
    expect(compass.north.y).toBeLessThan(0);
    expect(compass.east.x).toBeGreaterThan(0);
    expect(compass.east.y).toBeGreaterThan(0);
    expect(compass.south.x).toBeLessThan(0);
    expect(compass.south.y).toBeGreaterThan(0);
    expect(compass.west.x).toBeLessThan(0);
    expect(compass.west.y).toBeLessThan(0);
  });

  it("projects orthogonal cardinals with the expected zero-rotation screen directions", () => {
    const orthogonalMap = {
      ...sampleMap,
      orientation: "orthogonal",
    } satisfies TerrainMap;

    const compass = getProjectedCompassState(orthogonalMap, 0);

    expect(compass.north.x).toBeCloseTo(0);
    expect(compass.north.y).toBeLessThan(0);
    expect(compass.east.x).toBeGreaterThan(0);
    expect(compass.east.y).toBeCloseTo(0);
    expect(compass.south.x).toBeCloseTo(0);
    expect(compass.south.y).toBeGreaterThan(0);
    expect(compass.west.x).toBeLessThan(0);
    expect(compass.west.y).toBeCloseTo(0);
  });

  it("rotates compass directions with the active camera rotation", () => {
    const compass = getProjectedCompassState(sampleMap, Math.PI * 0.5);

    expect(compass.north.x).toBeGreaterThan(0);
    expect(compass.north.y).toBeGreaterThan(0);
    expect(compass.east.x).toBeLessThan(0);
    expect(compass.east.y).toBeGreaterThan(0);
  });

  it("keeps opposite compass directions opposed after rotation", () => {
    const compass = getProjectedCompassState(sampleMap, Math.PI / 3);

    expect(compass.north.x).toBeCloseTo(-compass.south.x);
    expect(compass.north.y).toBeCloseTo(-compass.south.y);
    expect(compass.east.x).toBeCloseTo(-compass.west.x);
    expect(compass.east.y).toBeCloseTo(-compass.west.y);
  });

  it("round-trips world points through rotated screen space", () => {
    const bounds = getMapBounds(sampleMap);
    const initialState = createInitialCameraState(bounds, { width: 800, height: 600 });
    const cameraState = {
      ...initialState,
      rotationRad: Math.PI / 6,
    };
    const viewport = { width: 800, height: 600 };
    const world = {
      x: cameraState.center.x + 57,
      y: cameraState.center.y - 41,
    };

    const screen = worldPointToScreen(world, cameraState, viewport);
    const roundTrip = screenPointToWorld(screen, cameraState, viewport);

    expect(roundTrip.x).toBeCloseTo(world.x);
    expect(roundTrip.y).toBeCloseTo(world.y);
  });
});
