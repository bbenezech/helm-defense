import * as THREE from "three/src/Three.WebGPU.js";
import fpsBus from "../src/store/fps.ts";
import { loadTerrainAssetBundle, type TerrainAssetBundle, type TerrainMap } from "./assets.ts";
import type { ResolveHit } from "./codec.ts";
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

export type ThreeLightingSettings = { sunAzimuthDeg: number; sunElevationDeg: number; ambient: number };

export type ThreeDebugView = "terrain" | "checker-compare";

export type ThreeTerrainApp = {
  destroy: () => void;
  resize: (width: number, height: number) => void;
  setPaused: (paused: boolean) => void;
  setLighting: (settings: ThreeLightingSettings) => void;
  setDebugView: (view: ThreeDebugView) => void;
  setDebugSurfaceGridVisible: (visible: boolean) => void;
};

const CAMERA_Z = 1000;
const PICK_DRAG_THRESHOLD_PX = 4;
const SHAPE_REF_MASK = 0b1_1111;
const BIOME_INDEX_SHIFT = 5;
const BIOME_INDEX_MASK = 0xff;
const PAINTER_RANK_SHIFT = 13;
const { textureLoad, uniform, vec2, vec4, viewportUV, wgslFn } = THREE.TSL;
const SURFACE_GROUND_SEARCH_ITERATIONS = 16;
const CHECKER_CELLS_PER_TILE = 4;
const SURFACE_CHECKER_OVERLAY_ALPHA = 0.7;
const DEFAULT_SUN_DIRECTION = new THREE.Vector3(0.4, -1, 0.7).normalize();
const DEFAULT_SUN_AZIMUTH_DEG = (Math.atan2(DEFAULT_SUN_DIRECTION.y, DEFAULT_SUN_DIRECTION.x) * 180) / Math.PI;
const DEFAULT_SUN_ELEVATION_DEG =
  (Math.atan2(DEFAULT_SUN_DIRECTION.z, Math.hypot(DEFAULT_SUN_DIRECTION.x, DEFAULT_SUN_DIRECTION.y)) * 180) / Math.PI;

