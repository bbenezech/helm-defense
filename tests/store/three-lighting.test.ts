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

describe("three lighting store", () => {
  it("returns a stable snapshot until lighting changes", async () => {
    globalThis.localStorage.setItem(
      "three-lighting",
      '{"sunAzimuthDeg":15,"sunElevationDeg":35,"ambient":0.7,"aliasingRadiusTiles":0.125}',
    );

    const threeLightingStoreModule = await import("../../src/store/three-lighting.ts");
    const store = threeLightingStoreModule.default;

    const firstSnapshot = store.get();
    const secondSnapshot = store.get();

    expect(firstSnapshot).toBe(secondSnapshot);

    store.set({
      sunAzimuthDeg: 20,
      sunElevationDeg: 30,
      ambient: 0.5,
      aliasingRadiusTiles: 0.05,
    });

    const updatedSnapshot = store.get();
    const repeatedUpdatedSnapshot = store.get();

    expect(updatedSnapshot).toBe(repeatedUpdatedSnapshot);
    expect(updatedSnapshot).not.toBe(firstSnapshot);
    expect(updatedSnapshot.sunAzimuthDeg).toBe(20);
    expect(updatedSnapshot.sunElevationDeg).toBe(30);
    expect(updatedSnapshot.ambient).toBe(0.5);
    expect(updatedSnapshot.aliasingRadiusTiles).toBe(0.05);
  });
});
