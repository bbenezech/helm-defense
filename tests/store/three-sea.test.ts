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

describe("three sea store", () => {
  it("reads and persists valid sea settings", async () => {
    globalThis.localStorage.setItem(
      "three-sea",
      [
        "sea",
        "2.2",
        "0.4",
        "0.3",
        "1.8",
        "0.9",
        "4.5",
        "5",
        "0.5",
        "0.4",
        "64",
        "12345",
        "23456",
        "34567",
        "45678",
        "56789",
        "0.11",
        "20",
        "0.2",
        "45",
        "0.07",
        "12",
        "0.25",
        "-35",
        "0.03",
        "5",
        "0.7",
        "80",
        "0.2",
        "10",
        "1",
        "1.2",
        "0.6",
        "0.2",
        "4",
        "0.8",
        "0.3",
        "0.5",
        "0.4",
        "6",
        "0.35",
        "1.5",
        "3",
        "2",
      ].join("|"),
    );

    const threeSeaStoreModule = await import("../../src/store/three-sea.ts");
    const store = threeSeaStoreModule.default;

    expect(store.get().waterLevelLevels).toBe(2.2);
    expect(store.get().foamWidthLevels).toBe(0.4);
    expect(store.get().quality.waveOctaves).toBe(3);

    store.set((current) => ({
      ...current,
      waterLevelLevels: 3.1,
      foamWidthLevels: 0.55,
    }));

    expect(store.get().waterLevelLevels).toBe(3.1);
    expect(store.get().foamWidthLevels).toBe(0.55);
    expect(globalThis.localStorage.getItem("three-sea")).not.toBeNull();
  });

  it("resets invalid stored sea settings", async () => {
    globalThis.localStorage.setItem("three-sea", "sea|999");

    const threeSeaStoreModule = await import("../../src/store/three-sea.ts");
    const store = threeSeaStoreModule.default;

    expect(store.get().mode).toBe("sea");
    expect(store.get().waterLevelLevels).toBe(1.8);
    expect(globalThis.localStorage.getItem("three-sea")).toBeNull();
  });
});
