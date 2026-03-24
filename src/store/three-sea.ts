import type { ThreeSeaMode, ThreeSeaQualitySettings, ThreeSeaSettings, ThreeSeaWaveBandSettings } from "../../three/app.ts";
import { DEFAULT_THREE_SEA_SETTINGS } from "../../three/sea.ts";
import { localStore, type StorageCodec } from "./index.ts";

const STORAGE_KEY = "three-sea";

type SetStateAction = ThreeSeaSettings | ((previousState: ThreeSeaSettings) => ThreeSeaSettings);

function assertObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return Object.fromEntries(Object.entries(value));
}

function assertFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(message);
  return value;
}

function assertInteger(value: number, message: string): number {
  if (!Number.isInteger(value)) throw new Error(message);
  return value;
}

function assertNumberInRange(value: number, min: number, max: number, label: string): number {
  if (value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}, received ${value}.`);
  return value;
}

function assertSeaMode(value: unknown): ThreeSeaMode {
  if (value === "off" || value === "sea") return value;
  if (typeof value === "string") throw new Error(`Invalid Three sea mode "${value}".`);
  throw new Error('Invalid Three sea mode; expected "off" or "sea".');
}

function assertColorHex(value: unknown, label: string): number {
  const color = assertInteger(assertFiniteNumber(value, `Missing ${label}.`), `${label} must be an integer color.`);
  if (color < 0 || color > 0xff_ff_ff) throw new Error(`${label} must be between 0x000000 and 0xffffff.`);
  return color;
}

function parseWaveBandSettings(value: unknown, label: string): ThreeSeaWaveBandSettings {
  const candidate = assertObject(value, `Invalid ${label}.`);
  const amplitudeLevels = assertNumberInRange(
    assertFiniteNumber(candidate["amplitudeLevels"], `Missing ${label} amplitude.`),
    0,
    0.5,
    `${label} amplitude`,
  );
  const wavelengthTiles = assertNumberInRange(
    assertFiniteNumber(candidate["wavelengthTiles"], `Missing ${label} wavelength.`),
    0.5,
    40,
    `${label} wavelength`,
  );
  const speed = assertNumberInRange(
    assertFiniteNumber(candidate["speed"], `Missing ${label} speed.`),
    0,
    2,
    `${label} speed`,
  );
  const directionDeg = assertNumberInRange(
    assertFiniteNumber(candidate["directionDeg"], `Missing ${label} direction.`),
    -180,
    180,
    `${label} direction`,
  );

  return {
    amplitudeLevels,
    wavelengthTiles,
    speed,
    directionDeg,
  };
}

function parseQualitySettings(value: unknown): ThreeSeaQualitySettings {
  const candidate = assertObject(value, "Invalid Three sea quality settings.");
  const waveOctaves = assertFiniteNumber(candidate["waveOctaves"], "Missing Three sea wave octaves.");
  const voronoiOctaves = assertFiniteNumber(candidate["voronoiOctaves"], "Missing Three sea Voronoi octaves.");

  if (waveOctaves !== 2 && waveOctaves !== 3) {
    throw new Error(`Three sea wave octaves must be 2 or 3, received ${waveOctaves}.`);
  }
  if (voronoiOctaves !== 1 && voronoiOctaves !== 2) {
    throw new Error(`Three sea Voronoi octaves must be 1 or 2, received ${voronoiOctaves}.`);
  }

  return { waveOctaves, voronoiOctaves };
}

export function parseThreeSeaSettings(value: unknown): ThreeSeaSettings {
  const candidate = assertObject(value, "Invalid Three sea settings.");
  const mode = assertSeaMode(candidate["mode"]);
  const waterLevelLevels = assertNumberInRange(
    assertFiniteNumber(candidate["waterLevelLevels"], "Missing Three sea water level."),
    -2,
    8,
    "Three sea water level",
  );
  const foamWidthLevels = assertNumberInRange(
    assertFiniteNumber(candidate["foamWidthLevels"], "Missing Three sea foam width."),
    0.05,
    1.5,
    "Three sea foam width",
  );
  const surfaceOpacity = assertNumberInRange(
    assertFiniteNumber(candidate["surfaceOpacity"], "Missing Three sea surface opacity."),
    0,
    1,
    "Three sea surface opacity",
  );
  const absorptionDepthLevels = assertNumberInRange(
    assertFiniteNumber(candidate["absorptionDepthLevels"], "Missing Three sea absorption depth."),
    0.1,
    4,
    "Three sea absorption depth",
  );
  const bottomVisibility = assertNumberInRange(
    assertFiniteNumber(candidate["bottomVisibility"], "Missing Three sea bottom visibility."),
    0,
    1,
    "Three sea bottom visibility",
  );
  const refractionStrengthPx = assertNumberInRange(
    assertFiniteNumber(candidate["refractionStrengthPx"], "Missing Three sea refraction strength."),
    0,
    12,
    "Three sea refraction strength",
  );
  const fresnelPower = assertNumberInRange(
    assertFiniteNumber(candidate["fresnelPower"], "Missing Three sea fresnel power."),
    0.5,
    8,
    "Three sea fresnel power",
  );
  const fresnelStrength = assertNumberInRange(
    assertFiniteNumber(candidate["fresnelStrength"], "Missing Three sea fresnel strength."),
    0,
    1,
    "Three sea fresnel strength",
  );
  const specularStrength = assertNumberInRange(
    assertFiniteNumber(candidate["specularStrength"], "Missing Three sea specular strength."),
    0,
    2,
    "Three sea specular strength",
  );
  const glintTightness = assertNumberInRange(
    assertFiniteNumber(candidate["glintTightness"], "Missing Three sea glint tightness."),
    1,
    128,
    "Three sea glint tightness",
  );
  const shallowColor = assertColorHex(candidate["shallowColor"], "Three sea shallow color");
  const deepColor = assertColorHex(candidate["deepColor"], "Three sea deep color");
  const foamColor = assertColorHex(candidate["foamColor"], "Three sea foam color");
  const causticsColor = assertColorHex(candidate["causticsColor"], "Three sea caustics color");
  const skyReflectionColor = assertColorHex(candidate["skyReflectionColor"], "Three sea sky reflection color");
  const ripple = assertObject(candidate["ripple"], "Invalid Three sea ripple settings.");
  const foam = assertObject(candidate["foam"], "Invalid Three sea foam settings.");
  const caustics = assertObject(candidate["caustics"], "Invalid Three sea caustics settings.");

  return {
    mode,
    waterLevelLevels,
    foamWidthLevels,
    surfaceOpacity,
    absorptionDepthLevels,
    bottomVisibility,
    refractionStrengthPx,
    fresnelPower,
    fresnelStrength,
    specularStrength,
    glintTightness,
    shallowColor,
    deepColor,
    foamColor,
    causticsColor,
    skyReflectionColor,
    swellA: parseWaveBandSettings(candidate["swellA"], "Three sea swell A"),
    swellB: parseWaveBandSettings(candidate["swellB"], "Three sea swell B"),
    chop: parseWaveBandSettings(candidate["chop"], "Three sea chop"),
    ripple: {
      normalStrength: assertNumberInRange(
        assertFiniteNumber(ripple["normalStrength"], "Missing Three sea ripple normal strength."),
        0,
        1,
        "Three sea ripple normal strength",
      ),
      scale: assertNumberInRange(
        assertFiniteNumber(ripple["scale"], "Missing Three sea ripple scale."),
        0.5,
        20,
        "Three sea ripple scale",
      ),
      speed: assertNumberInRange(
        assertFiniteNumber(ripple["speed"], "Missing Three sea ripple speed."),
        0,
        2,
        "Three sea ripple speed",
      ),
    },
    foam: {
      shoreStrength: assertNumberInRange(
        assertFiniteNumber(foam["shoreStrength"], "Missing Three sea foam shore strength."),
        0,
        2,
        "Three sea foam shore strength",
      ),
      crestStrength: assertNumberInRange(
        assertFiniteNumber(foam["crestStrength"], "Missing Three sea foam crest strength."),
        0,
        2,
        "Three sea foam crest strength",
      ),
      softness: assertNumberInRange(
        assertFiniteNumber(foam["softness"], "Missing Three sea foam softness."),
        0.05,
        1,
        "Three sea foam softness",
      ),
      voronoiScale: assertNumberInRange(
        assertFiniteNumber(foam["voronoiScale"], "Missing Three sea foam Voronoi scale."),
        0.5,
        10,
        "Three sea foam Voronoi scale",
      ),
      voronoiJitter: assertNumberInRange(
        assertFiniteNumber(foam["voronoiJitter"], "Missing Three sea foam Voronoi jitter."),
        0,
        1,
        "Three sea foam Voronoi jitter",
      ),
      flowSpeed: assertNumberInRange(
        assertFiniteNumber(foam["flowSpeed"], "Missing Three sea foam flow speed."),
        0,
        2,
        "Three sea foam flow speed",
      ),
      warpStrength: assertNumberInRange(
        assertFiniteNumber(foam["warpStrength"], "Missing Three sea foam warp strength."),
        0,
        2,
        "Three sea foam warp strength",
      ),
    },
    caustics: {
      strength: assertNumberInRange(
        assertFiniteNumber(caustics["strength"], "Missing Three sea caustics strength."),
        0,
        2,
        "Three sea caustics strength",
      ),
      scale: assertNumberInRange(
        assertFiniteNumber(caustics["scale"], "Missing Three sea caustics scale."),
        0.5,
        12,
        "Three sea caustics scale",
      ),
      speed: assertNumberInRange(
        assertFiniteNumber(caustics["speed"], "Missing Three sea caustics speed."),
        0,
        2,
        "Three sea caustics speed",
      ),
      depthFadeLevels: assertNumberInRange(
        assertFiniteNumber(caustics["depthFadeLevels"], "Missing Three sea caustics depth fade."),
        0.1,
        4,
        "Three sea caustics depth fade",
      ),
    },
    quality: parseQualitySettings(candidate["quality"]),
  };
}

function parseStoredThreeSeaNumber(value: string, label: string): number {
  if (value.length === 0) throw new Error(`Missing stored Three sea ${label}.`);
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) throw new Error(`Invalid stored Three sea ${label} "${value}".`);
  return numericValue;
}

function parseStoredThreeSeaMode(value: string): ThreeSeaMode {
  return assertSeaMode(value);
}

function parseStoredThreeSeaSettings(storedValue: string): ThreeSeaSettings {
  const parts = storedValue.split("|");
  if (parts.length !== 44) throw new Error(`Invalid stored Three sea settings "${storedValue}".`);
  const [
    modePart,
    waterLevelLevelsPart,
    foamWidthLevelsPart,
    surfaceOpacityPart,
    absorptionDepthLevelsPart,
    bottomVisibilityPart,
    refractionStrengthPxPart,
    fresnelPowerPart,
    fresnelStrengthPart,
    specularStrengthPart,
    glintTightnessPart,
    shallowColorPart,
    deepColorPart,
    foamColorPart,
    causticsColorPart,
    skyReflectionColorPart,
    swellAAmplitudePart,
    swellAWavelengthPart,
    swellASpeedPart,
    swellADirectionPart,
    swellBAmplitudePart,
    swellBWavelengthPart,
    swellBSpeedPart,
    swellBDirectionPart,
    chopAmplitudePart,
    chopWavelengthPart,
    chopSpeedPart,
    chopDirectionPart,
    rippleNormalStrengthPart,
    rippleScalePart,
    rippleSpeedPart,
    foamShoreStrengthPart,
    foamCrestStrengthPart,
    foamSoftnessPart,
    foamVoronoiScalePart,
    foamVoronoiJitterPart,
    foamFlowSpeedPart,
    foamWarpStrengthPart,
    causticsStrengthPart,
    causticsScalePart,
    causticsSpeedPart,
    causticsDepthFadeLevelsPart,
    qualityWaveOctavesPart,
    qualityVoronoiOctavesPart,
  ] = parts;

  if (modePart === undefined) throw new Error("Missing stored Three sea mode.");
  if (qualityVoronoiOctavesPart === undefined) throw new Error("Missing stored Three sea Voronoi octaves.");

  return parseThreeSeaSettings({
    mode: parseStoredThreeSeaMode(modePart),
    waterLevelLevels: parseStoredThreeSeaNumber(waterLevelLevelsPart, "water level"),
    foamWidthLevels: parseStoredThreeSeaNumber(foamWidthLevelsPart, "foam width"),
    surfaceOpacity: parseStoredThreeSeaNumber(surfaceOpacityPart, "surface opacity"),
    absorptionDepthLevels: parseStoredThreeSeaNumber(absorptionDepthLevelsPart, "absorption depth"),
    bottomVisibility: parseStoredThreeSeaNumber(bottomVisibilityPart, "bottom visibility"),
    refractionStrengthPx: parseStoredThreeSeaNumber(refractionStrengthPxPart, "refraction strength"),
    fresnelPower: parseStoredThreeSeaNumber(fresnelPowerPart, "fresnel power"),
    fresnelStrength: parseStoredThreeSeaNumber(fresnelStrengthPart, "fresnel strength"),
    specularStrength: parseStoredThreeSeaNumber(specularStrengthPart, "specular strength"),
    glintTightness: parseStoredThreeSeaNumber(glintTightnessPart, "glint tightness"),
    shallowColor: parseStoredThreeSeaNumber(shallowColorPart, "shallow color"),
    deepColor: parseStoredThreeSeaNumber(deepColorPart, "deep color"),
    foamColor: parseStoredThreeSeaNumber(foamColorPart, "foam color"),
    causticsColor: parseStoredThreeSeaNumber(causticsColorPart, "caustics color"),
    skyReflectionColor: parseStoredThreeSeaNumber(skyReflectionColorPart, "sky reflection color"),
    swellA: {
      amplitudeLevels: parseStoredThreeSeaNumber(swellAAmplitudePart, "swell A amplitude"),
      wavelengthTiles: parseStoredThreeSeaNumber(swellAWavelengthPart, "swell A wavelength"),
      speed: parseStoredThreeSeaNumber(swellASpeedPart, "swell A speed"),
      directionDeg: parseStoredThreeSeaNumber(swellADirectionPart, "swell A direction"),
    },
    swellB: {
      amplitudeLevels: parseStoredThreeSeaNumber(swellBAmplitudePart, "swell B amplitude"),
      wavelengthTiles: parseStoredThreeSeaNumber(swellBWavelengthPart, "swell B wavelength"),
      speed: parseStoredThreeSeaNumber(swellBSpeedPart, "swell B speed"),
      directionDeg: parseStoredThreeSeaNumber(swellBDirectionPart, "swell B direction"),
    },
    chop: {
      amplitudeLevels: parseStoredThreeSeaNumber(chopAmplitudePart, "chop amplitude"),
      wavelengthTiles: parseStoredThreeSeaNumber(chopWavelengthPart, "chop wavelength"),
      speed: parseStoredThreeSeaNumber(chopSpeedPart, "chop speed"),
      directionDeg: parseStoredThreeSeaNumber(chopDirectionPart, "chop direction"),
    },
    ripple: {
      normalStrength: parseStoredThreeSeaNumber(rippleNormalStrengthPart, "ripple normal strength"),
      scale: parseStoredThreeSeaNumber(rippleScalePart, "ripple scale"),
      speed: parseStoredThreeSeaNumber(rippleSpeedPart, "ripple speed"),
    },
    foam: {
      shoreStrength: parseStoredThreeSeaNumber(foamShoreStrengthPart, "foam shore strength"),
      crestStrength: parseStoredThreeSeaNumber(foamCrestStrengthPart, "foam crest strength"),
      softness: parseStoredThreeSeaNumber(foamSoftnessPart, "foam softness"),
      voronoiScale: parseStoredThreeSeaNumber(foamVoronoiScalePart, "foam Voronoi scale"),
      voronoiJitter: parseStoredThreeSeaNumber(foamVoronoiJitterPart, "foam Voronoi jitter"),
      flowSpeed: parseStoredThreeSeaNumber(foamFlowSpeedPart, "foam flow speed"),
      warpStrength: parseStoredThreeSeaNumber(foamWarpStrengthPart, "foam warp strength"),
    },
    caustics: {
      strength: parseStoredThreeSeaNumber(causticsStrengthPart, "caustics strength"),
      scale: parseStoredThreeSeaNumber(causticsScalePart, "caustics scale"),
      speed: parseStoredThreeSeaNumber(causticsSpeedPart, "caustics speed"),
      depthFadeLevels: parseStoredThreeSeaNumber(causticsDepthFadeLevelsPart, "caustics depth fade"),
    },
    quality: {
      waveOctaves: parseStoredThreeSeaNumber(qualityWaveOctavesPart, "wave octaves"),
      voronoiOctaves: parseStoredThreeSeaNumber(qualityVoronoiOctavesPart, "Voronoi octaves"),
    },
  });
}

const threeSeaStorageCodec: StorageCodec<ThreeSeaSettings> = {
  parse: (storedValue) => parseStoredThreeSeaSettings(storedValue),
  serialize: (value) =>
    [
      value.mode,
      value.waterLevelLevels,
      value.foamWidthLevels,
      value.surfaceOpacity,
      value.absorptionDepthLevels,
      value.bottomVisibility,
      value.refractionStrengthPx,
      value.fresnelPower,
      value.fresnelStrength,
      value.specularStrength,
      value.glintTightness,
      value.shallowColor,
      value.deepColor,
      value.foamColor,
      value.causticsColor,
      value.skyReflectionColor,
      value.swellA.amplitudeLevels,
      value.swellA.wavelengthTiles,
      value.swellA.speed,
      value.swellA.directionDeg,
      value.swellB.amplitudeLevels,
      value.swellB.wavelengthTiles,
      value.swellB.speed,
      value.swellB.directionDeg,
      value.chop.amplitudeLevels,
      value.chop.wavelengthTiles,
      value.chop.speed,
      value.chop.directionDeg,
      value.ripple.normalStrength,
      value.ripple.scale,
      value.ripple.speed,
      value.foam.shoreStrength,
      value.foam.crestStrength,
      value.foam.softness,
      value.foam.voronoiScale,
      value.foam.voronoiJitter,
      value.foam.flowSpeed,
      value.foam.warpStrength,
      value.caustics.strength,
      value.caustics.scale,
      value.caustics.speed,
      value.caustics.depthFadeLevels,
      value.quality.waveOctaves,
      value.quality.voronoiOctaves,
    ]
      .map((part) => part.toString())
      .join("|"),
};

const store = localStore(STORAGE_KEY, DEFAULT_THREE_SEA_SETTINGS, threeSeaStorageCodec);

function readStoredThreeSeaSettings(): ThreeSeaSettings {
  try {
    return parseThreeSeaSettings(store.get());
  } catch {
    globalThis.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_THREE_SEA_SETTINGS;
  }
}

function resolveSetStateAction(action: SetStateAction, previousState: ThreeSeaSettings): ThreeSeaSettings {
  if (typeof action === "function") return action(previousState);
  return action;
}

let currentState = readStoredThreeSeaSettings();

function get(): ThreeSeaSettings {
  return currentState;
}

function set(action: SetStateAction) {
  const nextState = parseThreeSeaSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.set(nextState);
}

function setDebounced(action: SetStateAction) {
  const nextState = parseThreeSeaSettings(resolveSetStateAction(action, currentState));
  currentState = nextState;
  store.setDebounced(nextState);
}

export default {
  subscribe: (callback: (value: ThreeSeaSettings) => void) =>
    store.subscribe(() => {
      callback(currentState);
    }),
  get,
  set,
  setDebounced,
  reset: () => set(DEFAULT_THREE_SEA_SETTINGS),
};
