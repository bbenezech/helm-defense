import { afterEach, describe, expect, it } from "vitest";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

class MockLocalStorage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string): string | null {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return value;
  }

  key(index: number): string | null {
    const keys = [...this.values.keys()];
    const value = keys[index];
    if (value === undefined) return null;
    return value;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

afterEach(() => {
  if (originalLocalStorageDescriptor === undefined) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    return;
  }

  Object.defineProperty(globalThis, "localStorage", originalLocalStorageDescriptor);
});

describe("three terrain overlay store", () => {
  it("parses, resets invalid stored values, and persists updates", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: new MockLocalStorage(),
    });
    globalThis.localStorage.setItem("three-terrain-overlay", "wrong");

    const threeTerrainOverlayStoreModule = await import("../../src/store/three-terrain-overlay.ts");
    const store = threeTerrainOverlayStoreModule.default;

    expect(threeTerrainOverlayStoreModule.parseThreeTerrainOverlay("none")).toBe("none");
    expect(threeTerrainOverlayStoreModule.parseThreeTerrainOverlay("tile-boundaries")).toBe("tile-boundaries");
    expect(() => threeTerrainOverlayStoreModule.parseThreeTerrainOverlay("wrong")).toThrow(
      'Invalid Three terrain overlay "wrong"; expected "none" or "tile-boundaries".',
    );

    expect(store.get()).toBe("none");
    expect(globalThis.localStorage.getItem("three-terrain-overlay")).toBeNull();

    store.set("tile-boundaries");
    expect(store.get()).toBe("tile-boundaries");
    expect(globalThis.localStorage.getItem("three-terrain-overlay")).toBe("tile-boundaries");

    store.reset();
    expect(store.get()).toBe("none");
    expect(globalThis.localStorage.getItem("three-terrain-overlay")).toBeNull();
  });
});
