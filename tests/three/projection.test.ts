import { describe, expect, it } from "vitest";
import {
  clampCameraCenter,
  createInitialCameraState,
  getMapBounds,
  pickTile,
  screenToTile,
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

  it("picks top-most elevated tiles", () => {
    const screen = tileToScreen(sampleMap, { x: 1, y: 1 }, { x: 0, y: -16 });
    const picked = pickTile(sampleMap, screen);

    expect(picked?.tileX).toBe(1);
    expect(picked?.tileY).toBe(1);
    expect(picked?.level).toBe(1);
  });

  it("keeps the camera within map bounds", () => {
    const bounds = getMapBounds(sampleMap);
    const state = createInitialCameraState(bounds, { width: 800, height: 600 });
    const clamped = clampCameraCenter({ x: -10_000, y: 10_000 }, bounds, { width: 800, height: 600 }, state.zoom);

    expect(clamped.x).toBeGreaterThanOrEqual(bounds.x);
    expect(clamped.y).toBeLessThanOrEqual(bounds.y + bounds.height);
  });
});
