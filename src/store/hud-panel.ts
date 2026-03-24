import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "hud-panel";

export type HudPanelSections = {
  quick: boolean;
  lighting: boolean;
  terrain: boolean;
  waves: boolean;
  foam: boolean;
  optics: boolean;
  caustics: boolean;
  colors: boolean;
  quality: boolean;
};

export type HudPanelState = {
  isOpen: boolean;
  sections: HudPanelSections;
};

type SetStateAction = HudPanelState | ((previousState: HudPanelState) => HudPanelState);

export function createDefaultHudPanelSections(): HudPanelSections {
  return {
    quick: true,
    lighting: true,
    terrain: false,
    waves: false,
    foam: false,
    optics: false,
    caustics: false,
    colors: false,
    quality: false,
  };
}

export function createClosedHudPanelSections(): HudPanelSections {
  return {
    quick: false,
    lighting: false,
    terrain: false,
    waves: false,
    foam: false,
    optics: false,
    caustics: false,
    colors: false,
    quality: false,
  };
}

export const DEFAULT_HUD_PANEL_STATE: HudPanelState = {
  isOpen: true,
  sections: createDefaultHudPanelSections(),
};

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}

function assertBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") throw new Error(message);
  return value;
}

export function parseHudPanelSections(value: unknown): HudPanelSections {
  const candidate = assertObject(value, "Invalid HUD panel sections.");

  return {
    quick: assertBoolean(candidate["quick"], "Missing HUD panel quick section state."),
    lighting: assertBoolean(candidate["lighting"], "Missing HUD panel lighting section state."),
    terrain: assertBoolean(candidate["terrain"], "Missing HUD panel terrain section state."),
    waves: assertBoolean(candidate["waves"], "Missing HUD panel waves section state."),
    foam: assertBoolean(candidate["foam"], "Missing HUD panel foam section state."),
    optics: assertBoolean(candidate["optics"], "Missing HUD panel optics section state."),
    caustics: assertBoolean(candidate["caustics"], "Missing HUD panel caustics section state."),
    colors: assertBoolean(candidate["colors"], "Missing HUD panel colors section state."),
    quality: assertBoolean(candidate["quality"], "Missing HUD panel quality section state."),
  };
}

export function parseHudPanelState(value: unknown): HudPanelState {
  const candidate = assertObject(value, "Invalid HUD panel state.");

  return {
    isOpen: assertBoolean(candidate["isOpen"], "Missing HUD panel visibility state."),
    sections: parseHudPanelSections(candidate["sections"]),
  };
}

function parseStoredHudPanelBoolean(value: string, label: string): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  throw new Error(`Invalid stored HUD panel ${label} "${value}".`);
}

function parseStoredHudPanelState(storedValue: string): HudPanelState {
  const parts = storedValue.split("|");
  if (parts.length !== 10) throw new Error(`Invalid stored HUD panel state "${storedValue}".`);
  const [
    isOpenPart,
    quickPart,
    lightingPart,
    terrainPart,
    wavesPart,
    foamPart,
    opticsPart,
    causticsPart,
    colorsPart,
    qualityPart,
  ] = parts;

  if (qualityPart === undefined) throw new Error("Missing stored HUD panel quality section state.");

  return parseHudPanelState({
    isOpen: parseStoredHudPanelBoolean(isOpenPart, "visibility"),
    sections: {
      quick: parseStoredHudPanelBoolean(quickPart, "quick section"),
      lighting: parseStoredHudPanelBoolean(lightingPart, "lighting section"),
      terrain: parseStoredHudPanelBoolean(terrainPart, "terrain section"),
      waves: parseStoredHudPanelBoolean(wavesPart, "waves section"),
      foam: parseStoredHudPanelBoolean(foamPart, "foam section"),
      optics: parseStoredHudPanelBoolean(opticsPart, "optics section"),
      caustics: parseStoredHudPanelBoolean(causticsPart, "caustics section"),
      colors: parseStoredHudPanelBoolean(colorsPart, "colors section"),
      quality: parseStoredHudPanelBoolean(qualityPart, "quality section"),
    },
  });
}

function serializeHudPanelBoolean(value: boolean): string {
  return value ? "1" : "0";
}

const hudPanelStorageCodec: StorageCodec<HudPanelState> = {
  parse: (storedValue) => parseStoredHudPanelState(storedValue),
  serialize: (value) =>
    [
      serializeHudPanelBoolean(value.isOpen),
      serializeHudPanelBoolean(value.sections.quick),
      serializeHudPanelBoolean(value.sections.lighting),
      serializeHudPanelBoolean(value.sections.terrain),
      serializeHudPanelBoolean(value.sections.waves),
      serializeHudPanelBoolean(value.sections.foam),
      serializeHudPanelBoolean(value.sections.optics),
      serializeHudPanelBoolean(value.sections.caustics),
      serializeHudPanelBoolean(value.sections.colors),
      serializeHudPanelBoolean(value.sections.quality),
    ].join("|"),
};

const store = localStore(STORAGE_KEY, DEFAULT_HUD_PANEL_STATE, hudPanelStorageCodec);

function readStoredHudPanelState(): HudPanelState {
  try {
    return parseHudPanelState(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_HUD_PANEL_STATE;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: HudPanelState): HudPanelState {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredHudPanelState();

function get(): HudPanelState {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseHudPanelState(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseHudPanelState(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: HudPanelState) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_HUD_PANEL_STATE),
};
