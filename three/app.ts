import * as THREE from "three/src/Three.WebGPU.js";
import {
  texture,
  uniform,
  vec2,
  vec4,
  viewportUV,
  wgslFn,
} from "three/src/Three.TSL.js";
import fpsBus from "../src/store/fps.ts";
import { loadTerrainAssetBundle, type TerrainAssetBundle } from "./assets.ts";
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

export type ThreeTerrainApp = {
  destroy: () => void;
  resize: (width: number, height: number) => void;
  setPaused: (paused: boolean) => void;
};

const CAMERA_Z = 1000;
const PICK_DRAG_THRESHOLD_PX = 4;
const SHAPE_REF_MASK = 0b1_1111;
const BIOME_INDEX_SHIFT = 5;
const BIOME_INDEX_MASK = 0xff;
const PAINTER_RANK_SHIFT = 13;

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
    this.renderer.setAnimationLoop(this.render);
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
    const frameTopOffset = this.bundle.tileset.tileheight - this.bundle.map.tileheight;
    const elevationStep = this.bundle.elevationYOffsetPx;
    const packedOriginX = this.bundle.packedTerrain.stack.origin.x;
    const packedOriginY = this.bundle.packedTerrain.stack.origin.y;
    const packedWidth = this.bundle.packedTerrain.stack.width;
    const packedHeight = this.bundle.packedTerrain.stack.height;
    const columns = this.bundle.tileset.columns;
    const spacing = this.bundle.tileset.spacing;
    const margin = this.bundle.tileset.margin;
    const tileWidth = this.bundle.tileset.tilewidth;
    const tileHeight = this.bundle.tileset.tileheight;

    const resolveTerrain = wgslFn(`
      fn srgbChannelToLinear(channel: f32) -> f32 {
        if (channel <= 0.04045) {
          return channel / 12.92;
        }

        return pow((channel + 0.055) / 1.055, 2.4);
      }

      fn resolveTerrain(screen: vec2<f32>, packedMap: texture_2d_array<u32>, atlas: texture_2d_array<f32>) -> vec4<f32> {
        let pixelX = i32(floor(screen.x));
        let pixelY = i32(floor(screen.y));
        let stripeRight = i32(floor(f32(pixelX) / ${halfTileWidth.toFixed(1)}));
        var bestColor = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        var bestRank = 0u;
        var found = false;

        for (var stripeIndex = 0; stripeIndex < 2; stripeIndex++) {
          let d = stripeRight + stripeIndex - 1;

          for (var slice = 0; slice < 8; slice++) {
            let baseS = i32(floor(f32(pixelY + ${frameTopOffset} + slice * ${elevationStep}) / ${halfTileHeight.toFixed(1)}));

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

              let word = textureLoad(packedMap, vec2<i32>(textureX, textureY), slice, 0u).x;
              let shapeRef = word & ${SHAPE_REF_MASK}u;

              if (shapeRef == 0u) {
                continue;
              }

              let biomeIndex = (word >> ${BIOME_INDEX_SHIFT}u) & ${BIOME_INDEX_MASK}u;
              let painterRank = word >> ${PAINTER_RANK_SHIFT}u;
              let tileId = i32(shapeRef) - 1;
              let localX = pixelX - d * ${halfTileWidth};
              let localY = pixelY - (s * ${halfTileHeight} - ${frameTopOffset} - slice * ${elevationStep});

              if (localX < 0 || localY < 0 || localX >= ${tileWidth} || localY >= ${tileHeight}) {
                continue;
              }

              let column = tileId % ${columns};
              let row = tileId / ${columns};
              let atlasX = ${margin} + column * ${tileWidth + spacing} + localX;
              let atlasY = ${margin} + row * ${tileHeight + spacing} + localY;
              let atlasTexel = textureLoad(atlas, vec2<i32>(atlasX, atlasY), i32(biomeIndex), 0u);

              if (atlasTexel.a <= 0.0) {
                continue;
              }

              if (!found || painterRank > bestRank) {
                found = true;
                bestRank = painterRank;
                bestColor = vec4<f32>(
                  srgbChannelToLinear(atlasTexel.r),
                  srgbChannelToLinear(atlasTexel.g),
                  srgbChannelToLinear(atlasTexel.b),
                  atlasTexel.a
                );
              }
            }
          }
        }

        return bestColor;
      }
    `);
    const screen = vec2(
      this.cameraWorldUniform.x.add(viewportUV.x.mul(this.cameraViewSizeUniform.x)),
      this.cameraWorldUniform.y.add(viewportUV.y.mul(this.cameraViewSizeUniform.y)),
    );
    const terrainColor = vec4(resolveTerrain({
      screen,
      packedMap: texture(this.bundle.packedTerrain.texture),
      atlas: texture(this.bundle.colorAtlas.texture),
    }));

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

    this.bundle.packedTerrain.texture.colorSpace = THREE.NoColorSpace;
    this.bundle.packedTerrain.texture.magFilter = THREE.NearestFilter;
    this.bundle.packedTerrain.texture.minFilter = THREE.NearestFilter;
    this.bundle.packedTerrain.texture.generateMipmaps = false;
    this.bundle.packedTerrain.texture.needsUpdate = true;

    this.disposables.push(
      this.renderer,
      this.terrainMaterial,
      this.bundle.colorAtlas.texture,
      this.bundle.packedTerrain.texture,
    );

    this.setupSelection();
    this.resize(this.viewport.width, this.viewport.height);
    this.bindEvents();
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
}

export async function startThreeApp(host: HTMLElement): Promise<ThreeTerrainApp> {
  return TerrainRuntime.create(host);
}
