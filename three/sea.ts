import type { Vector3 } from "../src/game/lib/vector.ts";
import { getWorldHeightFromLevel, rotateTerrainNormalToWorld } from "./surface.ts";
import type { ThreeSeaDebugView, ThreeSeaSettings } from "./app.ts";

type SeaPoint = {
  x: number;
  y: number;
};

type SeaWaveBandSettings = ThreeSeaSettings["swellA"];

type SeaWaveSample = {
  worldHeightOffset: number;
  dHeightDx: number;
  dHeightDy: number;
  crest: number;
};

export const DEFAULT_THREE_SEA_DEBUG_VIEW: ThreeSeaDebugView = "final";
export const DEFAULT_THREE_SEA_SETTINGS: ThreeSeaSettings = {
  mode: "sea",
  waterLevelLevels: 1.8,
  foamWidthLevels: 0.35,
  surfaceOpacity: 0.22,
  absorptionDepthLevels: 1.6,
  bottomVisibility: 0.92,
  refractionStrengthPx: 3.0,
  fresnelPower: 4.5,
  fresnelStrength: 0.45,
  specularStrength: 0.35,
  glintTightness: 48,
  shallowColor: 0x4ccfd3,
  deepColor: 0x0d5b80,
  foamColor: 0xf2fff8,
  causticsColor: 0xb6fff1,
  skyReflectionColor: 0x9bd7ff,
  swellA: { amplitudeLevels: 0.1, wavelengthTiles: 18, speed: 0.18, directionDeg: 18 },
  swellB: { amplitudeLevels: 0.06, wavelengthTiles: 11, speed: 0.24, directionDeg: -42 },
  chop: { amplitudeLevels: 0.025, wavelengthTiles: 4.5, speed: 0.65, directionDeg: 65 },
  ripple: { normalStrength: 0.18, scale: 9, speed: 0.9 },
  foam: {
    shoreStrength: 1.0,
    crestStrength: 0.45,
    softness: 0.18,
    voronoiScale: 3.5,
    voronoiJitter: 0.85,
    flowSpeed: 0.22,
    warpStrength: 0.35,
  },
  caustics: {
    strength: 0.28,
    scale: 5.5,
    speed: 0.3,
    depthFadeLevels: 1.25,
  },
  quality: { waveOctaves: 3, voronoiOctaves: 2 },
};

const TWO_PI = Math.PI * 2;
const DEGREES_TO_RADIANS = Math.PI / 180;
const SURFACE_WORLD_HEIGHT_SCALE = getWorldHeightFromLevel(1);

function normalizeVector3(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) throw new Error("Sea normal must not be degenerate.");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function clampUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denominator = edge1 - edge0;
  if (denominator === 0) {
    return x < edge0 ? 0 : 1;
  }
  const t = clampUnit((x - edge0) / denominator);
  return t * t * (3 - 2 * t);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash2(point: SeaPoint): SeaPoint {
  return {
    x: fract(Math.sin(point.x * 127.1 + point.y * 311.7) * 43_758.5453123),
    y: fract(Math.sin(point.x * 269.5 + point.y * 183.3) * 43_758.5453123),
  };
}

function evaluateVoronoiPair(point: SeaPoint, jitter: number): { f1: number; f2: number } {
  const cellX = Math.floor(point.x);
  const cellY = Math.floor(point.y);
  const localX = fract(point.x);
  const localY = fract(point.y);
  let first = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const jitterPoint = hash2({ x: cellX + offsetX, y: cellY + offsetY });
      const featureX = offsetX + (0.5 + (jitterPoint.x - 0.5) * jitter);
      const featureY = offsetY + (0.5 + (jitterPoint.y - 0.5) * jitter);
      const deltaX = featureX - localX;
      const deltaY = featureY - localY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < first) {
        second = first;
        first = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }

  return { f1: first, f2: second };
}