export const DEFAULT_THREE_DEBUG_VIEW: ThreeDebugView = "terrain";
export const DEFAULT_THREE_LIGHTING_SETTINGS: ThreeLightingSettings = {
  sunAzimuthDeg: DEFAULT_SUN_AZIMUTH_DEG,
  sunElevationDeg: DEFAULT_SUN_ELEVATION_DEG,
  ambient: 0.6,
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

function getCheckerCellSize(size: number): number {
  if (size <= 0) throw new Error(`Checker size must be greater than zero, received ${size}.`);
  return size / CHECKER_CELLS_PER_TILE;
}

export function getSurfaceCheckerCellSize(precision: number): number {
  const cellSize = getCheckerCellSize(precision);
  if (!Number.isInteger(cellSize)) {
    throw new TypeError(
      `Surface checker cell size must be an integer, received ${cellSize} from precision ${precision}.`,
    );
  }
  return cellSize;
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

export function getSurfaceHeightImpactOnScreenY(mapTileHeight: number, precision: number): number {
  if (mapTileHeight <= 0) {
    throw new Error(`Terrain map tile height must be greater than zero, received ${mapTileHeight}.`);
  }
  if (precision <= 0) {
    throw new Error(`Terrain surface precision must be greater than zero, received ${precision}.`);
  }
  return ((5 / 4) * mapTileHeight) / precision;
}

function getThreeDebugViewUniformValue(view: ThreeDebugView): number {
  switch (view) {
    case "terrain": {
      return 0;
    }
    case "checker-compare": {
      return 1;
    }
    default: {
      const exhaustiveView: never = view;
      throw new Error(`Unexpected Three debug view "${exhaustiveView}".`);
    }
  }
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

  setDebugView(_view: ThreeDebugView) {}

  setDebugSurfaceGridVisible(_visible: boolean) {}
}

class TerrainRuntime implements ThreeTerrainApp {
  private readonly host: HTMLElement;
  private readonly bundle: TerrainAssetBundle;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly selection: THREE.LineLoop;
  private readonly terrainMaterial: THREE.MeshBasicNodeMaterial;
  private readonly terrainQuad: THREE.QuadMesh;
  private readonly viewport: Viewport;
  private cameraState: CameraState;
  private readonly cameraWorldUniform = uniform(new THREE.Vector2());
  private readonly cameraViewSizeUniform = uniform(new THREE.Vector2());
  private readonly sunDirectionUniform = uniform(getSunDirectionVector(DEFAULT_THREE_LIGHTING_SETTINGS));
  private readonly ambientUniform = uniform(DEFAULT_THREE_LIGHTING_SETTINGS.ambient);
  private readonly debugViewUniform = uniform(getThreeDebugViewUniformValue(DEFAULT_THREE_DEBUG_VIEW));
  private readonly debugSurfaceGridUniform = uniform(true);
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly cleanups: Array<() => void> = [];
  private paused = false;
  private drag:
    | { startPointer: { x: number; y: number }; startCenter: { x: number; y: number }; moved: boolean }
    | undefined;
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
    this.terrainMaterial = this.createTerrainMaterial();
    this.terrainQuad = new THREE.QuadMesh(this.terrainMaterial);
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

  private createTerrainMaterial(): THREE.MeshBasicNodeMaterial {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    const halfTileWidth = this.bundle.map.tilewidth * 0.5;
    const halfTileHeight = this.bundle.map.tileheight * 0.5;
    const mapWidth = this.bundle.map.width;
    const mapHeight = this.bundle.map.height;
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
    const surfaceWidth = this.bundle.surface.width;
    const surfaceHeight = this.bundle.surface.height;
    const surfaceMinHeight = this.bundle.surface.minHeight;
    const surfaceMaxHeight = this.bundle.surface.maxHeight;
    const surfaceHeightImpactOnScreenY = getSurfaceHeightImpactOnScreenY(
      this.bundle.map.tileheight,
      this.bundle.surface.precision,
    );
    const surfaceCheckerCellSize = getSurfaceCheckerCellSize(this.bundle.surface.precision);

    const resolveTerrain = wgslFn(/* wgsl */ `
      fn resolveTerrain(
        screen: vec2<f32>,
        packedMap: texture_2d_array<f32>,
        atlas: texture_2d_array<f32>,
        checkerAtlas: texture_2d_array<f32>,
        surface: texture_2d<f32>,
        sunDirection: vec3<f32>,
        ambient: f32,
        debugView: f32,
        debugSurfaceGrid: f32,
      ) -> vec4<f32> {
        let pixelX = i32(floor(screen.x));
        let pixelY = i32(floor(screen.y));
        let stripeRight = i32(floor(f32(pixelX) / ${halfTileWidth.toFixed(1)}));
        let surfaceScreen = vec2<f32>(screen.x, screen.y + ${surfaceSampleOffsetY.toFixed(1)});
        let groundY = solveGroundScreenY(surfaceScreen, surface);
        let surfaceMapUV = worldToMapUV(vec2<f32>(surfaceScreen.x, groundY));
        let surfaceTexelCoord = getSurfaceTexelCoord(surfaceMapUV);
        let surfaceTexel = averageSurfaceSamples(surface, surfaceMapUV);
        let surfaceNormal = decodeSurfaceNormal(surfaceTexel);
        let diffuse = max(dot(surfaceNormal, sunDirection), 0.0);
        let shade = ambient + (1.0 - ambient) * diffuse;
        var bestRank = 0u;
        var found = false;
        var winnerAtlasX = 0;
        var winnerAtlasY = 0;
        var winnerBiomeIndex = 0;

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
              let word =
                u32(packedTexel.r * 255.0 + 0.5) |
                (u32(packedTexel.g * 255.0 + 0.5) << 8u) |
                (u32(packedTexel.b * 255.0 + 0.5) << 16u) |
                (u32(packedTexel.a * 255.0 + 0.5) << 24u);
              let shapeRef = word & ${SHAPE_REF_MASK}u;

              if (shapeRef == 0u) {
                continue;
              }

              let biomeIndex = (word >> ${BIOME_INDEX_SHIFT}u) & ${BIOME_INDEX_MASK}u;
              let painterRank = word >> ${PAINTER_RANK_SHIFT}u;
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
              let checkerAtlasTexel = textureLoad(checkerAtlas, vec2<i32>(atlasX, atlasY), i32(biomeIndex), 0);

              if (checkerAtlasTexel.a <= 0.0) {
                continue;
              }

              if (!found || painterRank > bestRank) {
                found = true;
                bestRank = painterRank;
                winnerAtlasX = atlasX;
                winnerAtlasY = atlasY;
                winnerBiomeIndex = i32(biomeIndex);
              }
            }
          }
        }

        if (!found) {
          return vec4<f32>(0.0, 0.0, 0.0, 0.0);
        }

        let winnerCheckerAtlasTexel = textureLoad(checkerAtlas, vec2<i32>(winnerAtlasX, winnerAtlasY), winnerBiomeIndex, 0);
        let winnerBeautyAtlasTexel = textureLoad(atlas, vec2<i32>(winnerAtlasX, winnerAtlasY), winnerBiomeIndex, 0);
        var resolvedRgb = decodeTerrainColor(winnerBeautyAtlasTexel) * shade;
        var resolvedAlpha = winnerCheckerAtlasTexel.a;

        if (debugView >= 0.5) {
          resolvedRgb = decodeTerrainColor(winnerCheckerAtlasTexel) * shade;
          resolvedAlpha = winnerCheckerAtlasTexel.a;

          if (
            debugSurfaceGrid >= 0.5 &&
            winnerCheckerAtlasTexel.a > 0.75 &&
            isSurfaceCheckerMismatch(winnerCheckerAtlasTexel, surfaceTexelCoord)
          ) {
            resolvedRgb = mix(resolvedRgb, vec3<f32>(0.0, 1.0, 1.0), ${SURFACE_CHECKER_OVERLAY_ALPHA.toFixed(8)});
          }
        }

        return vec4<f32>(resolvedRgb, resolvedAlpha);
      }

      fn worldToMapUV(world: vec2<f32>) -> vec2<f32> {
        let halfTileWidthInv = ${(2 / this.bundle.map.tilewidth).toFixed(8)};
        let halfTileHeightInv = ${(2 / this.bundle.map.tileheight).toFixed(8)};
        let tileX = (world.x * halfTileWidthInv + world.y * halfTileHeightInv) * 0.5 - 1.0;
        let tileY = (world.y * halfTileHeightInv - world.x * halfTileWidthInv) * 0.5;
        return vec2<f32>(tileX / ${mapWidth.toFixed(1)}, tileY / ${mapHeight.toFixed(1)});
      }

      fn getSurfaceTexelPosition(mapUV: vec2<f32>) -> vec2<f32> {
        let clampedMapUV = clamp(mapUV, vec2<f32>(0.0, 0.0), vec2<f32>(0.999999, 0.999999));
        return vec2<f32>(clampedMapUV.x * ${surfaceWidth.toFixed(1)}, clampedMapUV.y * ${surfaceHeight.toFixed(1)});
      }

      fn getSurfaceTexelCoord(mapUV: vec2<f32>) -> vec2<i32> {
        let surfaceTexelPosition = getSurfaceTexelPosition(mapUV);
        let texelX = i32(floor(surfaceTexelPosition.x));
        let texelY = i32(floor(surfaceTexelPosition.y));
        return vec2<i32>(texelX, texelY);
      }

      fn sampleSurface(surface: texture_2d<f32>, surfaceTexelCoord: vec2<i32>) -> vec4<f32> {
        return textureLoad(surface, surfaceTexelCoord, 0);
      }

      fn sampleSurfaceLinear(surface: texture_2d<f32>, mapUV: vec2<f32>) -> vec4<f32> {
        let clampedMapUV = clamp(mapUV, vec2<f32>(0.0, 0.0), vec2<f32>(0.999999, 0.999999));
        let texelPosition =
          clampedMapUV * vec2<f32>(${surfaceWidth.toFixed(1)}, ${surfaceHeight.toFixed(1)}) - vec2<f32>(0.5, 0.5);
        let baseX = i32(floor(texelPosition.x));
        let baseY = i32(floor(texelPosition.y));
        let frac = fract(texelPosition);
        let x0 = clamp(baseX, 0, ${surfaceWidth - 1});
        let y0 = clamp(baseY, 0, ${surfaceHeight - 1});
        let x1 = clamp(baseX + 1, 0, ${surfaceWidth - 1});
        let y1 = clamp(baseY + 1, 0, ${surfaceHeight - 1});
        let surface00 = sampleSurface(surface, vec2<i32>(x0, y0));
        let surface10 = sampleSurface(surface, vec2<i32>(x1, y0));
        let surface01 = sampleSurface(surface, vec2<i32>(x0, y1));
        let surface11 = sampleSurface(surface, vec2<i32>(x1, y1));
        let surfaceTop = mix(surface00, surface10, frac.x);
        let surfaceBottom = mix(surface01, surface11, frac.x);
        return mix(surfaceTop, surfaceBottom, frac.y);
      }

      fn averageSurfaceSamples(surface: texture_2d<f32>, mapUV: vec2<f32>) -> vec4<f32> {
        let sampleOffset = vec2<f32>(${(0.5 / surfaceWidth).toFixed(8)}, ${(0.5 / surfaceHeight).toFixed(8)});
        let surfaceNorth = sampleSurfaceLinear(surface, mapUV + vec2<f32>(0.0, sampleOffset.y));
        let surfaceSouth = sampleSurfaceLinear(surface, mapUV - vec2<f32>(0.0, sampleOffset.y));
        let surfaceEast = sampleSurfaceLinear(surface, mapUV + vec2<f32>(sampleOffset.x, 0.0));
        let surfaceWest = sampleSurfaceLinear(surface, mapUV - vec2<f32>(sampleOffset.x, 0.0));
        return (surfaceNorth + surfaceSouth + surfaceEast + surfaceWest) * 0.25;
      }

      fn decodeSurfaceHeight(surfaceTexel: vec4<f32>) -> f32 {
        return surfaceTexel.a * ${(surfaceMaxHeight - surfaceMinHeight).toFixed(8)} + ${surfaceMinHeight.toFixed(8)};
      }

      fn decodeSurfaceNormal(surfaceTexel: vec4<f32>) -> vec3<f32> {
        let rotation45Cos = ${Math.SQRT1_2.toFixed(8)};
        let rotation45Sin = ${Math.SQRT1_2.toFixed(8)};
        let packedNormal = surfaceTexel.rgb * 2.0 - vec3<f32>(1.0, 1.0, 1.0);
        let packedNormalLengthSq = dot(packedNormal, packedNormal);

        if (packedNormalLengthSq <= 0.000001) {
          return vec3<f32>(0.0, 0.0, 1.0);
        }

        let normalizedPackedNormal = normalize(packedNormal);
        let rotatedNormal = vec3<f32>(
          rotation45Cos * normalizedPackedNormal.x - rotation45Sin * normalizedPackedNormal.y,
          rotation45Sin * normalizedPackedNormal.x + rotation45Cos * normalizedPackedNormal.y,
          normalizedPackedNormal.z,
        );
        return normalize(rotatedNormal);
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

      fn getSurfaceCheckerParity(surfaceTexelCoord: vec2<i32>) -> i32 {
        let checkerX = surfaceTexelCoord.x / ${surfaceCheckerCellSize.toFixed(0)};
        let checkerY = surfaceTexelCoord.y / ${surfaceCheckerCellSize.toFixed(0)};
        return (checkerX + checkerY) & 1;
      }

      fn getCheckerAtlasParity(checkerAtlasTexel: vec4<f32>) -> i32 {
        return select(1, 0, checkerAtlasTexel.r >= 0.5);
      }

      fn isSurfaceCheckerMismatch(checkerAtlasTexel: vec4<f32>, surfaceTexelCoord: vec2<i32>) -> bool {
        return getCheckerAtlasParity(checkerAtlasTexel) != getSurfaceCheckerParity(surfaceTexelCoord);
      }

      fn solveGroundScreenY(screen: vec2<f32>, surface: texture_2d<f32>) -> f32 {
        var minY = screen.y;
        var maxY = screen.y + ${((surfaceMaxHeight - surfaceMinHeight) * surfaceHeightImpactOnScreenY).toFixed(8)};
        var groundY = screen.y;

        for (var iteration = 0; iteration < ${SURFACE_GROUND_SEARCH_ITERATIONS}; iteration++) {
          groundY = (minY + maxY) * 0.5;
          let surfaceTexel = sampleSurfaceLinear(surface, worldToMapUV(vec2<f32>(screen.x, groundY)));
          let height = decodeSurfaceHeight(surfaceTexel);
          let occlusionPoint = groundY - height * ${surfaceHeightImpactOnScreenY.toFixed(8)};

          if (occlusionPoint >= screen.y) {
            maxY = groundY;
          } else {
            minY = groundY;
          }
        }

        return (minY + maxY) * 0.5;
      }
    `);
    const screen = vec2(
      this.cameraWorldUniform.x.add(viewportUV.x.mul(this.cameraViewSizeUniform.x)),
      this.cameraWorldUniform.y.add(viewportUV.y.mul(this.cameraViewSizeUniform.y)),
    );
    const terrainColor = vec4(
      resolveTerrain({
        screen,
        packedMap: textureLoad(this.bundle.packedTerrain.texture),
        atlas: textureLoad(this.bundle.colorAtlas.texture),
        checkerAtlas: textureLoad(this.bundle.checkerAtlas.texture),
        surface: textureLoad(this.bundle.surface.texture),
        sunDirection: this.sunDirectionUniform,
        ambient: this.ambientUniform,
        debugView: this.debugViewUniform,
        debugSurfaceGrid: this.debugSurfaceGridUniform,
      }),
    );

    material.colorNode = terrainColor.rgb;
    material.opacityNode = terrainColor.a;

    return material;
  }

  private async init() {
    this.host.replaceChildren(this.renderer.domElement);
    await this.renderer.init();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x00_00_00, 0);

    this.bundle.colorAtlas.texture.colorSpace = THREE.NoColorSpace;
    this.bundle.colorAtlas.texture.magFilter = THREE.NearestFilter;
    this.bundle.colorAtlas.texture.minFilter = THREE.NearestFilter;
    this.bundle.colorAtlas.texture.generateMipmaps = false;
    this.bundle.colorAtlas.texture.needsUpdate = true;

    this.bundle.checkerAtlas.texture.colorSpace = THREE.NoColorSpace;
    this.bundle.checkerAtlas.texture.magFilter = THREE.NearestFilter;
    this.bundle.checkerAtlas.texture.minFilter = THREE.NearestFilter;
    this.bundle.checkerAtlas.texture.generateMipmaps = false;
    this.bundle.checkerAtlas.texture.needsUpdate = true;

    this.bundle.surface.texture.colorSpace = THREE.NoColorSpace;
    this.bundle.surface.texture.magFilter = THREE.NearestFilter;
    this.bundle.surface.texture.minFilter = THREE.NearestFilter;
    this.bundle.surface.texture.generateMipmaps = false;
    this.bundle.surface.texture.needsUpdate = true;

    this.bundle.packedTerrain.texture.colorSpace = THREE.NoColorSpace;
    this.bundle.packedTerrain.texture.magFilter = THREE.NearestFilter;
    this.bundle.packedTerrain.texture.minFilter = THREE.NearestFilter;
    this.bundle.packedTerrain.texture.generateMipmaps = false;
    this.bundle.packedTerrain.texture.needsUpdate = true;

    this.disposables.push(
      this.renderer,
      this.terrainMaterial,
      this.bundle.colorAtlas.texture,
      this.bundle.checkerAtlas.texture,
      this.bundle.surface.texture,
      this.bundle.packedTerrain.texture,
    );

    this.setupSelection();
    this.resize(this.viewport.width, this.viewport.height);
    this.setLighting(DEFAULT_THREE_LIGHTING_SETTINGS);
    this.setDebugView(DEFAULT_THREE_DEBUG_VIEW);
    this.setDebugSurfaceGridVisible(true);
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
    if (!this.drag || this.paused) return;
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
    if (!this.drag) return;
    this.renderer.domElement.releasePointerCapture(event.pointerId);
    const pointer = this.drag;
    this.drag = undefined;
    if (pointer.moved || this.paused) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const world = screenPointToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.cameraState,
      this.viewport,
    );
    const hit = this.bundle.codec.resolveVisibleTile(this.bundle.checkerAtlas, world.x, world.y);
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

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.terrainQuad.render(this.renderer);
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
    this.cameraState = resizeCameraState(this.cameraState, this.bundle.bounds, this.viewport);
    this.syncCamera();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.drag = undefined;
  }

  setLighting(settings: ThreeLightingSettings) {
    this.sunDirectionUniform.value.copy(getSunDirectionVector(settings));
    this.ambientUniform.value = settings.ambient;
  }

  setDebugView(view: ThreeDebugView) {
    this.debugViewUniform.value = getThreeDebugViewUniformValue(view);
  }

  setDebugSurfaceGridVisible(visible: boolean) {
    this.debugSurfaceGridUniform.value = visible;
  }
}

export async function startThreeApp(host: HTMLElement): Promise<ThreeTerrainApp> {
  return TerrainRuntime.create(host);
}
