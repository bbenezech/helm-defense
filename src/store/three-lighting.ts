import {
  DEFAULT_THREE_LIGHTING_SETTINGS,
  MAX_THREE_ALIASING_RADIUS_TILES,
  MIN_THREE_ALIASING_RADIUS_TILES,
  type ThreeLightingSettings,
} from "../../three/app.ts";
import { localStore } from "./index.ts";

const STORAGE_KEY = "three-lighting";
const store = localStore<ThreeLightingSettings>(STORAGE_KEY, DEFAULT_THREE_LIGHTING_SETTINGS);

type SetStateAction = ThreeLightingSettings | ((previousState: ThreeLightingSettings) => ThreeLightingSettings);

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}

function assertFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
  return value;
}

export function parseThreeLightingSettings(value: unknown): ThreeLightingSettings {
  const candidate = assertObject(value, "Invalid Three lighting settings.");
  const sunAzimuthDeg = assertFiniteNumber(candidate["sunAzimuthDeg"], "Missing Three lighting azimuth.");
  const sunElevationDeg = assertFiniteNumber(candidate["sunElevationDeg"], "Missing Three lighting elevation.");
  const ambient = assertFiniteNumber(candidate["ambient"], "Missing Three lighting ambient.");
  const aliasingRadiusTiles = assertFiniteNumber(
    candidate["aliasingRadiusTiles"],
    "Missing Three lighting aliasing radius.",
  );

  if (sunAzimuthDeg < -180 || sunAzimuthDeg > 180) {
    throw new Error(`Three lighting azimuth must be between -180 and 180 degrees, received ${sunAzimuthDeg}.`);
  }
  if (sunElevationDeg < 5 || sunElevationDeg > 85) {
    throw new Error(`Three lighting elevation must be between 5 and 85 degrees, received ${sunElevationDeg}.`);
  }
  if (ambient < 0 || ambient > 1) {
    throw new Error(`Three lighting ambient must be between 0 and 1, received ${ambient}.`);
  }
  if (
    aliasingRadiusTiles < MIN_THREE_ALIASING_RADIUS_TILES ||
    aliasingRadiusTiles > MAX_THREE_ALIASING_RADIUS_TILES
  ) {
    throw new Error(
      `Three lighting aliasing radius must be between ${MIN_THREE_ALIASING_RADIUS_TILES} and ${MAX_THREE_ALIASING_RADIUS_TILES} tiles, received ${aliasingRadiusTiles}.`,
    );
  }

  return {
    sunAzimuthDeg,
    sunElevationDeg,
    ambient,
    aliasingRadiusTiles,
  };
}

function readStoredThreeLightingSettings(): ThreeLightingSettings {
  try {
    return parseThreeLightingSettings(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_LIGHTING_SETTINGS;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeLightingSettings): ThreeLightingSettings {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeLightingSettings();

function get(): ThreeLightingSettings {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeLightingSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeLightingSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeLightingSettings) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_THREE_LIGHTING_SETTINGS),
};