export function evaluateVoronoiEdgeField(
  point: SeaPoint,
  scale: number,
  jitter: number,
  flowSpeed: number,
  warpStrength: number,
  timeSeconds: number,
  octaves: ThreeSeaSettings["quality"]["voronoiOctaves"],
): number {
  const flowPoint = {
    x: point.x * scale + timeSeconds * flowSpeed,
    y: point.y * scale - timeSeconds * flowSpeed * 0.7,
  };
  const warpedPoint = {
    x: flowPoint.x + Math.sin(flowPoint.y * 0.9 + timeSeconds * 0.47) * warpStrength,
    y: flowPoint.y + Math.cos(flowPoint.x * 0.8 - timeSeconds * 0.33) * warpStrength,
  };
  const primary = evaluateVoronoiPair(warpedPoint, jitter);
  const primaryEdge = 1 - smoothstep(0.03, 0.12, primary.f2 - primary.f1);

  if (octaves === 1) {
    return clampUnit(primaryEdge);
  }

  const secondaryPoint = {
    x: warpedPoint.x * 2.1 + 13.7,
    y: warpedPoint.y * 2.1 - 8.3,
  };
  const secondary = evaluateVoronoiPair(secondaryPoint, jitter);
  const secondaryEdge = 1 - smoothstep(0.02, 0.08, secondary.f2 - secondary.f1);

  return clampUnit(primaryEdge * 0.7 + secondaryEdge * 0.3);
}

function evaluateWaveBandSample(
  wave: SeaWaveBandSettings,
  tileCoord: SeaPoint,
  timeSeconds: number,
): SeaWaveSample {
  const amplitudeWorld = getWorldHeightFromLevel(wave.amplitudeLevels);
  const wavelength = Math.max(wave.wavelengthTiles, 0.001);
  const directionRadians = wave.directionDeg * DEGREES_TO_RADIANS;
  const directionX = Math.cos(directionRadians);
  const directionY = Math.sin(directionRadians);
  const waveNumber = TWO_PI / wavelength;
  const phase = waveNumber * (tileCoord.x * directionX + tileCoord.y * directionY - wave.speed * timeSeconds);
  const cosine = Math.cos(phase);
  const gradientScale = amplitudeWorld * waveNumber * cosine;

  return {
    worldHeightOffset: amplitudeWorld * Math.sin(phase),
    dHeightDx: gradientScale * directionX,
    dHeightDy: gradientScale * directionY,
    crest: clampUnit(0.5 + 0.5 * Math.sin(phase)),
  };
}

function evaluateRippleGradient(settings: ThreeSeaSettings, tileCoord: SeaPoint, timeSeconds: number): SeaPoint {
  const basePhaseX = tileCoord.x * settings.ripple.scale + timeSeconds * settings.ripple.speed;
  const basePhaseY = tileCoord.y * settings.ripple.scale * 0.87 - timeSeconds * settings.ripple.speed * 1.13;
  const strength = settings.ripple.normalStrength * 0.35;

  return {
    x: (Math.cos(basePhaseX + tileCoord.y * 0.63) + Math.cos(basePhaseY * 1.27)) * strength,
    y: (Math.sin(basePhaseY - tileCoord.x * 0.49) - Math.sin(basePhaseX * 1.11)) * strength,
  };
}

export function evaluateSeaSurfaceSample(
  settings: ThreeSeaSettings,
  tileCoord: SeaPoint,
  timeSeconds: number,
): { worldHeight: number; worldNormal: Vector3; crest: number } {
  const baseWorldHeight = getWorldHeightFromLevel(settings.waterLevelLevels);
  const waveA = evaluateWaveBandSample(settings.swellA, tileCoord, timeSeconds);
  const waveB = evaluateWaveBandSample(settings.swellB, tileCoord, timeSeconds);
  const chop =
    settings.quality.waveOctaves === 3
      ? evaluateWaveBandSample(settings.chop, tileCoord, timeSeconds)
      : { worldHeightOffset: 0, dHeightDx: 0, dHeightDy: 0, crest: 0 };
  const rippleGradient = evaluateRippleGradient(settings, tileCoord, timeSeconds);
  const dHeightDx = waveA.dHeightDx + waveB.dHeightDx + chop.dHeightDx + rippleGradient.x;
  const dHeightDy = waveA.dHeightDy + waveB.dHeightDy + chop.dHeightDy + rippleGradient.y;

  return {
    worldHeight: baseWorldHeight + waveA.worldHeightOffset + waveB.worldHeightOffset + chop.worldHeightOffset,
    worldNormal: rotateTerrainNormalToWorld(normalizeVector3([-dHeightDx, dHeightDy, 1])),
    crest: clampUnit(waveA.crest * 0.45 + waveB.crest * 0.35 + chop.crest * 0.2),
  };
}

