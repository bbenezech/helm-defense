import {
  DEFAULT_THREE_LIGHTING_SETTINGS,
  MAX_THREE_ALIASING_RADIUS_TILES,
  MIN_THREE_ALIASING_RADIUS_TILES,
  type ThreeLightingSettings,
} from "../../three/app.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-lighting";

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

function parseStoredThreeLightingNumber(value: string, label: string): number {
  if (value.length === 0) throw new Error(`Missing stored Three lighting ${label}.`);
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) throw new Error(`Invalid stored Three lighting ${label} "${value}".`);
  return numericValue;
}

function parseStoredThreeLightingSettings(storedValue: string): ThreeLightingSettings {
  const parts = storedValue.split("|");
  if (parts.length !== 4) throw new Error(`Invalid stored Three lighting settings "${storedValue}".`);
  const [sunAzimuthDegPart, sunElevationDegPart, ambientPart, aliasingRadiusTilesPart] = parts;
  if (sunAzimuthDegPart === undefined) throw new Error("Missing stored Three lighting azimuth.");
  if (sunElevationDegPart === undefined) throw new Error("Missing stored Three lighting elevation.");
  if (ambientPart === undefined) throw new Error("Missing stored Three lighting ambient.");
  if (aliasingRadiusTilesPart === undefined) throw new Error("Missing stored Three lighting aliasing radius.");

  return parseThreeLightingSettings({
    sunAzimuthDeg: parseStoredThreeLightingNumber(sunAzimuthDegPart, "azimuth"),
    sunElevationDeg: parseStoredThreeLightingNumber(sunElevationDegPart, "elevation"),
    ambient: parseStoredThreeLightingNumber(ambientPart, "ambient"),
    aliasingRadiusTiles: parseStoredThreeLightingNumber(aliasingRadiusTilesPart, "aliasing radius"),
  });
}

const threeLightingStorageCodec: StorageCodec<ThreeLightingSettings> = {
  parse: (storedValue) => parseStoredThreeLightingSettings(storedValue),
  serialize: (value) =>
    [value.sunAzimuthDeg, value.sunElevationDeg, value.ambient, value.aliasingRadiusTiles].map((part) => part.toString()).join(
      "|",
    ),
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_LIGHTING_SETTINGS, threeLightingStorageCodec);

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
