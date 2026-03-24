import { DEFAULT_THREE_DEBUG_VIEW, type ThreeDebugView } from "../../three/app.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-debug-view";

type SetStateAction = ThreeDebugView | ((previousState: ThreeDebugView) => ThreeDebugView);

export function parseThreeDebugView(value: unknown): ThreeDebugView {
  if (value === "beauty" || value === "checker") return value;
  if (typeof value === "string") throw new Error(`Invalid Three debug view "${value}"; expected "beauty" or "checker".`);
  throw new Error('Invalid Three debug view; expected "beauty" or "checker".');
}

const threeDebugViewStorageCodec: StorageCodec<ThreeDebugView> = {
  parse: (storedValue) => parseThreeDebugView(storedValue),
  serialize: (value) => value,
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_DEBUG_VIEW, threeDebugViewStorageCodec);

function readStoredThreeDebugView(): ThreeDebugView {
  try {
    return parseThreeDebugView(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_DEBUG_VIEW;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeDebugView): ThreeDebugView {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeDebugView();

function get(): ThreeDebugView {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeDebugView(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeDebugView(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeDebugView) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  toggle: () => set((current) => (current === "beauty" ? "checker" : "beauty")),
  reset: () => set(DEFAULT_THREE_DEBUG_VIEW),
};
