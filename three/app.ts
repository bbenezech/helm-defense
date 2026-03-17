import * as THREE from "three/src/Three.WebGPU.js";
import { add, clamp, dot, float, instancedBufferAttribute, max, normalize, replaceDefaultUV, texture, uniform, uv, vec2, vec3 } from "three/src/Three.TSL.js";
import fpsBus from "../src/store/fps.ts";
import { loadTerrainAssetBundle } from "./assets.ts";
import { buildTerrainChunks } from "./chunks.ts";
import {
  clampCameraCenter,
  createInitialCameraState,
  getContinuousZoom,
  getDiscreteZoom,
  pickTile,
  resizeCameraState,
  screenPointToWorld,
  tileToScreen,
  type CameraState,
  type Viewport,
} from "./projection.ts";
import type { TerrainAssetBundle, TerrainChunk, ThreeTerrainApp } from "./types.ts";

const TILE_CHUNK_SIZE = 32;
const CAMERA_Z = 1000;
const DEPTH_SCALE = 0.01;
const PICK_DRAG_THRESHOLD_PX = 4;

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
  private readonly renderTarget: THREE.RenderTarget;
  private readonly selection: THREE.LineLoop;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly atlasTexture: THREE.Texture;
  private readonly surfaceTexture: THREE.DataTexture;
  private readonly viewport: Viewport;
  private cameraState: CameraState;
  private readonly cameraWorldUniform = uniform(new THREE.Vector2());
  private readonly cameraViewSizeUniform = uniform(new THREE.Vector2());
  private readonly mapHalfTileInvUniform;
  private readonly mapSizeInvUniform;
  private readonly sunDirectionUniform = uniform(new THREE.Vector3(0.35, -0.85, 0.8).normalize());
  private readonly sunTintUniform = uniform(new THREE.Vector3(0.22, 0.2, 0.16));
  private readonly chunks: TerrainChunk[];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly cleanups: Array<() => void> = [];
  private postQuad: THREE.QuadMesh | undefined;
  private paused = false;
  private drag:
    | {
        startPointer: { x: number; y: number };
        startCenter: { x: number; y: number };
        moved: boolean;
      }
    | undefined;
  private lastFrameAt = performance.now();

  constructor(host: HTMLElement, bundle: TerrainAssetBundle) {
    this.host = host;
    this.bundle = bundle;
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -CAMERA_Z, CAMERA_Z);
    this.renderTarget = new THREE.RenderTarget(1, 1);
    this.selection = new THREE.LineLoop();
    this.geometry = new THREE.PlaneGeometry(bundle.tileset.tilewidth, bundle.tileset.tileheight);
    this.atlasTexture = new THREE.TextureLoader().load(bundle.atlasUrl);
    this.surfaceTexture = new THREE.DataTexture(
      bundle.surface.data,
      bundle.surface.width,
      bundle.surface.height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this.viewport = {
      width: host.clientWidth || 1,
      height: host.clientHeight || 1,
    };
    this.cameraState = createInitialCameraState(bundle.bounds, this.viewport);
    this.mapHalfTileInvUniform = uniform(new THREE.Vector2(2 / bundle.map.tilewidth, 2 / bundle.map.tileheight));
    this.mapSizeInvUniform = uniform(new THREE.Vector2(1 / bundle.map.width, 1 / bundle.map.height));
    this.chunks = buildTerrainChunks(bundle, TILE_CHUNK_SIZE);
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

  private async init() {
    this.host.replaceChildren(this.renderer.domElement);
    await this.renderer.init();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.generateMipmaps = false;

    this.surfaceTexture.magFilter = THREE.NearestFilter;
    this.surfaceTexture.minFilter = THREE.NearestFilter;
    this.surfaceTexture.generateMipmaps = false;
    this.surfaceTexture.needsUpdate = true;

    this.disposables.push(this.renderer, this.renderTarget, this.geometry, this.atlasTexture, this.surfaceTexture);

    this.scene.background = new THREE.Color(0x00_00_00);
    this.setupChunks();
    this.setupSelection();
    this.setupPostProcessing();
    this.resize(this.viewport.width, this.viewport.height);
    this.bindEvents();
  }

  private setupChunks() {
    for (const chunk of this.chunks) {
      const offsets = new Float32Array(chunk.instances.length * 2);
      const scales = new Float32Array(chunk.instances.length * 2);
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true });
      const offsetNode = instancedBufferAttribute<"vec2">(new THREE.InstancedBufferAttribute(offsets, 2), "vec2");
      const scaleNode = instancedBufferAttribute<"vec2">(new THREE.InstancedBufferAttribute(scales, 2), "vec2");

      material.contextNode = replaceDefaultUV(() => add(offsetNode, uv().mul(scaleNode)));
      const atlasSample = texture(this.atlasTexture);
      material.colorNode = atlasSample.rgb;
      material.opacityNode = atlasSample.a;
      material.alphaTest = 0.5;

      const mesh = new THREE.InstancedMesh(this.geometry, material, chunk.instances.length);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      const matrix = new THREE.Matrix4();
      for (const [index, instance] of chunk.instances.entries()) {
        const offsetIndex = index * 2;
        offsets[offsetIndex] = instance.atlasRegion.offset.x;
        offsets[offsetIndex + 1] = instance.atlasRegion.offset.y;
        scales[offsetIndex] = instance.atlasRegion.scale.x;
        scales[offsetIndex + 1] = instance.atlasRegion.scale.y;
        matrix.makeTranslation(instance.screen.x, instance.screen.y, instance.depth * DEPTH_SCALE);
        mesh.setMatrixAt(index, matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.disposables.push(material, mesh);
    }
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
    this.selection.geometry = geometry;
    this.selection.material = material;
    this.selection.position.z = CAMERA_Z * 0.5;
    this.selection.visible = false;
    this.scene.add(this.selection);
    this.disposables.push(geometry, material);
  }

  private setupPostProcessing() {
    const postMaterial = new THREE.MeshBasicNodeMaterial();
    const scenePass = texture(this.renderTarget.texture);
    const screenUv = uv();
    const worldScreen = vec2(
      this.cameraWorldUniform.x.add(screenUv.x.mul(this.cameraViewSizeUniform.x)),
      this.cameraWorldUniform.y.add(float(1).sub(screenUv.y).mul(this.cameraViewSizeUniform.y)),
    );
    const tileCoord = vec2(
      worldScreen.x.mul(this.mapHalfTileInvUniform.x).add(worldScreen.y.mul(this.mapHalfTileInvUniform.y)).mul(0.5).sub(1),
      worldScreen.y.mul(this.mapHalfTileInvUniform.y).sub(worldScreen.x.mul(this.mapHalfTileInvUniform.x)).mul(0.5),
    );
    const mapUv = clamp(
      vec2(tileCoord.x.mul(this.mapSizeInvUniform.x), float(1).sub(tileCoord.y.add(0.5).mul(this.mapSizeInvUniform.y))),
      vec2(0.001, 0.001),
      vec2(0.999, 0.999),
    );
    const surfaceSample = texture(this.surfaceTexture, mapUv);
    const surfaceNormal = normalize(surfaceSample.rgb.mul(2).sub(1));
    const diffuse = max(dot(surfaceNormal, this.sunDirectionUniform), float(0));
    const ambient = surfaceSample.a.mul(0.25).add(0.82);
    const lighting = vec3(ambient, ambient, ambient)
      .add(this.sunTintUniform.mul(diffuse))
      .mul(surfaceSample.a.mul(0.12).add(0.94));

    postMaterial.colorNode = scenePass.rgb.mul(lighting);
    postMaterial.opacityNode = scenePass.a;
    this.postQuad = new THREE.QuadMesh(postMaterial);
    this.disposables.push(postMaterial);
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      this.drag = {
        startPointer: { x: event.clientX, y: event.clientY },
        startCenter: { ...this.cameraState.center },
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
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

    const onPointerUp = (event: PointerEvent) => {
      if (!this.drag) return;
      canvas.releasePointerCapture(event.pointerId);
      const pointer = this.drag;
      this.drag = undefined;
      if (pointer.moved || this.paused) return;

      const rect = canvas.getBoundingClientRect();
      const world = screenPointToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        this.cameraState,
        this.viewport,
      );
      const pickedTile = pickTile(this.bundle.map, world);
      this.updateSelection(pickedTile);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "+" || event.key === "=") {
        const zoom = getDiscreteZoom(this.cameraState.zoom, this.cameraState.zooms, 1);
        this.cameraState = { ...this.cameraState, zoom };
        this.syncCamera();
      } else if (event.key === "-") {
        const zoom = getDiscreteZoom(this.cameraState.zoom, this.cameraState.zooms, -1);
        this.cameraState = { ...this.cameraState, zoom };
        this.syncCamera();
      } else if (event.key === "0") {
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
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    globalThis.addEventListener("keydown", onKeyDown);

    this.cleanups.push(
      () => canvas.removeEventListener("pointerdown", onPointerDown),
      () => canvas.removeEventListener("pointermove", onPointerMove),
      () => canvas.removeEventListener("pointerup", onPointerUp),
      () => canvas.removeEventListener("wheel", onWheel),
      () => globalThis.removeEventListener("keydown", onKeyDown),
    );
  }

  private updateSelection(pickedTile: ReturnType<typeof pickTile>) {
    if (pickedTile === null) {
      this.selection.visible = false;
      return;
    }

    const screen = tileToScreen(this.bundle.map, { x: pickedTile.tileX, y: pickedTile.tileY }, pickedTile.offset);
    this.selection.position.set(screen.x, screen.y, CAMERA_Z * 0.5);
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
      this.cameraState.center.x - this.viewport.width * 0.5 / this.cameraState.zoom,
      this.cameraState.center.y - this.viewport.height * 0.5 / this.cameraState.zoom,
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

    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.postQuad?.render(this.renderer);
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
    this.renderTarget.setSize(
      Math.max(Math.round(this.viewport.width * this.renderer.getPixelRatio()), 1),
      Math.max(Math.round(this.viewport.height * this.renderer.getPixelRatio()), 1),
    );
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
