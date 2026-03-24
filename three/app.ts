import * as THREE from "three/src/Three.WebGPU.js";
import fpsBus from "../src/store/fps.ts";
import { loadTerrainAssetBundle, type TerrainAssetBundle, type TerrainMap } from "./assets.ts";
import {
  BASE_HEIGHT_LEVEL_SHIFT,
  BIOME_INDEX_MASK,
  BIOME_INDEX_SHIFT,
  SHAPE_REF_MASK,
  type ResolveHit,
} from "./codec.ts";
import {
  clampCameraCenter,
  createInitialCameraState,
  getContinuousZoom,
  getDiscreteZoom,
  resizeCameraState,
  screenPointToWorld,
  type CameraState,
  type Viewport,
} from "./projection.ts";
import {
  createSurfaceShaderTables,
  getSurfaceHeightImpactOnScreenY,
  getWorldHeightFromLevel,
  SURFACE_NORMAL_FILTER_RADIUS_TILES,
} from "./surface.ts";
import { DEFAULT_THREE_SEA_DEBUG_VIEW, DEFAULT_THREE_SEA_SETTINGS, createSeaShaderChunk } from "./sea.ts";

export type ThreeLightingSettings = {
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  ambient: number;
  aliasingRadiusTiles: number;
};

export type ThreeDebugView = "beauty" | "checker";

export type ThreeSeaMode = "off" | "sea";

export type ThreeSeaDebugView =
  | "final"
  | "water-depth"
  | "water-normal"
  | "foam"
  | "caustics"
  | "underwater-transmittance";

export type ThreeSeaWaveBandSettings = {
  amplitudeLevels: number;
  wavelengthTiles: number;
  speed: number;
  directionDeg: number;
};

export type ThreeSeaRippleSettings = {
  normalStrength: number;
  scale: number;
  speed: number;
};

export type ThreeSeaFoamSettings = {
  shoreStrength: number;
  crestStrength: number;
  softness: number;
  voronoiScale: number;
  voronoiJitter: number;
  flowSpeed: number;
  warpStrength: number;
};

export type ThreeSeaCausticsSettings = {
  strength: number;
  scale: number;
  speed: number;
  depthFadeLevels: number;
};

export type ThreeSeaQualitySettings = {
  waveOctaves: 2 | 3;
  voronoiOctaves: 1 | 2;
};

export type ThreeSeaSettings = {
  mode: ThreeSeaMode;
  waterLevelLevels: number;
  foamWidthLevels: number;
  surfaceOpacity: number;
  absorptionDepthLevels: number;
  bottomVisibility: number;
  refractionStrengthPx: number;
  fresnelPower: number;
  fresnelStrength: number;
  specularStrength: number;
  glintTightness: number;
  shallowColor: number;
  deepColor: number;
  foamColor: number;
  causticsColor: number;
  skyReflectionColor: number;
  swellA: ThreeSeaWaveBandSettings;
  swellB: ThreeSeaWaveBandSettings;
  chop: ThreeSeaWaveBandSettings;
  ripple: ThreeSeaRippleSettings;
  foam: ThreeSeaFoamSettings;
  caustics: ThreeSeaCausticsSettings;
  quality: ThreeSeaQualitySettings;
};

export type ThreeTerrainApp = {
  destroy: () => void;
  resize: (width: number, height: number) => void;
  setPaused: (paused: boolean) => void;
  setLighting: (settings: ThreeLightingSettings) => void;
  setSea: (settings: ThreeSeaSettings) => void;
  setDebugView: (view: ThreeDebugView) => void;
  setSeaDebugView: (view: ThreeSeaDebugView) => void;
};

const CAMERA_Z = 1000;
const PICK_DRAG_THRESHOLD_PX = 4;
const SURFACE_GROUND_SEARCH_ITERATIONS = 16;
const {
  Var,
  clamp,
  cos,
  float,
  mrt,
  sin,
  texture,
  textureLoad,
  uniform,
  vec2,
  viewportUV,
  wgsl,
  wgslFn,
} = THREE.TSL;
const DEFAULT_SUN_DIRECTION = new THREE.Vector3(0.4, -1, 0.7).normalize();
const DEFAULT_SUN_AZIMUTH_DEG = (Math.atan2(DEFAULT_SUN_DIRECTION.y, DEFAULT_SUN_DIRECTION.x) * 180) / Math.PI;
const DEFAULT_SUN_ELEVATION_DEG =
  (Math.atan2(DEFAULT_SUN_DIRECTION.z, Math.hypot(DEFAULT_SUN_DIRECTION.x, DEFAULT_SUN_DIRECTION.y)) * 180) / Math.PI;
export const MIN_THREE_ALIASING_RADIUS_TILES = 0;
export const MAX_THREE_ALIASING_RADIUS_TILES = 0.25;

export const DEFAULT_THREE_DEBUG_VIEW: ThreeDebugView = "beauty";
export const DEFAULT_THREE_LIGHTING_SETTINGS: ThreeLightingSettings = {
  sunAzimuthDeg: DEFAULT_SUN_AZIMUTH_DEG,
  sunElevationDeg: DEFAULT_SUN_ELEVATION_DEG,
  ambient: 0.6,
  aliasingRadiusTiles: SURFACE_NORMAL_FILTER_RADIUS_TILES,
};

export function getSunDirectionVector(settings: ThreeLightingSettings): THREE.Vector3 {
  const azimuthRad = (settings.sunAzimuthDeg * Math.PI) / 180;
  const elevationRad = (settings.sunElevationDeg * Math.PI) / 180;
  const cosElevation = Math.cos(elevationRad);
  const sunDirection = new THREE.Vector3(
    Math.cos(azimuthRad) * cosElevation,
    Math.sin(azimuthRad) * cosElevation,
    Math.sin(elevationRad),
  );
  if (sunDirection.lengthSq() === 0) throw new Error("Three lighting sun direction must not be zero.");
  return sunDirection.normalize();
}

export function getSurfaceSampleOffsetY(map: TerrainMap, tilesetTileHeight: number): number {
  const offsetY = tilesetTileHeight - map.tileheight;

  if (offsetY < 0) {
    throw new Error(
      `Terrain tileset tile height ${tilesetTileHeight} must not be smaller than map tile height ${map.tileheight}.`,
    );
  }

  return offsetY;
}

function getThreeDebugViewUniformValue(view: ThreeDebugView): number {
  switch (view) {
    case "beauty": {
      return 0;
    }
    case "checker": {
      return 1;
    }
    default: {
      throw new Error(view satisfies never);
    }
  }
}

function getThreeSeaDebugViewUniformValue(view: ThreeSeaDebugView): number {
  switch (view) {
    case "final": {
      return 0;
    }
    case "water-depth": {
      return 1;
    }
    case "water-normal": {
      return 2;
    }
    case "foam": {
      return 3;
    }
    case "caustics": {
      return 4;
    }
    case "underwater-transmittance": {
      return 5;
    }
    default: {
      throw new Error(view satisfies never);
    }
  }
}

function getMapLayerLevel(layer: TerrainMap["layers"][number]): number {
  for (const property of layer.properties) {
    if (property.name === "level" && typeof property.value === "number") return property.value;
  }

  return 0;
}

function getMaxBaseHeightLevel(map: TerrainMap): number {
  let maxBaseHeightLevel = 0;

  for (const layer of map.layers) {
    const level = getMapLayerLevel(layer);
    if (level > maxBaseHeightLevel) maxBaseHeightLevel = level;
  }

  return maxBaseHeightLevel;
}

function configureTexture(textureValue: THREE.Texture) {
  textureValue.colorSpace = THREE.NoColorSpace;
  textureValue.magFilter = THREE.NearestFilter;
  textureValue.minFilter = THREE.NearestFilter;
  textureValue.generateMipmaps = false;
  textureValue.needsUpdate = true;
}

function setLinearColorVector(vector: THREE.Vector3, colorHex: number) {
  const color = new THREE.Color(colorHex);
  color.convertSRGBToLinear();
  vector.set(color.r, color.g, color.b);
}

