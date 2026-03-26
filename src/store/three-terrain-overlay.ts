import { DEFAULT_THREE_TERRAIN_OVERLAY, type ThreeTerrainOverlay } from "../../three/app.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-terrain-overlay";

type SetStateAction = ThreeTerrainOverlay | ((previousState: ThreeTerrainOverlay) => ThreeTerrainOverlay);

export function parseThreeTerrainOverlay(value: unknown): ThreeTerrainOverlay {
  if (value === "none" || value === "tile-boundaries") return value;
  if (typeof value === "string") {
    throw new Error(`Invalid Three terrain overlay "${value}"; expected "none" or "tile-boundaries".`);
  }
  throw new Error('Invalid Three terrain overlay; expected "none" or "tile-boundaries".');
}

const threeTerrainOverlayStorageCodec: StorageCodec<ThreeTerrainOverlay> = {
  parse: (storedValue) => parseThreeTerrainOverlay(storedValue),
  serialize: (value) => value,
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_TERRAIN_OVERLAY, threeTerrainOverlayStorageCodec);

function readStoredThreeTerrainOverlay(): ThreeTerrainOverlay {
  try {
    return parseThreeTerrainOverlay(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_TERRAIN_OVERLAY;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeTerrainOverlay): ThreeTerrainOverlay {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeTerrainOverlay();

function get(): ThreeTerrainOverlay {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeTerrainOverlay(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeTerrainOverlay(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeTerrainOverlay) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_THREE_TERRAIN_OVERLAY),
};
