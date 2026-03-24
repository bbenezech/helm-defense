import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: new MockLocalStorage(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe("three terrain store", () => {
  it("reads and persists valid terrain settings", async () => {
    globalThis.localStorage.setItem("three-terrain", "8.5|0.15|2.4|0.75");

    const threeTerrainStoreModule = await import("../../src/store/three-terrain.ts");
    const store = threeTerrainStoreModule.default;

    expect(store.get()).toEqual({
      cornerNoiseScale: 8.5,
      cornerNoiseAmplitude: 0.15,
      octaveScale: 2.4,
      octaveMix: 0.75,
    });

    store.set({
      cornerNoiseScale: 7.2,
      cornerNoiseAmplitude: 0.08,
      octaveScale: 1.8,
      octaveMix: 0.35,
    });

    expect(store.get()).toEqual({
      cornerNoiseScale: 7.2,
      cornerNoiseAmplitude: 0.08,
      octaveScale: 1.8,
      octaveMix: 0.35,
    });
    expect(globalThis.localStorage.getItem("three-terrain")).toBe("7.2|0.08|1.8|0.35");
  });

  it("resets invalid stored terrain settings", async () => {
    globalThis.localStorage.setItem("three-terrain", "oops");

    const threeTerrainStoreModule = await import("../../src/store/three-terrain.ts");
    const store = threeTerrainStoreModule.default;

    expect(store.get()).toEqual({
      cornerNoiseScale: 6,
      cornerNoiseAmplitude: 0.22,
      octaveScale: 2.03,
      octaveMix: 0.68,
    });
    expect(globalThis.localStorage.getItem("three-terrain")).toBeNull();
  });

  it("reset restores the default terrain settings", async () => {
    const threeTerrainStoreModule = await import("../../src/store/three-terrain.ts");
    const store = threeTerrainStoreModule.default;

    store.set({
      cornerNoiseScale: 10,
      cornerNoiseAmplitude: 0.4,
      octaveScale: 3.5,
      octaveMix: 0.2,
    });
    store.reset();

    expect(store.get()).toEqual({
      cornerNoiseScale: 6,
      cornerNoiseAmplitude: 0.22,
      octaveScale: 2.03,
      octaveMix: 0.68,
    });
    expect(globalThis.localStorage.getItem("three-terrain")).toBe("6|0.22|2.03|0.68");
  });
});
