import { PERSPECTIVE_INDEX } from "../constants.js";
import { packTerrain, type Terrain } from "../lib/terrain.js";
import type { GameScene } from "./game.js";
import shaderString from "./lightningShader.frag?raw";

const name = "LightningFilter";
class LightingFilter extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(name, manager, name, shaderString);
  }

  uResolution = [0, 0];
  uMainTexelSize = [0, 0];
  override setupUniforms(controller: LightingFilterController, drawingContext: Phaser.Renderer.WebGL.DrawingContext) {
    this.uResolution[0] = drawingContext.width;
    this.uResolution[1] = drawingContext.height;

    this.uMainTexelSize[0] = 1 / drawingContext.width;
    this.uMainTexelSize[1] = 1 / drawingContext.height;

    this.programManager.setUniform("uResolution", this.uResolution);
    this.programManager.setUniform("uMainTexelSize", this.uMainTexelSize);

    for (const _key in controller.uniforms) {
      const key = _key as keyof typeof controller.uniforms;
      const value = controller.uniforms[key];
      this.programManager.setUniform(key, value);
    }
  }

  override setupTextures(
    controller: LightingFilterController,
    textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[],
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ) {
    textures[1] = controller.surfaceTexture;
    super.setupTextures(controller, textures, drawingContext);
  }
}

export class LightingFilterController extends Phaser.Filters.Controller {
  surfaceTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
  uniforms = {
    iChannel0: 1,
    uCameraPointer: [0, 0],
    uTime: 0,
    uSurfaceMinHeight: 0,
    uSurfaceMaxHeight: 0,
    uCameraZoomInv: 0,
    uCameraWorld: [0, 0], // The camera's top-left corner in world coordinates
    uMapHalfTileInv: [0, 0], // The inverse dimensions of a single tile (for isometric projection math)
    uMapSizeInTileInv: [0, 0],
    uSurfaceHeightImpactOnScreenY: 0, // The factor by which the height affects the Y coordinate in screen space
    uSurfaceTexelSize: [0, 0], // The size of a single texel in the surface texture
    uCameraAngle: 0,
  };
  renderer: Phaser.Renderer.WebGL.WebGLRenderer;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    map: Phaser.Tilemaps.Tilemap,
    terrain: Terrain,
  ) {
    super(container.filterCamera, name);
    const filters = container.enableFilters().filters;
    if (!filters) throw new Error("No filters?");
    filters.internal.add(this);
    const renderer = scene.renderer;
    if (!("renderNodes" in renderer)) throw new Error("Not webgl?");
    this.renderer = renderer;
    if (!renderer.renderNodes.hasNode(name)) renderer.renderNodes.addNodeConstructor(name, LightingFilter);

    this.uniforms.uMapHalfTileInv[0] = 2 / map.tileWidth;
    this.uniforms.uMapHalfTileInv[1] = 2 / map.tileHeight;
    this.uniforms.uMapSizeInTileInv[0] = 1 / map.width;
    this.uniforms.uMapSizeInTileInv[1] = 1 / map.height;

    const { imageData: surfaceImageData, maxHeight, minHeight, precision } = packTerrain(terrain);
    this.surfaceTexture = this.renderer.createTexture2D(
      0,
      this.renderer.gl.LINEAR,
      this.renderer.gl.LINEAR,
      this.renderer.gl.CLAMP_TO_EDGE,
      this.renderer.gl.CLAMP_TO_EDGE,
      this.renderer.gl.RGBA,
      new ImageData(surfaceImageData.data, surfaceImageData.width, surfaceImageData.height),
      undefined,
      undefined,
      false, // do not premultiply alpha
      undefined,
      false, // do not flip Y
    );
    this.uniforms.uSurfaceMinHeight = minHeight;
    this.uniforms.uSurfaceMaxHeight = maxHeight;
    this.uniforms.uSurfaceTexelSize[0] = 1 / surfaceImageData.width;
    this.uniforms.uSurfaceTexelSize[1] = 1 / surfaceImageData.height;
    this.uniforms.uSurfaceHeightImpactOnScreenY = ((5 / 4) * map.tileHeight) / precision; // the height of a cube in our perspective is tile height + layer Y offset, wich is 1/4 of the tile height
  }

  update(gameScene: GameScene, time: number) {
    const pointer = gameScene.input.activePointer;
    const camera = gameScene.cameras.main;
    const bounds = gameScene.bounds;

    this.uniforms.uCameraPointer[0] = pointer.x;
    this.uniforms.uCameraPointer[1] = camera.height - pointer.y;
    this.uniforms.uTime = time * 0.001;

    const invZoom = 1 / camera.zoom;
    // do not use camera.worldView, it is lagging...
    let worldViewX = camera.scrollX + camera.centerX * (1 - invZoom);
    let worldViewY = camera.scrollY + camera.centerY * (1 - invZoom);

    // The maximum position is the map's far edge minus the current viewport width
    const minWorldX = bounds.x;
    const minWorldY = bounds.y;
    const maxWorldX = bounds.x + bounds.width - camera.width * invZoom;
    const maxWorldY = bounds.y + bounds.height - camera.height * invZoom;

    // fix scroll overshoot (the camera does not scroll past the map bounds, but scrollX/Y do account for overshooting...)
    worldViewX = Math.max(minWorldX, Math.min(worldViewX, maxWorldX));
    worldViewY = Math.max(minWorldY, Math.min(worldViewY, maxWorldY));

    this.uniforms.uCameraZoomInv = invZoom;
    this.uniforms.uCameraWorld[0] = worldViewX;
    this.uniforms.uCameraWorld[1] = worldViewY;
    this.uniforms.uCameraAngle = PERSPECTIVE_INDEX[gameScene.perspective];
  }
}
