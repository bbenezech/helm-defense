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

describe("three debug surface grid store", () => {
  it("reads and persists valid surface grid visibility", async () => {
    globalThis.localStorage.setItem("three-debug-surface-grid", "false");

    const threeDebugSurfaceGridStoreModule = await import("../../src/store/three-debug-surface-grid.ts");
    const store = threeDebugSurfaceGridStoreModule.default;

    expect(store.get()).toBe(false);

    store.set(true);
    expect(store.get()).toBe(true);
    expect(globalThis.localStorage.getItem("three-debug-surface-grid")).toBeNull();

    store.set(false);
    expect(globalThis.localStorage.getItem("three-debug-surface-grid")).toBe("false");
  });

  it("resets invalid stored surface grid visibility", async () => {
    globalThis.localStorage.setItem("three-debug-surface-grid", '"nope"');

    const threeDebugSurfaceGridStoreModule = await import("../../src/store/three-debug-surface-grid.ts");
    const store = threeDebugSurfaceGridStoreModule.default;

    expect(store.get()).toBe(true);
    expect(globalThis.localStorage.getItem("three-debug-surface-grid")).toBeNull();
  });
});