export function evaluateUnderwaterTransmittance(
  waterDepthLevels: number,
  absorptionDepthLevels: number,
  bottomVisibility: number,
): number {
  const effectiveDepth = Math.max(waterDepthLevels, 0);
  const safeAbsorptionDepth = Math.max(absorptionDepthLevels, 0.001);
  return clampUnit(Math.exp(-effectiveDepth / safeAbsorptionDepth) * bottomVisibility);
}

export function createSeaShaderChunk(): string {
  return /* wgsl */ `
    const SURFACE_WORLD_HEIGHT_SCALE = ${SURFACE_WORLD_HEIGHT_SCALE.toFixed(8)};
    const SEA_PI = 3.14159265;
    const SEA_TWO_PI = 6.28318531;
    const SEA_DEGREES_TO_RADIANS = 0.01745329;

    fn seaClampUnit(value: f32) -> f32 {
      return clamp(value, 0.0, 1.0);
    }

    fn seaSafeNormalize(vector: vec3<f32>) -> vec3<f32> {
      let lengthSquared = max(dot(vector, vector), 0.000001);
      return vector * inverseSqrt(lengthSquared);
    }

    fn rotateTerrainNormalToWorld(terrainNormal: vec3<f32>) -> vec3<f32> {
      return seaSafeNormalize(
        vec3<f32>(
          0.70710678 * terrainNormal.x + 0.70710678 * terrainNormal.y,
          -0.70710678 * terrainNormal.x + 0.70710678 * terrainNormal.y,
          terrainNormal.z,
        ),
      );
    }

    fn seaDirectionFromRadians(angleRadians: f32) -> vec2<f32> {
      return vec2<f32>(cos(angleRadians), sin(angleRadians));
    }

    fn seaWaveHeightAndGradient(wave: vec4<f32>, tileCoord: vec2<f32>, timeSeconds: f32) -> vec4<f32> {
      let amplitudeWorld = wave.x * SURFACE_WORLD_HEIGHT_SCALE;
      let wavelength = max(wave.y, 0.001);
      let direction = seaDirectionFromRadians(wave.w);
      let waveNumber = SEA_TWO_PI / wavelength;
      let phase = waveNumber * (dot(direction, tileCoord) - wave.z * timeSeconds);
      let sineValue = sin(phase);
      let cosineValue = cos(phase);
      let gradientScale = amplitudeWorld * waveNumber * cosineValue;
      return vec4<f32>(
        amplitudeWorld * sineValue,
        gradientScale * direction.x,
        gradientScale * direction.y,
        seaClampUnit(0.5 + 0.5 * sineValue),
      );
    }

    fn seaRippleGradient(ripple: vec4<f32>, tileCoord: vec2<f32>, timeSeconds: f32) -> vec2<f32> {
      let basePhaseX = tileCoord.x * ripple.y + timeSeconds * ripple.z;
      let basePhaseY = tileCoord.y * ripple.y * 0.87 - timeSeconds * ripple.z * 1.13;
      let strength = ripple.x * 0.35;

      return vec2<f32>(
        (cos(basePhaseX + tileCoord.y * 0.63) + cos(basePhaseY * 1.27)) * strength,
        (sin(basePhaseY - tileCoord.x * 0.49) - sin(basePhaseX * 1.11)) * strength,
      );
    }

    fn seaEvaluateSurface(
      seaLevelFoam: vec2<f32>,
      waveA: vec4<f32>,
      waveB: vec4<f32>,
      chop: vec4<f32>,
      ripple: vec4<f32>,
      quality: vec2<f32>,
      tileCoord: vec2<f32>,
      timeSeconds: f32,
    ) -> vec4<f32> {
      let waveSampleA = seaWaveHeightAndGradient(waveA, tileCoord, timeSeconds);
      let waveSampleB = seaWaveHeightAndGradient(waveB, tileCoord, timeSeconds);
      var chopSample = vec4<f32>(0.0, 0.0, 0.0, 0.0);

      if (quality.x >= 2.5) {
        chopSample = seaWaveHeightAndGradient(chop, tileCoord, timeSeconds);
      }

      let rippleGradient = seaRippleGradient(ripple, tileCoord, timeSeconds);
      let dHeightDx = waveSampleA.y + waveSampleB.y + chopSample.y + rippleGradient.x;
      let dHeightDy = waveSampleA.z + waveSampleB.z + chopSample.z + rippleGradient.y;

      return vec4<f32>(
        seaLevelFoam.x * SURFACE_WORLD_HEIGHT_SCALE + waveSampleA.x + waveSampleB.x + chopSample.x,
        dHeightDx,
        dHeightDy,
        seaClampUnit(waveSampleA.w * 0.45 + waveSampleB.w * 0.35 + chopSample.w * 0.2),
      );
    }

    fn seaHash2(point: vec2<f32>) -> vec2<f32> {
      return fract(
        sin(
          vec2<f32>(
            dot(point, vec2<f32>(127.1, 311.7)),
            dot(point, vec2<f32>(269.5, 183.3)),
          ),
        ) * 43758.5453123,
      );
    }

    fn seaVoronoiPair(point: vec2<f32>, jitter: f32) -> vec2<f32> {
      let cell = floor(point);
      let local = fract(point);
      var first = 1000.0;
      var second = 1000.0;

      for (var offsetY = -1; offsetY <= 1; offsetY++) {
        for (var offsetX = -1; offsetX <= 1; offsetX++) {
          let offset = vec2<f32>(f32(offsetX), f32(offsetY));
          let jitterPoint = seaHash2(cell + offset);
          let featurePoint = offset + vec2<f32>(0.5, 0.5) + (jitterPoint - vec2<f32>(0.5, 0.5)) * jitter;
          let distanceValue = distance(local, featurePoint);

          if (distanceValue < first) {
            second = first;
            first = distanceValue;
          } else if (distanceValue < second) {
            second = distanceValue;
          }
        }
      }

      return vec2<f32>(first, second);
    }

    fn seaAnimatedVoronoiEdge(
      tileCoord: vec2<f32>,
      scale: f32,
      jitter: f32,
      flowSpeed: f32,
      warpStrength: f32,
      timeSeconds: f32,
      octaves: f32,
    ) -> f32 {
      let flowPoint = vec2<f32>(
        tileCoord.x * scale + timeSeconds * flowSpeed,
        tileCoord.y * scale - timeSeconds * flowSpeed * 0.7,
      );
      let warpedPoint = vec2<f32>(
        flowPoint.x + sin(flowPoint.y * 0.9 + timeSeconds * 0.47) * warpStrength,
        flowPoint.y + cos(flowPoint.x * 0.8 - timeSeconds * 0.33) * warpStrength,
      );
      let primaryPair = seaVoronoiPair(warpedPoint, jitter);
      let primaryEdge = 1.0 - smoothstep(0.03, 0.12, primaryPair.y - primaryPair.x);

      if (octaves < 1.5) {
        return seaClampUnit(primaryEdge);
      }

      let secondaryPair = seaVoronoiPair(warpedPoint * 2.1 + vec2<f32>(13.7, -8.3), jitter);
      let secondaryEdge = 1.0 - smoothstep(0.02, 0.08, secondaryPair.y - secondaryPair.x);
      return seaClampUnit(primaryEdge * 0.7 + secondaryEdge * 0.3);
    }

    fn seaUnderwaterTransmittance(waterDepthLevels: f32, absorptionDepthLevels: f32, bottomVisibility: f32) -> f32 {
      let safeDepth = max(waterDepthLevels, 0.0);
      let safeAbsorption = max(absorptionDepthLevels, 0.001);
      return seaClampUnit(exp(-safeDepth / safeAbsorption) * bottomVisibility);
    }
  `;
}
