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

describe("three debug view store", () => {
  it("reads and persists valid debug views", async () => {
    globalThis.localStorage.setItem("three-debug-view", '"checker"');

    const threeDebugViewStoreModule = await import("../../src/store/three-debug-view.ts");
    const store = threeDebugViewStoreModule.default;

    expect(store.get()).toBe("checker");

    store.set("beauty");
    expect(store.get()).toBe("beauty");

    store.set("checker");
    expect(globalThis.localStorage.getItem("three-debug-view")).toBe('"checker"');
  });

  it("resets invalid stored debug views", async () => {
    globalThis.localStorage.setItem("three-debug-view", '"nope"');

    const threeDebugViewStoreModule = await import("../../src/store/three-debug-view.ts");
    const store = threeDebugViewStoreModule.default;

    expect(store.get()).toBe("beauty");
    expect(globalThis.localStorage.getItem("three-debug-view")).toBeNull();
  });
});
