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

describe("three sea debug view store", () => {
  it("reads and persists valid debug views", async () => {
    globalThis.localStorage.setItem("three-sea-debug-view", "foam");

    const threeSeaDebugViewStoreModule = await import("../../src/store/three-sea-debug-view.ts");
    const store = threeSeaDebugViewStoreModule.default;

    expect(store.get()).toBe("foam");

    store.set("water-normal");
    expect(store.get()).toBe("water-normal");

    store.set("underwater-transmittance");
    expect(globalThis.localStorage.getItem("three-sea-debug-view")).toBe("underwater-transmittance");
  });

  it("resets invalid stored debug views", async () => {
    globalThis.localStorage.setItem("three-sea-debug-view", "not-a-view");

    const threeSeaDebugViewStoreModule = await import("../../src/store/three-sea-debug-view.ts");
    const store = threeSeaDebugViewStoreModule.default;

    expect(store.get()).toBe("final");
    expect(globalThis.localStorage.getItem("three-sea-debug-view")).toBeNull();
  });
});
