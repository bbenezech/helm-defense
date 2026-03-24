import { type ThreeSeaDebugView } from "../../three/app.ts";
import { DEFAULT_THREE_SEA_DEBUG_VIEW } from "../../three/sea.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-sea-debug-view";

type SetStateAction = ThreeSeaDebugView | ((previousState: ThreeSeaDebugView) => ThreeSeaDebugView);

export function parseThreeSeaDebugView(value: unknown): ThreeSeaDebugView {
  if (
    value === "final" ||
    value === "water-depth" ||
    value === "water-normal" ||
    value === "foam" ||
    value === "caustics" ||
    value === "underwater-transmittance"
  ) {
    return value;
  }
  if (typeof value === "string") throw new Error(`Invalid Three sea debug view "${value}".`);
  throw new Error("Invalid Three sea debug view.");
}

const threeSeaDebugViewStorageCodec: StorageCodec<ThreeSeaDebugView> = {
  parse: (storedValue) => parseThreeSeaDebugView(storedValue),
  serialize: (value) => value,
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_SEA_DEBUG_VIEW, threeSeaDebugViewStorageCodec);

function readStoredThreeSeaDebugView(): ThreeSeaDebugView {
  try {
    return parseThreeSeaDebugView(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_SEA_DEBUG_VIEW;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeSeaDebugView): ThreeSeaDebugView {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeSeaDebugView();

function get(): ThreeSeaDebugView {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeSeaDebugView(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeSeaDebugView(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeSeaDebugView) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_THREE_SEA_DEBUG_VIEW),
};
