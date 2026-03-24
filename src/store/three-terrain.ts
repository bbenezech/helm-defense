import {
  DEFAULT_THREE_TERRAIN_SETTINGS,
  type ThreeTerrainSettings,
} from "../../three/app.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-terrain";

export const MIN_THREE_TERRAIN_CORNER_NOISE_SCALE = 0.5;
export const MAX_THREE_TERRAIN_CORNER_NOISE_SCALE = 20;
export const THREE_TERRAIN_CORNER_NOISE_SCALE_STEP = 0.1;
export const MIN_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE = 0;
export const MAX_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE = 0.5;
export const THREE_TERRAIN_CORNER_NOISE_AMPLITUDE_STEP = 0.005;
export const MIN_THREE_TERRAIN_OCTAVE_SCALE = 1;
export const MAX_THREE_TERRAIN_OCTAVE_SCALE = 4;
export const THREE_TERRAIN_OCTAVE_SCALE_STEP = 0.01;
export const MIN_THREE_TERRAIN_OCTAVE_MIX = 0;
export const MAX_THREE_TERRAIN_OCTAVE_MIX = 1;
export const THREE_TERRAIN_OCTAVE_MIX_STEP = 0.01;

type SetStateAction = ThreeTerrainSettings | ((previousState: ThreeTerrainSettings) => ThreeTerrainSettings);

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}

function assertFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
  return value;
}

function assertNumberInRange(value: number, min: number, max: number, label: string): number {
  if (value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}, received ${value}.`);
  return value;
}

export function parseThreeTerrainSettings(value: unknown): ThreeTerrainSettings {
  const candidate = assertObject(value, "Invalid Three terrain settings.");
  const cornerNoiseScale = assertNumberInRange(
    assertFiniteNumber(candidate["cornerNoiseScale"], "Missing Three terrain corner noise scale."),
    MIN_THREE_TERRAIN_CORNER_NOISE_SCALE,
    MAX_THREE_TERRAIN_CORNER_NOISE_SCALE,
    "Three terrain corner noise scale",
  );
  const cornerNoiseAmplitude = assertNumberInRange(
    assertFiniteNumber(candidate["cornerNoiseAmplitude"], "Missing Three terrain corner noise amplitude."),
    MIN_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE,
    MAX_THREE_TERRAIN_CORNER_NOISE_AMPLITUDE,
    "Three terrain corner noise amplitude",
  );
  const octaveScale = assertNumberInRange(
    assertFiniteNumber(candidate["octaveScale"], "Missing Three terrain octave scale."),
    MIN_THREE_TERRAIN_OCTAVE_SCALE,
    MAX_THREE_TERRAIN_OCTAVE_SCALE,
    "Three terrain octave scale",
  );
  const octaveMix = assertNumberInRange(
    assertFiniteNumber(candidate["octaveMix"], "Missing Three terrain octave mix."),
    MIN_THREE_TERRAIN_OCTAVE_MIX,
    MAX_THREE_TERRAIN_OCTAVE_MIX,
    "Three terrain octave mix",
  );

  return {
    cornerNoiseScale,
    cornerNoiseAmplitude,
    octaveScale,
    octaveMix,
  };
}

function parseStoredThreeTerrainNumber(value: string, label: string): number {
  if (value.length === 0) throw new Error(`Missing stored Three terrain ${label}.`);
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) throw new Error(`Invalid stored Three terrain ${label} "${value}".`);
  return numericValue;
}

function parseStoredThreeTerrainSettings(storedValue: string): ThreeTerrainSettings {
  const parts = storedValue.split("|");
  if (parts.length !== 4) throw new Error(`Invalid stored Three terrain settings "${storedValue}".`);
  const [cornerNoiseScalePart, cornerNoiseAmplitudePart, octaveScalePart, octaveMixPart] = parts;
  if (cornerNoiseScalePart === undefined) throw new Error("Missing stored Three terrain corner noise scale.");
  if (cornerNoiseAmplitudePart === undefined) throw new Error("Missing stored Three terrain corner noise amplitude.");
  if (octaveScalePart === undefined) throw new Error("Missing stored Three terrain octave scale.");
  if (octaveMixPart === undefined) throw new Error("Missing stored Three terrain octave mix.");

  return parseThreeTerrainSettings({
    cornerNoiseScale: parseStoredThreeTerrainNumber(cornerNoiseScalePart, "corner noise scale"),
    cornerNoiseAmplitude: parseStoredThreeTerrainNumber(cornerNoiseAmplitudePart, "corner noise amplitude"),
    octaveScale: parseStoredThreeTerrainNumber(octaveScalePart, "octave scale"),
    octaveMix: parseStoredThreeTerrainNumber(octaveMixPart, "octave mix"),
  });
}

const threeTerrainStorageCodec: StorageCodec<ThreeTerrainSettings> = {
  parse: (storedValue) => parseStoredThreeTerrainSettings(storedValue),
  serialize: (value) =>
    [value.cornerNoiseScale, value.cornerNoiseAmplitude, value.octaveScale, value.octaveMix]
      .map((part) => part.toString())
      .join("|"),
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_TERRAIN_SETTINGS, threeTerrainStorageCodec);

function readStoredThreeTerrainSettings(): ThreeTerrainSettings {
  try {
    return parseThreeTerrainSettings(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_TERRAIN_SETTINGS;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeTerrainSettings): ThreeTerrainSettings {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeTerrainSettings();

function get(): ThreeTerrainSettings {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeTerrainSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeTerrainSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeTerrainSettings) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_THREE_TERRAIN_SETTINGS),
};