function createResolveTarget(width: number, height: number): THREE.RenderTarget {
  const renderTarget = new THREE.RenderTarget(width, height, {
    count: 2,
    depthBuffer: false,
    type: THREE.HalfFloatType,
  });
  renderTarget.texture.name = "output";
  const surfaceTexture = renderTarget.textures[1];
  if (surfaceTexture === undefined) throw new Error("Terrain resolve target is missing its surface attachment.");
  surfaceTexture.name = "surface";
  configureTexture(renderTarget.texture);
  configureTexture(surfaceTexture);
  return renderTarget;
}

class UnsupportedWebGPUApp implements ThreeTerrainApp {
  private readonly element: HTMLDivElement;
  private readonly host: HTMLElement;

  constructor(host: HTMLElement, message: string) {
    this.host = host;
    this.element = document.createElement("div");
    this.element.className = "three-app-error";
    this.element.textContent = message;
    this.host.replaceChildren(this.element);
  }

  destroy() {
    this.host.replaceChildren();
  }

  resize(_width: number, _height: number) {}

  setPaused(_paused: boolean) {}

  setLighting(_settings: ThreeLightingSettings) {}

  setSea(_settings: ThreeSeaSettings) {}

  setDebugView(_view: ThreeDebugView) {}

  setSeaDebugView(_view: ThreeSeaDebugView) {}
}

class TerrainRuntime implements ThreeTerrainApp {
  private readonly host: HTMLElement;
  private readonly bundle: TerrainAssetBundle;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly selection: THREE.LineLoop;
  private readonly resolveMaterial: THREE.MeshBasicNodeMaterial;
  private readonly lightingMaterial: THREE.MeshBasicNodeMaterial;
  private readonly resolveQuad: THREE.QuadMesh;
  private readonly lightingQuad: THREE.QuadMesh;
  private readonly resolveTarget: THREE.RenderTarget;
  private readonly viewport: Viewport;
  private cameraState: CameraState;
  private readonly cameraWorldUniform = uniform(new THREE.Vector2());
  private readonly cameraViewSizeUniform = uniform(new THREE.Vector2());
  private readonly viewportResolutionUniform = uniform(new THREE.Vector2(1, 1));
  private readonly sunDirectionUniform = uniform(getSunDirectionVector(DEFAULT_THREE_LIGHTING_SETTINGS));
  private readonly ambientUniform = uniform(DEFAULT_THREE_LIGHTING_SETTINGS.ambient);
  private readonly aliasingRadiusUniform = uniform(DEFAULT_THREE_LIGHTING_SETTINGS.aliasingRadiusTiles);
  private readonly debugViewUniform = uniform(getThreeDebugViewUniformValue(DEFAULT_THREE_DEBUG_VIEW));
  private readonly seaModeUniform = uniform(1);
  private readonly seaDebugViewUniform = uniform(getThreeSeaDebugViewUniformValue(DEFAULT_THREE_SEA_DEBUG_VIEW));
  private readonly seaTimeUniform = uniform(0);
  private readonly seaLevelFoamUniform = uniform(new THREE.Vector2());
  private readonly seaOpticsAUniform = uniform(new THREE.Vector4());
  private readonly seaOpticsBUniform = uniform(new THREE.Vector4());
  private readonly seaShallowColorUniform = uniform(new THREE.Vector3());
  private readonly seaDeepColorUniform = uniform(new THREE.Vector3());
  private readonly seaFoamColorUniform = uniform(new THREE.Vector3());
  private readonly seaCausticsColorUniform = uniform(new THREE.Vector3());
  private readonly seaSkyReflectionColorUniform = uniform(new THREE.Vector3());
  private readonly seaSwellAUniform = uniform(new THREE.Vector4());
  private readonly seaSwellBUniform = uniform(new THREE.Vector4());
  private readonly seaChopUniform = uniform(new THREE.Vector4());
  private readonly seaRippleUniform = uniform(new THREE.Vector4());
  private readonly seaFoamAUniform = uniform(new THREE.Vector4());
  private readonly seaFoamBUniform = uniform(new THREE.Vector4());
  private readonly seaCausticsUniform = uniform(new THREE.Vector4());
  private readonly seaQualityUniform = uniform(new THREE.Vector2());
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly cleanups: Array<() => void> = [];
  private paused = false;
  private seaTimeSeconds = 0;
  private drag: { startPointer: { x: number; y: number }; startCenter: { x: number; y: number }; moved: boolean } | null =
    null;
  private lastFrameAt = performance.now();

