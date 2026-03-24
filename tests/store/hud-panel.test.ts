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

describe("hud panel store", () => {
  it("uses the agreed first-load defaults", async () => {
    const hudPanelStoreModule = await import("../../src/store/hud-panel.ts");
    const store = hudPanelStoreModule.default;

    expect(store.get()).toEqual({
      isOpen: true,
      sections: {
        quick: true,
        lighting: true,
        terrain: false,
        waves: false,
        foam: false,
        optics: false,
        caustics: false,
        colors: false,
        quality: false,
      },
    });
  });

  it("reads and persists valid panel state", async () => {
    globalThis.localStorage.setItem("hud-panel", "0|1|0|1|1|0|1|0|1|1");

    const hudPanelStoreModule = await import("../../src/store/hud-panel.ts");
    const store = hudPanelStoreModule.default;

    expect(store.get().isOpen).toBe(false);
    expect(store.get().sections.terrain).toBe(true);
    expect(store.get().sections.lighting).toBe(false);

    store.set((current) => ({
      ...current,
      isOpen: true,
      sections: {
        ...current.sections,
        optics: false,
      },
    }));

    expect(store.get().isOpen).toBe(true);
    expect(store.get().sections.optics).toBe(false);
    expect(globalThis.localStorage.getItem("hud-panel")).not.toBeNull();
  });

  it("resets invalid stored panel state", async () => {
    globalThis.localStorage.setItem("hud-panel", "oops");

    const hudPanelStoreModule = await import("../../src/store/hud-panel.ts");
    const store = hudPanelStoreModule.default;

    expect(store.get().isOpen).toBe(true);
    expect(store.get().sections.quick).toBe(true);
    expect(globalThis.localStorage.getItem("hud-panel")).toBeNull();
  });
});
