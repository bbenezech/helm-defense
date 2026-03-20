import { localStore } from "./index.ts";

const STORAGE_KEY = "three-debug-surface-grid";
const store = localStore<boolean>(STORAGE_KEY, true);

type SetStateAction = boolean | ((previousState: boolean) => boolean);

export function parseThreeDebugSurfaceGrid(value: unknown): boolean {
  if (value === true || value === false) return value;
  throw new Error(`Invalid Three debug surface grid visibility "${String(value)}".`);
}

function readStoredThreeDebugSurfaceGrid(): boolean {
  try {
    return parseThreeDebugSurfaceGrid(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return true;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: boolean): boolean {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeDebugSurfaceGrid();

function get(): boolean {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeDebugSurfaceGrid(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeDebugSurfaceGrid(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: boolean) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(true),
  toggle: () => set((current) => !current),
};