  constructor(host: HTMLElement, bundle: TerrainAssetBundle) {
    this.host = host;
    this.bundle = bundle;
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -CAMERA_Z, CAMERA_Z);
    this.selection = new THREE.LineLoop();
    this.viewport = {
      width: host.clientWidth > 0 ? host.clientWidth : 1,
      height: host.clientHeight > 0 ? host.clientHeight : 1,
    };
    this.cameraState = createInitialCameraState(bundle.bounds, this.viewport);
    this.resolveTarget = createResolveTarget(this.viewport.width, this.viewport.height);
    this.resolveMaterial = this.createResolveMaterial();
    this.lightingMaterial = this.createLightingMaterial();
    this.resolveQuad = new THREE.QuadMesh(this.resolveMaterial);
    this.lightingQuad = new THREE.QuadMesh(this.lightingMaterial);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
  }

  static async create(host: HTMLElement): Promise<ThreeTerrainApp> {
    if (!("gpu" in navigator)) {
      return new UnsupportedWebGPUApp(host, "WebGPU is required for the Three terrain renderer.");
    }

    const bundle = await loadTerrainAssetBundle();
    const runtime = new TerrainRuntime(host, bundle);
    await runtime.init();
    return runtime;
  }

  private getResolveSurfaceTexture(): THREE.Texture {
    const surfaceTexture = this.resolveTarget.textures[1];
    if (surfaceTexture === undefined) throw new Error("Terrain resolve target is missing its surface attachment.");
    return surfaceTexture;
  }

  private createScreenNode() {
    return vec2(
      this.cameraWorldUniform.x.add(viewportUV.x.mul(this.cameraViewSizeUniform.x)),
      this.cameraWorldUniform.y.add(viewportUV.y.mul(this.cameraViewSizeUniform.y)),
    );
  }

  private createResolveMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    // Pass 1 writes raw metadata; blending would treat world height as alpha and corrupt normals.
    material.transparent = false;
    material.blending = THREE.NoBlending;
    const halfTileWidth = this.bundle.map.tilewidth * 0.5;
    const halfTileHeight = this.bundle.map.tileheight * 0.5;
    const elevationStep = this.bundle.elevationYOffsetPx;
    const packedOriginX = this.bundle.packedTerrain.stack.origin.x;
    const packedOriginY = this.bundle.packedTerrain.stack.origin.y;
    const packedWidth = this.bundle.packedTerrain.stack.width;
    const packedHeight = this.bundle.packedTerrain.stack.height;
    const columns = this.bundle.tileset.columns;
    const spacing = this.bundle.tileset.spacing;
    const margin = this.bundle.tileset.margin;
    const atlasTileWidth = this.bundle.tileset.tilewidth;
    const atlasTileHeight = this.bundle.tileset.tileheight;
    const surfaceSampleOffsetY = getSurfaceSampleOffsetY(this.bundle.map, this.bundle.tileset.tileheight);
    const heightImpactOnScreenY = getSurfaceHeightImpactOnScreenY(this.bundle.map.tileheight);
    const maxWorldHeight = getWorldHeightFromLevel(getMaxBaseHeightLevel(this.bundle.map) + 2);
    const surfaceShaderTables = createSurfaceShaderTables(this.bundle.tileset);
    const winnerMapStride = Math.max(this.bundle.map.width, this.bundle.map.height) + 1;
    if (winnerMapStride * winnerMapStride > 16_777_216) {
      throw new Error(`Visible terrain winner packing overflow for map stride ${winnerMapStride}.`);
    }
    const atlasLayerStride = this.bundle.colorAtlas.height;

    const resolveHelpers = wgsl(/* wgsl */ `
      ${surfaceShaderTables}

      fn decodePackedTerrainWord(packedTexel: vec4<f32>) -> u32 {
        return
          u32(packedTexel.r * 255.0 + 0.5) |
          (u32(packedTexel.g * 255.0 + 0.5) << 8u) |
          (u32(packedTexel.b * 255.0 + 0.5) << 16u) |
          (u32(packedTexel.a * 255.0 + 0.5) << 24u);
      }

      fn decodeTerrainColor(atlasTexel: vec4<f32>) -> vec3<f32> {
        var linearRed = atlasTexel.r;
        var linearGreen = atlasTexel.g;
        var linearBlue = atlasTexel.b;

        if (linearRed <= 0.04045) {
          linearRed = linearRed / 12.92;
        } else {
          linearRed = pow((linearRed + 0.055) / 1.055, 2.4);
        }

        if (linearGreen <= 0.04045) {
          linearGreen = linearGreen / 12.92;
        } else {
          linearGreen = pow((linearGreen + 0.055) / 1.055, 2.4);
        }

        if (linearBlue <= 0.04045) {
          linearBlue = linearBlue / 12.92;
        } else {
          linearBlue = pow((linearBlue + 0.055) / 1.055, 2.4);
        }

        return vec3<f32>(linearRed, linearGreen, linearBlue);
      }

      fn missingVisibleTerrainWinner() -> vec4<f32> {
        return vec4<f32>(-1.0, -1.0, -1.0, -1.0);
      }

      fn hasVisibleTerrainWinner(winner: vec4<f32>) -> bool {
        return winner.x >= 0.0;
      }

      fn packVisibleTerrainWinner(
        atlasX: i32,
        atlasY: i32,
        biomeIndex: u32,
        shapeRef: u32,
        baseHeightLevel: u32,
        mapX: i32,
        mapY: i32,
      ) -> vec4<f32> {
        let packedAtlasY = f32(atlasY) + f32(biomeIndex) * ${atlasLayerStride.toFixed(1)};
        let packedShapeAndBaseHeight = f32(shapeRef + (baseHeightLevel << 5u));
        let packedMapCoord = f32(mapX + mapY * ${winnerMapStride});
        return vec4<f32>(f32(atlasX), packedAtlasY, packedShapeAndBaseHeight, packedMapCoord);
      }

      fn unpackVisibleTerrainBiomeIndex(winner: vec4<f32>) -> i32 {
        return i32(floor(winner.y / ${atlasLayerStride.toFixed(1)}));
      }

      fn unpackVisibleTerrainAtlasX(winner: vec4<f32>) -> i32 {
        return i32(floor(winner.x + 0.5));
      }

      fn unpackVisibleTerrainAtlasY(winner: vec4<f32>) -> i32 {
        let biomeIndex = unpackVisibleTerrainBiomeIndex(winner);
        return i32(floor(winner.y - f32(biomeIndex) * ${atlasLayerStride.toFixed(1)} + 0.5));
      }

      fn unpackVisibleTerrainShapeRef(winner: vec4<f32>) -> u32 {
        let packedShapeAndBaseHeight = u32(floor(winner.z + 0.5));
        return packedShapeAndBaseHeight & ${SHAPE_REF_MASK}u;
      }

      fn unpackVisibleTerrainBaseHeightLevel(winner: vec4<f32>) -> u32 {
        let packedShapeAndBaseHeight = u32(floor(winner.z + 0.5));
        return packedShapeAndBaseHeight >> 5u;
      }

      fn unpackVisibleTerrainMapY(winner: vec4<f32>) -> i32 {
        let packedMapCoord = i32(floor(winner.w + 0.5));
        return packedMapCoord / ${winnerMapStride};
      }

      fn unpackVisibleTerrainMapX(winner: vec4<f32>) -> i32 {
        let packedMapCoord = i32(floor(winner.w + 0.5));
        let mapY = unpackVisibleTerrainMapY(winner);
        return packedMapCoord - mapY * ${winnerMapStride};
      }

      fn sampleVisibleTerrainAtlas(winner: vec4<f32>, atlas: texture_2d_array<f32>) -> vec4<f32> {
        if (!hasVisibleTerrainWinner(winner)) {
          return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }

        return textureLoad(
          atlas,
          vec2<i32>(unpackVisibleTerrainAtlasX(winner), unpackVisibleTerrainAtlasY(winner)),
          unpackVisibleTerrainBiomeIndex(winner),
          0,
        );
      }

      fn worldToTileCoord(world: vec2<f32>) -> vec2<f32> {
        let halfTileWidthInv = ${(2 / this.bundle.map.tilewidth).toFixed(8)};
        let halfTileHeightInv = ${(2 / this.bundle.map.tileheight).toFixed(8)};
        let tileX = (world.x * halfTileWidthInv + world.y * halfTileHeightInv) * 0.5 - 1.0;
        let tileY = (world.y * halfTileHeightInv - world.x * halfTileWidthInv) * 0.5;
        return vec2<f32>(tileX, tileY);
      }

      fn isLaterInPainterOrder(
        found: bool,
        candidateBaseHeightLevel: u32,
        candidateMapX: i32,
        candidateMapY: i32,
        winnerBaseHeightLevel: u32,
        winnerMapX: i32,
        winnerMapY: i32,
      ) -> bool {
        if (!found) {
          return true;
        }
        if (candidateBaseHeightLevel != winnerBaseHeightLevel) {
          return candidateBaseHeightLevel > winnerBaseHeightLevel;
        }
        if (candidateMapY != winnerMapY) {
          return candidateMapY > winnerMapY;
        }
        return candidateMapX > winnerMapX;
      }

      fn interpolateTriangleHeight(
        localTile: vec2<f32>,
        vertexA: vec3<f32>,
        vertexB: vec3<f32>,
        vertexC: vec3<f32>,
      ) -> f32 {
        let denominator =
          (vertexB.y - vertexC.y) * (vertexA.x - vertexC.x) +
          (vertexC.x - vertexB.x) * (vertexA.y - vertexC.y);
        let weightA =
          ((vertexB.y - vertexC.y) * (localTile.x - vertexC.x) +
            (vertexC.x - vertexB.x) * (localTile.y - vertexC.y)) / denominator;
        let weightB =
          ((vertexC.y - vertexA.y) * (localTile.x - vertexC.x) +
            (vertexA.x - vertexC.x) * (localTile.y - vertexC.y)) / denominator;
        let weightC = 1.0 - weightA - weightB;
        return weightA * vertexA.z + weightB * vertexB.z + weightC * vertexC.z;
      }

      fn rotateTerrainNormalToWorld(terrainNormal: vec3<f32>) -> vec3<f32> {
        return normalize(
          vec3<f32>(
            0.70710678 * terrainNormal.x + 0.70710678 * terrainNormal.y,
            -0.70710678 * terrainNormal.x + 0.70710678 * terrainNormal.y,
            terrainNormal.z,
          ),
        );
      }

      fn evaluateAnalyticSurfaceHeight(shapeRef: u32, baseHeightLevel: u32, localTile: vec2<f32>) -> f32 {
        if (shapeRef == 0u) {
          return -1.0;
        }

        let north = SURFACE_NORTH[shapeRef];
        let east = SURFACE_EAST[shapeRef];
        let south = SURFACE_SOUTH[shapeRef];
        let west = SURFACE_WEST[shapeRef];
        let center = SURFACE_CENTER[shapeRef];

        var localHeight = 0.0;

        if (localTile.y < 1.0 - localTile.x) {
          if (localTile.y < localTile.x) {
            localHeight = interpolateTriangleHeight(
              localTile,
              vec3<f32>(0.0, 0.0, north),
              vec3<f32>(1.0, 0.0, east),
              vec3<f32>(0.5, 0.5, center),
            );
          } else {
            localHeight = interpolateTriangleHeight(
              localTile,
              vec3<f32>(0.0, 1.0, west),
              vec3<f32>(0.0, 0.0, north),
              vec3<f32>(0.5, 0.5, center),
            );
          }
        } else if (localTile.y < localTile.x) {
          localHeight = interpolateTriangleHeight(
            localTile,
            vec3<f32>(1.0, 0.0, east),
            vec3<f32>(1.0, 1.0, south),
            vec3<f32>(0.5, 0.5, center),
          );
        } else {
          localHeight = interpolateTriangleHeight(
            localTile,
            vec3<f32>(1.0, 1.0, south),
            vec3<f32>(0.0, 1.0, west),
            vec3<f32>(0.5, 0.5, center),
          );
        }

        return (f32(baseHeightLevel) + localHeight) * SURFACE_WORLD_HEIGHT_SCALE;
      }

      fn evaluateAnalyticSurfaceNormal(shapeRef: u32, localTile: vec2<f32>) -> vec3<f32> {
        if (shapeRef == 0u) {
          return vec3<f32>(0.0, 0.0, 1.0);
        }

        if (localTile.y < 1.0 - localTile.x) {
          if (localTile.y < localTile.x) {
            return SURFACE_WORLD_NORMAL_NE[shapeRef];
          }

          return SURFACE_WORLD_NORMAL_NW[shapeRef];
        }

        if (localTile.y < localTile.x) {
          return SURFACE_WORLD_NORMAL_SE[shapeRef];
        }

        return SURFACE_WORLD_NORMAL_SW[shapeRef];
      }

      fn evaluateAnalyticSurfaceMeta(shapeRef: u32, baseHeightLevel: u32, localTile: vec2<f32>) -> vec4<f32> {
        let worldHeight = evaluateAnalyticSurfaceHeight(shapeRef, baseHeightLevel, localTile);

        if (worldHeight < 0.0) {
          return vec4<f32>(0.0, 0.0, 1.0, -1.0);
        }

        return vec4<f32>(evaluateAnalyticSurfaceNormal(shapeRef, localTile), worldHeight);
      }

      fn loadSurfaceCellWord(surfaceCells: texture_2d<f32>, mapX: i32, mapY: i32) -> u32 {
        if (mapX < 0 || mapY < 0 || mapX >= ${this.bundle.map.width} || mapY >= ${this.bundle.map.height}) {
          return 0u;
        }

        return decodePackedTerrainWord(textureLoad(surfaceCells, vec2<i32>(mapX, mapY), 0));
      }

      fn sampleSurfaceCellHeight(surfaceCells: texture_2d<f32>, tileCoord: vec2<f32>) -> vec2<f32> {
        let mapX = i32(floor(tileCoord.x));
        let mapY = i32(floor(tileCoord.y));
        let surfaceWord = loadSurfaceCellWord(surfaceCells, mapX, mapY);
        let shapeRef = surfaceWord & ${SHAPE_REF_MASK}u;

        if (shapeRef == 0u) {
          return vec2<f32>(0.0, 0.0);
        }

        let localTile = tileCoord - vec2<f32>(f32(mapX), f32(mapY));
        return vec2<f32>(
          1.0,
          evaluateAnalyticSurfaceHeight(shapeRef, surfaceWord >> ${BASE_HEIGHT_LEVEL_SHIFT}u, localTile),
        );
      }

      fn deriveAdaptiveHeightGradient(
        centerHeight: f32,
        negativeSample: vec2<f32>,
        positiveSample: vec2<f32>,
        aliasingRadius: f32,
      ) -> vec2<f32> {
        let hasNegative = negativeSample.x > 0.5;
        let hasPositive = positiveSample.x > 0.5;

        if (hasNegative && hasPositive) {
          return vec2<f32>(1.0, (positiveSample.y - negativeSample.y) / (2.0 * aliasingRadius));
        }
        if (hasPositive) {
          return vec2<f32>(1.0, (positiveSample.y - centerHeight) / aliasingRadius);
        }
        if (hasNegative) {
          return vec2<f32>(1.0, (centerHeight - negativeSample.y) / aliasingRadius);
        }

        return vec2<f32>(0.0, 0.0);
      }

      fn evaluateVisibleTerrainLightingNormal(
        world: vec2<f32>,
        winner: vec4<f32>,
        exactSurfaceMeta: vec4<f32>,
        surfaceCells: texture_2d<f32>,
        aliasingRadius: f32,
      ) -> vec3<f32> {
        if (!hasVisibleTerrainWinner(winner)) {
          return vec3<f32>(0.0, 0.0, 1.0);
        }
        if (aliasingRadius <= 0.0) {
          return exactSurfaceMeta.rgb;
        }

        let winnerShapeRef = unpackVisibleTerrainShapeRef(winner);
        let winnerBaseHeightLevel = unpackVisibleTerrainBaseHeightLevel(winner);
        let winnerMapX = unpackVisibleTerrainMapX(winner);
        let winnerMapY = unpackVisibleTerrainMapY(winner);
        let topSurfaceWord = loadSurfaceCellWord(surfaceCells, winnerMapX, winnerMapY);

        if ((topSurfaceWord & ${SHAPE_REF_MASK}u) != winnerShapeRef) {
          return exactSurfaceMeta.rgb;
        }
        if ((topSurfaceWord >> ${BASE_HEIGHT_LEVEL_SHIFT}u) != winnerBaseHeightLevel) {
          return exactSurfaceMeta.rgb;
        }

        let tileCoord = worldToTileCoord(world);
        let negativeXSample = sampleSurfaceCellHeight(surfaceCells, vec2<f32>(tileCoord.x - aliasingRadius, tileCoord.y));
        let positiveXSample = sampleSurfaceCellHeight(surfaceCells, vec2<f32>(tileCoord.x + aliasingRadius, tileCoord.y));
        let negativeYSample = sampleSurfaceCellHeight(surfaceCells, vec2<f32>(tileCoord.x, tileCoord.y - aliasingRadius));
        let positiveYSample = sampleSurfaceCellHeight(surfaceCells, vec2<f32>(tileCoord.x, tileCoord.y + aliasingRadius));
        let dHeightDx = deriveAdaptiveHeightGradient(exactSurfaceMeta.a, negativeXSample, positiveXSample, aliasingRadius);
        let dHeightDy = deriveAdaptiveHeightGradient(exactSurfaceMeta.a, negativeYSample, positiveYSample, aliasingRadius);

        if (dHeightDx.x < 0.5 || dHeightDy.x < 0.5) {
          return exactSurfaceMeta.rgb;
        }

        return rotateTerrainNormalToWorld(normalize(vec3<f32>(-dHeightDx.y, dHeightDy.y, 1.0)));
      }

      fn resolveVisibleTerrainWinner(
        screen: vec2<f32>,
        packedMap: texture_2d_array<f32>,
        ownershipAtlas: texture_2d_array<f32>,
      ) -> vec4<f32> {
        let pixelX = i32(floor(screen.x));
        let pixelY = i32(floor(screen.y));
        let stripeRight = i32(floor(f32(pixelX) / ${halfTileWidth.toFixed(1)}));
        var found = false;
        var winnerBaseHeightLevel = 0u;
        var winnerMapX = 0;
        var winnerMapY = 0;
        var winnerAtlasX = 0;
        var winnerAtlasY = 0;
        var winnerBiomeIndex = 0u;
        var winnerShapeRef = 0u;

        for (var stripeIndex = 0; stripeIndex < 2; stripeIndex++) {
          let d = stripeRight + stripeIndex - 1;

          for (var slice = 0; slice < 8; slice++) {
            let baseS = i32(
              floor((f32(pixelY) + ${halfTileHeight.toFixed(1)} + f32(slice * ${elevationStep})) / ${halfTileHeight.toFixed(1)}),
            );

            for (var delta = 0; delta < 3; delta++) {
              let s = baseS - delta;

              if (((s - d) & 1) != 0) {
                continue;
              }

              let packedX = (s + d) / 2;
              let packedY = (s - d) / 2;
              let textureX = packedX + ${packedOriginX};
              let textureY = packedY + ${packedOriginY};

              if (textureX < 0 || textureY < 0 || textureX >= ${packedWidth} || textureY >= ${packedHeight}) {
                continue;
              }

              let packedTexel = textureLoad(packedMap, vec2<i32>(textureX, textureY), slice, 0);
              let word = decodePackedTerrainWord(packedTexel);
              let shapeRef = word & ${SHAPE_REF_MASK}u;

              if (shapeRef == 0u) {
                continue;
              }

              let biomeIndex = (word >> ${BIOME_INDEX_SHIFT}u) & ${BIOME_INDEX_MASK}u;
              let baseHeightLevel = word >> ${BASE_HEIGHT_LEVEL_SHIFT}u;
              let octave = i32(baseHeightLevel / 8u);
              let mapX = packedX + octave * 2;
              let mapY = packedY + octave * 2;
              let tileId = i32(shapeRef) - 1;
              let localX = pixelX - d * ${halfTileWidth};
              let localY = pixelY - (s * ${halfTileHeight} - ${halfTileHeight} - slice * ${elevationStep});

              if (localX < 0 || localY < 0 || localX >= ${atlasTileWidth} || localY >= ${atlasTileHeight}) {
                continue;
              }

              let column = tileId % ${columns};
              let row = tileId / ${columns};
              let atlasX = ${margin} + column * ${atlasTileWidth + spacing} + localX;
              let atlasY = ${margin} + row * ${atlasTileHeight + spacing} + localY;
              let ownershipTexel = textureLoad(ownershipAtlas, vec2<i32>(atlasX, atlasY), i32(biomeIndex), 0);

              if (ownershipTexel.a <= 0.0) {
                continue;
              }

              if (isLaterInPainterOrder(
                found,
                baseHeightLevel,
                mapX,
                mapY,
                winnerBaseHeightLevel,
                winnerMapX,
                winnerMapY,
              )) {
                found = true;
                winnerBaseHeightLevel = baseHeightLevel;
                winnerMapX = mapX;
                winnerMapY = mapY;
                winnerAtlasX = atlasX;
                winnerAtlasY = atlasY;
                winnerBiomeIndex = biomeIndex;
                winnerShapeRef = shapeRef;
              }
            }
          }
        }

        if (!found) {
          return missingVisibleTerrainWinner();
        }

        return packVisibleTerrainWinner(
          winnerAtlasX,
          winnerAtlasY,
          winnerBiomeIndex,
          winnerShapeRef,
          winnerBaseHeightLevel,
          winnerMapX,
          winnerMapY,
        );
      }

      fn getVisibleTerrainLocalTile(world: vec2<f32>, winner: vec4<f32>) -> vec2<f32> {
        let tileCoord = worldToTileCoord(world);
        let mapX = unpackVisibleTerrainMapX(winner);
        let mapY = unpackVisibleTerrainMapY(winner);
        let localTile = vec2<f32>(tileCoord.x - f32(mapX), tileCoord.y - f32(mapY));
        return clamp(localTile, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
      }

      fn evaluateVisibleTerrainSurfaceMeta(world: vec2<f32>, winner: vec4<f32>) -> vec4<f32> {
        if (!hasVisibleTerrainWinner(winner)) {
          return vec4<f32>(0.0, 0.0, 1.0, -1.0);
        }

        return evaluateAnalyticSurfaceMeta(
          unpackVisibleTerrainShapeRef(winner),
          unpackVisibleTerrainBaseHeightLevel(winner),
          getVisibleTerrainLocalTile(world, winner),
        );
      }

      fn solveGroundScreenYForWinner(
        screen: vec2<f32>,
        winner: vec4<f32>,
      ) -> f32 {
        var minY = screen.y;
        var maxY = screen.y + ${(maxWorldHeight * heightImpactOnScreenY).toFixed(8)};
        var groundY = screen.y;

        for (var iteration = 0; iteration < ${SURFACE_GROUND_SEARCH_ITERATIONS}; iteration++) {
          groundY = (minY + maxY) * 0.5;
          let surfaceMeta = evaluateVisibleTerrainSurfaceMeta(vec2<f32>(screen.x, groundY), winner);

          if (surfaceMeta.a < 0.0) {
            maxY = groundY;
            continue;
          }

          let occlusionPoint = groundY - surfaceMeta.a * ${heightImpactOnScreenY.toFixed(8)};

          if (occlusionPoint >= screen.y) {
            maxY = groundY;
          } else {
            minY = groundY;
          }
        }

        return (minY + maxY) * 0.5;
      }
    `);

    const resolveTerrainAlbedo = wgslFn(/* wgsl */ `
      fn resolveTerrainAlbedo(
        winner: vec4<f32>,
        atlas: texture_2d_array<f32>,
        checkerAtlas: texture_2d_array<f32>,
        debugView: f32,
      ) -> vec4<f32> {
        if (!hasVisibleTerrainWinner(winner)) {
          return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }

        let beautyTexel = sampleVisibleTerrainAtlas(winner, atlas);
        var colorTexel = beautyTexel;

        if (debugView >= 0.5) {
          colorTexel = sampleVisibleTerrainAtlas(winner, checkerAtlas);
        }

        return vec4<f32>(decodeTerrainColor(colorTexel), beautyTexel.a);
      }
    `, [resolveHelpers]);

    const resolveTerrainSurfaceMeta = wgslFn(/* wgsl */ `
      fn resolveTerrainSurfaceMeta(
        screen: vec2<f32>,
        winner: vec4<f32>,
        surfaceCells: texture_2d<f32>,
        aliasingRadius: f32,
      ) -> vec4<f32> {
        if (!hasVisibleTerrainWinner(winner)) {
          return vec4<f32>(0.0, 0.0, 1.0, 0.0);
        }

        let surfaceScreen = vec2<f32>(screen.x, screen.y + ${surfaceSampleOffsetY.toFixed(1)});
        let groundY = solveGroundScreenYForWinner(surfaceScreen, winner);
        let resolvedPoint = vec2<f32>(surfaceScreen.x, groundY);
        let surfaceMeta = evaluateVisibleTerrainSurfaceMeta(resolvedPoint, winner);

        if (surfaceMeta.a < 0.0) {
          return vec4<f32>(0.0, 0.0, 1.0, 0.0);
        }

        let lightingNormal = evaluateVisibleTerrainLightingNormal(
          resolvedPoint,
          winner,
          surfaceMeta,
          surfaceCells,
          aliasingRadius,
        );
        return vec4<f32>(lightingNormal, surfaceMeta.a);
      }
    `, [resolveHelpers]);

    const resolveVisibleTerrainWinnerNode = wgslFn(/* wgsl */ `
      fn resolveVisibleTerrainWinnerNode(
        screen: vec2<f32>,
        packedMap: texture_2d_array<f32>,
        ownershipAtlas: texture_2d_array<f32>,
      ) -> vec4<f32> {
        return resolveVisibleTerrainWinner(screen, packedMap, ownershipAtlas);
      }
    `, [resolveHelpers]);

    const screen = this.createScreenNode();
    const visibleWinner = Var(resolveVisibleTerrainWinnerNode({
      screen,
      packedMap: textureLoad(this.bundle.packedTerrain.texture),
      ownershipAtlas: textureLoad(this.bundle.colorAtlas.texture),
    }), "visibleTerrainWinner");
    const resolvedAlbedo = resolveTerrainAlbedo({
      winner: visibleWinner,
      atlas: textureLoad(this.bundle.colorAtlas.texture),
      checkerAtlas: textureLoad(this.bundle.checkerAtlas.texture),
      debugView: this.debugViewUniform,
    });
    const resolvedSurfaceMeta = resolveTerrainSurfaceMeta({
      screen,
      winner: visibleWinner,
      surfaceCells: textureLoad(this.bundle.surfaceCells.texture),
      aliasingRadius: this.aliasingRadiusUniform,
    });
    material.outputNode = resolvedAlbedo;
    material.mrtNode = mrt({
      output: resolvedAlbedo,
      surface: resolvedSurfaceMeta,
    });

    return material;
  }

  private createLightingMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    // Fullscreen lighting is a complete overwrite of the frame, not a blend pass.
    material.transparent = false;
    material.blending = THREE.NoBlending;
    const halfTileWidthInv = 2 / this.bundle.map.tilewidth;
    const halfTileHeightInv = 2 / this.bundle.map.tileheight;
    const heightImpactOnScreenY = getSurfaceHeightImpactOnScreenY(this.bundle.map.tileheight);
    const seaHelpers = wgsl(/* wgsl */ `
      ${createSeaShaderChunk()}

      fn worldToSeaTileCoord(world: vec2<f32>) -> vec2<f32> {
        let tileX = (world.x * ${halfTileWidthInv.toFixed(8)} + world.y * ${halfTileHeightInv.toFixed(8)}) * 0.5 - 1.0;
        let tileY = (world.y * ${halfTileHeightInv.toFixed(8)} - world.x * ${halfTileWidthInv.toFixed(8)}) * 0.5;
        return vec2<f32>(tileX, tileY);
      }

      fn shadeTerrainAndSea(
        world: vec2<f32>,
        terrainColor: vec3<f32>,
        terrainAlpha: f32,
        terrainNormal: vec3<f32>,
        terrainHeight: f32,
        refractedTerrainColor: vec3<f32>,
        refractedTerrainAlpha: f32,
        refractedTerrainNormal: vec3<f32>,
        refractedTerrainHeight: f32,
        seaMode: f32,
        seaDebugView: f32,
        seaTime: f32,
        sunDirection: vec3<f32>,
        seaLevelFoam: vec2<f32>,
        seaOpticsA: vec4<f32>,
        seaOpticsB: vec4<f32>,
        shallowColor: vec3<f32>,
        deepColor: vec3<f32>,
        foamColor: vec3<f32>,
        causticsColor: vec3<f32>,
        skyReflectionColor: vec3<f32>,
        swellA: vec4<f32>,
        swellB: vec4<f32>,
        chop: vec4<f32>,
        ripple: vec4<f32>,
        foamA: vec4<f32>,
        foamB: vec4<f32>,
        caustics: vec4<f32>,
        quality: vec2<f32>,
      ) -> vec4<f32> {
        if (terrainAlpha <= 0.0) {
          return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }

        if (seaMode < 0.5) {
          return vec4<f32>(terrainColor, terrainAlpha);
        }

        let tileCoord = worldToSeaTileCoord(world);
        let seaSurface = seaEvaluateSurface(seaLevelFoam, swellA, swellB, chop, ripple, quality, tileCoord, seaTime);
        let waterDepthWorld = seaSurface.x - terrainHeight;

        if (waterDepthWorld <= 0.0) {
          if (seaDebugView < 0.5) {
            return vec4<f32>(terrainColor, terrainAlpha);
          }

          return vec4<f32>(0.0, 0.0, 0.0, terrainAlpha);
        }

        let waterDepthLevels = waterDepthWorld / SURFACE_WORLD_HEIGHT_SCALE;
        let seaNormal = rotateTerrainNormalToWorld(seaSafeNormalize(vec3<f32>(-seaSurface.y, seaSurface.z, 1.0)));
        let viewDirection = seaSafeNormalize(vec3<f32>(0.0, 1.0, ${heightImpactOnScreenY.toFixed(8)}));
        let transmittance = seaUnderwaterTransmittance(waterDepthLevels, seaOpticsA.y, seaOpticsA.z);
        let depthRamp = seaClampUnit(waterDepthLevels / max(seaOpticsA.y, 0.001));
        let waterVolumeColor = mix(shallowColor, deepColor, depthRamp);
        let refractedTerrainIsValid = refractedTerrainAlpha > 0.0 && seaSurface.x > refractedTerrainHeight;
        var submergedTerrainColor = terrainColor;
        var submergedTerrainNormal = terrainNormal;

        if (refractedTerrainIsValid) {
          submergedTerrainColor = refractedTerrainColor;
          submergedTerrainNormal = refractedTerrainNormal;
        }

        let causticsEdge = seaAnimatedVoronoiEdge(
          tileCoord + vec2<f32>(5.3, -2.1),
          caustics.y,
          foamB.x,
          caustics.z,
          foamB.z * 0.6,
          seaTime,
          quality.y,
        );
        let causticsDepthFade = 1.0 - seaClampUnit(waterDepthLevels / max(caustics.w, 0.001));
        let causticsAmount = caustics.x * causticsEdge * causticsDepthFade * transmittance * submergedTerrainNormal.z;
        let underwaterColor = mix(
          waterVolumeColor,
          submergedTerrainColor + causticsColor * causticsAmount,
          transmittance,
        );

        let shorelineFoam = pow(
          seaClampUnit((seaLevelFoam.y - waterDepthLevels) / max(seaLevelFoam.y, 0.001)),
          max(foamA.z, 0.01),
        );
        let crestFoam = smoothstep(max(0.35, 0.72 - foamA.z), 0.95, seaSurface.w);
        let foamVoronoi = seaAnimatedVoronoiEdge(tileCoord, foamA.w, foamB.x, foamB.y, foamB.z, seaTime, quality.y);
        let foamAmount = seaClampUnit((shorelineFoam * foamA.x + crestFoam * foamA.y) * foamVoronoi);

        let fresnelBase = 1.0 - max(dot(viewDirection, seaNormal), 0.0);
        let fresnel = pow(fresnelBase, max(seaOpticsB.x, 0.001)) * seaOpticsB.y;
        let halfVector = seaSafeNormalize(viewDirection + sunDirection);
        let glint = pow(max(dot(seaNormal, halfVector), 0.0), max(seaOpticsB.w, 1.0)) * seaOpticsB.z;
        let diffuse = max(dot(seaNormal, sunDirection), 0.0) * 0.08;
        let surfaceColor =
          mix(waterVolumeColor, skyReflectionColor, seaClampUnit(fresnel)) +
          shallowColor * diffuse +
          skyReflectionColor * (fresnel * 0.25) +
          vec3<f32>(glint, glint, glint) +
          foamColor * foamAmount;
        let surfaceBlend = seaClampUnit(seaOpticsA.x + fresnel * 0.65 + foamAmount * 0.55);
        let finalSeaColor = mix(underwaterColor, surfaceColor, surfaceBlend);

        if (seaDebugView < 0.5) {
          return vec4<f32>(finalSeaColor, terrainAlpha);
        }
        if (seaDebugView < 1.5) {
          return vec4<f32>(vec3<f32>(seaClampUnit(waterDepthLevels / max(seaOpticsA.y, 0.001))), terrainAlpha);
        }
        if (seaDebugView < 2.5) {
          return vec4<f32>(seaNormal * 0.5 + vec3<f32>(0.5, 0.5, 0.5), terrainAlpha);
        }
        if (seaDebugView < 3.5) {
          return vec4<f32>(vec3<f32>(foamAmount), terrainAlpha);
        }
        if (seaDebugView < 4.5) {
          return vec4<f32>(vec3<f32>(causticsAmount), terrainAlpha);
        }

        return vec4<f32>(vec3<f32>(transmittance), terrainAlpha);
      }
    `);
    const shadeTerrainAndSeaNode = wgslFn(/* wgsl */ `
      fn shadeTerrainAndSeaNode(
        world: vec2<f32>,
        terrainColor: vec3<f32>,
        terrainAlpha: f32,
        terrainNormal: vec3<f32>,
        terrainHeight: f32,
        refractedTerrainColor: vec3<f32>,
        refractedTerrainAlpha: f32,
        refractedTerrainNormal: vec3<f32>,
        refractedTerrainHeight: f32,
        seaMode: f32,
        seaDebugView: f32,
        seaTime: f32,
        sunDirection: vec3<f32>,
        seaLevelFoam: vec2<f32>,
        seaOpticsA: vec4<f32>,
        seaOpticsB: vec4<f32>,
        shallowColor: vec3<f32>,
        deepColor: vec3<f32>,
        foamColor: vec3<f32>,
        causticsColor: vec3<f32>,
        skyReflectionColor: vec3<f32>,
        swellA: vec4<f32>,
        swellB: vec4<f32>,
        chop: vec4<f32>,
        ripple: vec4<f32>,
        foamA: vec4<f32>,
        foamB: vec4<f32>,
        caustics: vec4<f32>,
        quality: vec2<f32>,
      ) -> vec4<f32> {
        return shadeTerrainAndSea(
          world,
          terrainColor,
          terrainAlpha,
          terrainNormal,
          terrainHeight,
          refractedTerrainColor,
          refractedTerrainAlpha,
          refractedTerrainNormal,
          refractedTerrainHeight,
          seaMode,
          seaDebugView,
          seaTime,
          sunDirection,
          seaLevelFoam,
          seaOpticsA,
          seaOpticsB,
          shallowColor,
          deepColor,
          foamColor,
          causticsColor,
          skyReflectionColor,
          swellA,
          swellB,
          chop,
          ripple,
          foamA,
          foamB,
          caustics,
          quality,
        );
      }
    `, [seaHelpers]);
    const screen = this.createScreenNode();
    const tileCoord = vec2(
      screen.x.mul(halfTileWidthInv).add(screen.y.mul(halfTileHeightInv)).mul(0.5).sub(float(1)),
      screen.y.mul(halfTileHeightInv).sub(screen.x.mul(halfTileWidthInv)).mul(0.5),
    );
    const refractionPhaseA = tileCoord.x
      .mul(this.seaRippleUniform.y)
      .add(tileCoord.y.mul(0.63))
      .add(this.seaTimeUniform.mul(this.seaRippleUniform.z));
    const refractionPhaseB = tileCoord.y
      .mul(this.seaRippleUniform.y.mul(0.87))
      .sub(tileCoord.x.mul(0.49))
      .sub(this.seaTimeUniform.mul(this.seaRippleUniform.z).mul(1.13));
    const refractionDirection = vec2(
      sin(refractionPhaseA).add(cos(refractionPhaseB.mul(1.27))),
      sin(refractionPhaseB).sub(cos(refractionPhaseA.mul(1.11))),
    );
    const refractedUv = clamp(
      viewportUV.add(refractionDirection.mul(this.seaOpticsAUniform.w).div(this.viewportResolutionUniform)),
      vec2(0.0, 0.0),
      vec2(1.0, 1.0),
    );
    const albedo = texture(this.resolveTarget.texture).toVar("terrainAlbedo");
    const terrainSurface = texture(this.getResolveSurfaceTexture(), viewportUV).toVar("terrainSurface");
    const terrainNormal = terrainSurface.rgb.normalize().toVar("terrainLightingNormal");
    const diffuse = terrainNormal.dot(this.sunDirectionUniform).max(float(0));
    const shade = this.ambientUniform.add(float(1).sub(this.ambientUniform).mul(diffuse));
    const dryTerrainColor = albedo.rgb.mul(shade).toVar("dryTerrainColor");
    const refractedAlbedo = texture(this.resolveTarget.texture, refractedUv).toVar("terrainRefractedAlbedo");
    const refractedSurface = texture(this.getResolveSurfaceTexture(), refractedUv).toVar("terrainRefractedSurface");
    const refractedTerrainNormal = refractedSurface.rgb.normalize().toVar("terrainRefractedLightingNormal");
    const refractedDiffuse = refractedTerrainNormal.dot(this.sunDirectionUniform).max(float(0));
    const refractedShade = this.ambientUniform.add(float(1).sub(this.ambientUniform).mul(refractedDiffuse));
    const refractedDryTerrainColor = refractedAlbedo.rgb.mul(refractedShade).toVar("refractedDryTerrainColor");
    material.outputNode = shadeTerrainAndSeaNode({
      world: screen,
      terrainColor: dryTerrainColor,
      terrainAlpha: albedo.a,
      terrainNormal,
      terrainHeight: terrainSurface.a,
      refractedTerrainColor: refractedDryTerrainColor,
      refractedTerrainAlpha: refractedAlbedo.a,
      refractedTerrainNormal,
      refractedTerrainHeight: refractedSurface.a,
      seaMode: this.seaModeUniform,
      seaDebugView: this.seaDebugViewUniform,
      seaTime: this.seaTimeUniform,
      sunDirection: this.sunDirectionUniform,
      seaLevelFoam: this.seaLevelFoamUniform,
      seaOpticsA: this.seaOpticsAUniform,
      seaOpticsB: this.seaOpticsBUniform,
      shallowColor: this.seaShallowColorUniform,
      deepColor: this.seaDeepColorUniform,
      foamColor: this.seaFoamColorUniform,
      causticsColor: this.seaCausticsColorUniform,
      skyReflectionColor: this.seaSkyReflectionColorUniform,
      swellA: this.seaSwellAUniform,
      swellB: this.seaSwellBUniform,
      chop: this.seaChopUniform,
      ripple: this.seaRippleUniform,
      foamA: this.seaFoamAUniform,
      foamB: this.seaFoamBUniform,
      caustics: this.seaCausticsUniform,
      quality: this.seaQualityUniform,
    });
    return material;
  }

  private async init() {
    this.host.replaceChildren(this.renderer.domElement);
    await this.renderer.init();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x00_00_00, 0);

    configureTexture(this.bundle.colorAtlas.texture);
    configureTexture(this.bundle.checkerAtlas.texture);
    configureTexture(this.bundle.packedTerrain.texture);
    configureTexture(this.bundle.surfaceCells.texture);
    configureTexture(this.resolveTarget.texture);
    configureTexture(this.getResolveSurfaceTexture());

    this.disposables.push(
      this.renderer,
      this.resolveMaterial,
      this.lightingMaterial,
      this.resolveTarget,
      this.bundle.colorAtlas.texture,
      this.bundle.checkerAtlas.texture,
      this.bundle.packedTerrain.texture,
      this.bundle.surfaceCells.texture,
    );

    this.setupSelection();
    this.resize(this.viewport.width, this.viewport.height);
    this.setLighting(DEFAULT_THREE_LIGHTING_SETTINGS);
    this.setSea(DEFAULT_THREE_SEA_SETTINGS);
    this.setDebugView(DEFAULT_THREE_DEBUG_VIEW);
    this.setSeaDebugView(DEFAULT_THREE_SEA_DEBUG_VIEW);
    this.bindEvents();
    this.renderer.setAnimationLoop(this.render);
  }

  private setupSelection() {
    const halfWidth = this.bundle.map.tilewidth * 0.5;
    const halfHeight = this.bundle.map.tileheight * 0.5;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -halfHeight, 0),
      new THREE.Vector3(halfWidth, 0, 0),
      new THREE.Vector3(0, halfHeight, 0),
      new THREE.Vector3(-halfWidth, 0, 0),
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0xff_ff_55, transparent: true, opacity: 0.9 });
    material.depthTest = false;
    this.selection.geometry = geometry;
    this.selection.material = material;
    this.selection.visible = false;
    this.scene.add(this.selection);
    this.disposables.push(geometry, material);
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.drag = {
      startPointer: { x: event.clientX, y: event.clientY },
      startCenter: { ...this.cameraState.center },
      moved: false,
    };
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.drag === null || this.paused) return;
    const dx = event.clientX - this.drag.startPointer.x;
    const dy = event.clientY - this.drag.startPointer.y;
    if (Math.abs(dx) > PICK_DRAG_THRESHOLD_PX || Math.abs(dy) > PICK_DRAG_THRESHOLD_PX) this.drag.moved = true;

    this.cameraState = {
      ...this.cameraState,
      center: clampCameraCenter(
        {
          x: this.drag.startCenter.x - dx / this.cameraState.zoom,
          y: this.drag.startCenter.y - dy / this.cameraState.zoom,
        },
        this.bundle.bounds,
        this.viewport,
        this.cameraState.zoom,
      ),
    };
    this.syncCamera();
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.drag === null) return;
    this.renderer.domElement.releasePointerCapture(event.pointerId);
    const pointer = this.drag;
    this.drag = null;
    if (pointer.moved || this.paused) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const world = screenPointToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.cameraState,
      this.viewport,
    );
    const hit = this.bundle.codec.resolveVisibleTile(this.bundle.colorAtlas, world.x, world.y);
    this.updateSelection(hit);
  };

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const anchoredWorld = screenPointToWorld(pointer, this.cameraState, this.viewport);
    const zoom = getContinuousZoom(this.cameraState.zoom, event.deltaY, this.cameraState.zooms);
    const center = clampCameraCenter(
      {
        x: anchoredWorld.x - (pointer.x - this.viewport.width * 0.5) / zoom,
        y: anchoredWorld.y - (pointer.y - this.viewport.height * 0.5) / zoom,
      },
      this.bundle.bounds,
      this.viewport,
      zoom,
    );
    this.cameraState = { ...this.cameraState, zoom, center };
    this.syncCamera();
  };

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "+":
      case "=": {
        const zoom = getDiscreteZoom(this.cameraState.zoom, this.cameraState.zooms, 1);
        this.cameraState = { ...this.cameraState, zoom };
        this.syncCamera();
        break;
      }
      case "-": {
        const zoom = getDiscreteZoom(this.cameraState.zoom, this.cameraState.zooms, -1);
        this.cameraState = { ...this.cameraState, zoom };
        this.syncCamera();
        break;
      }
      case "0": {
        this.cameraState = {
          ...this.cameraState,
          zoom: this.cameraState.coverZoom,
          center: clampCameraCenter(
            {
              x: this.bundle.bounds.x + this.bundle.bounds.width * 0.5,
              y: this.bundle.bounds.y + this.bundle.bounds.height * 0.5,
            },
            this.bundle.bounds,
            this.viewport,
            this.cameraState.coverZoom,
          ),
        };
        this.syncCamera();
        break;
      }
    }
  };

  private bindEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    globalThis.addEventListener("keydown", this.handleKeyDown);

    this.cleanups.push(
      () => canvas.removeEventListener("pointerdown", this.handlePointerDown),
      () => canvas.removeEventListener("pointermove", this.handlePointerMove),
      () => canvas.removeEventListener("pointerup", this.handlePointerUp),
      () => canvas.removeEventListener("wheel", this.handleWheel),
      () => globalThis.removeEventListener("keydown", this.handleKeyDown),
    );
  }

  private updateSelection(hit: ResolveHit | null) {
    if (hit === null) {
      this.selection.visible = false;
      return;
    }

    this.selection.position.set(hit.screen.x, hit.screen.y, 0);
    this.selection.visible = true;
  }

  private syncCamera() {
    const clampedCenter = clampCameraCenter(
      this.cameraState.center,
      this.bundle.bounds,
      this.viewport,
      this.cameraState.zoom,
    );
    this.cameraState = { ...this.cameraState, center: clampedCenter };

    this.camera.left = 0;
    this.camera.right = this.viewport.width;
    this.camera.top = 0;
    this.camera.bottom = this.viewport.height;
    this.camera.zoom = this.cameraState.zoom;
    this.camera.position.set(this.cameraState.center.x, this.cameraState.center.y, CAMERA_Z);
    this.camera.updateProjectionMatrix();

    this.cameraWorldUniform.value.set(
      this.cameraState.center.x - (this.viewport.width * 0.5) / this.cameraState.zoom,
      this.cameraState.center.y - (this.viewport.height * 0.5) / this.cameraState.zoom,
    );
    this.cameraViewSizeUniform.value.set(
      this.viewport.width / this.cameraState.zoom,
      this.viewport.height / this.cameraState.zoom,
    );
  }

  private readonly render = () => {
    const now = performance.now();
    const delta = Math.max(now - this.lastFrameAt, 0.0001);
    this.lastFrameAt = now;
    fpsBus.emitDebounced(1000 / delta);
    if (!this.paused) {
      this.seaTimeSeconds += delta * 0.001;
      this.seaTimeUniform.value = this.seaTimeSeconds;
    }

    this.renderer.setRenderTarget(this.resolveTarget);
    this.renderer.clear();
    this.resolveQuad.render(this.renderer);

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.lightingQuad.render(this.renderer);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  };

  destroy() {
    this.renderer.setAnimationLoop(null);
    for (const cleanup of this.cleanups) cleanup();
    for (const disposable of this.disposables) disposable.dispose();
    this.host.replaceChildren();
  }

  resize(width: number, height: number) {
    this.viewport.width = Math.max(width, 1);
    this.viewport.height = Math.max(height, 1);
    this.renderer.setSize(this.viewport.width, this.viewport.height, true);
    this.resolveTarget.setSize(this.viewport.width, this.viewport.height);
    this.viewportResolutionUniform.value.set(this.viewport.width, this.viewport.height);
    this.cameraState = resizeCameraState(this.cameraState, this.bundle.bounds, this.viewport);
    this.syncCamera();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.drag = null;
  }

  setLighting(settings: ThreeLightingSettings) {
    this.sunDirectionUniform.value.copy(getSunDirectionVector(settings));
    this.ambientUniform.value = settings.ambient;
    this.aliasingRadiusUniform.value = settings.aliasingRadiusTiles;
  }

  setSea(settings: ThreeSeaSettings) {
    this.seaModeUniform.value = settings.mode === "sea" ? 1 : 0;
    this.seaLevelFoamUniform.value.set(settings.waterLevelLevels, settings.foamWidthLevels);
    this.seaOpticsAUniform.value.set(
      settings.surfaceOpacity,
      settings.absorptionDepthLevels,
      settings.bottomVisibility,
      settings.refractionStrengthPx,
    );
    this.seaOpticsBUniform.value.set(
      settings.fresnelPower,
      settings.fresnelStrength,
      settings.specularStrength,
      settings.glintTightness,
    );
    setLinearColorVector(this.seaShallowColorUniform.value, settings.shallowColor);
    setLinearColorVector(this.seaDeepColorUniform.value, settings.deepColor);
    setLinearColorVector(this.seaFoamColorUniform.value, settings.foamColor);
    setLinearColorVector(this.seaCausticsColorUniform.value, settings.causticsColor);
    setLinearColorVector(this.seaSkyReflectionColorUniform.value, settings.skyReflectionColor);
    this.seaSwellAUniform.value.set(
      settings.swellA.amplitudeLevels,
      settings.swellA.wavelengthTiles,
      settings.swellA.speed,
      (settings.swellA.directionDeg * Math.PI) / 180,
    );
    this.seaSwellBUniform.value.set(
      settings.swellB.amplitudeLevels,
      settings.swellB.wavelengthTiles,
      settings.swellB.speed,
      (settings.swellB.directionDeg * Math.PI) / 180,
    );
    this.seaChopUniform.value.set(
      settings.chop.amplitudeLevels,
      settings.chop.wavelengthTiles,
      settings.chop.speed,
      (settings.chop.directionDeg * Math.PI) / 180,
    );
    this.seaRippleUniform.value.set(
      settings.ripple.normalStrength,
      settings.ripple.scale,
      settings.ripple.speed,
      0,
    );
    this.seaFoamAUniform.value.set(
      settings.foam.shoreStrength,
      settings.foam.crestStrength,
      settings.foam.softness,
      settings.foam.voronoiScale,
    );
    this.seaFoamBUniform.value.set(
      settings.foam.voronoiJitter,
      settings.foam.flowSpeed,
      settings.foam.warpStrength,
      0,
    );
    this.seaCausticsUniform.value.set(
      settings.caustics.strength,
      settings.caustics.scale,
      settings.caustics.speed,
      settings.caustics.depthFadeLevels,
    );
    this.seaQualityUniform.value.set(settings.quality.waveOctaves, settings.quality.voronoiOctaves);
  }

  setDebugView(view: ThreeDebugView) {
    this.debugViewUniform.value = getThreeDebugViewUniformValue(view);
  }

  setSeaDebugView(view: ThreeSeaDebugView) {
    this.seaDebugViewUniform.value = getThreeSeaDebugViewUniformValue(view);
  }
}

export async function startThreeApp(host: HTMLElement): Promise<ThreeTerrainApp> {
  return TerrainRuntime.create(host);
}
