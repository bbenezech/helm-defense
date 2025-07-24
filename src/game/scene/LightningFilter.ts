import { ScaleModes } from "phaser";
import {} from "../lib/heightmap.js";
import type { GameScene } from "./game.js";
import { packTerrain, type Terrain } from "../lib/terrain.js";

const name = "LightningFilter";
class LightingFilter extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(
      name,
      manager,
      name,
      /*glsl*/ `
        precision mediump float;
        // Passed by Phaser
        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;
        uniform vec2 resolution; // The width and height of the screen/camera

        uniform sampler2D iChannel0; // The packed normal+height texture
        uniform float uTime;
        uniform float uZoom;
        uniform vec2 uPointer;
        uniform float uMinHeight;
        uniform float uMaxHeight;
        uniform vec2 uMetadataResolution;
        uniform vec2 uCameraWorld;
        uniform vec2 uHalfTileInv;
        uniform vec2 uMapTileSize;
        uniform float uParallaxAmount;

        vec2 screenToTile(vec2 screen) {
          vec2 worldPos = uCameraWorld + (vec2(screen.x, resolution.y - screen.y) / uZoom);
          vec2 tileCoord;
          tileCoord.x = (worldPos.x * uHalfTileInv.x + worldPos.y * uHalfTileInv.y) * 0.5 - 1.0;
          tileCoord.y = (worldPos.y * uHalfTileInv.y - worldPos.x * uHalfTileInv.x) * 0.5;
          return tileCoord / uMapTileSize;
        }

        void main() {          
          vec2 metadataUv = screenToTile(gl_FragCoord.xy);
          vec4 heightMetadata = texture2D(iChannel0, metadataUv);
          float height = heightMetadata.a * (uMaxHeight - uMinHeight) + uMinHeight;

          vec2 normalMetadataUv = screenToTile(vec2(gl_FragCoord.x, gl_FragCoord.y -  height));
          vec4 normalMetadata = texture2D(iChannel0, normalMetadataUv);

          vec3 normal;
          normal.x = normalMetadata.r * 2.0 - 1.0;
          normal.y = normalMetadata.g * 2.0 - 1.0;
          normal.z = normalMetadata.b * 2.0 - 1.0;

          vec4 originalColor = texture2D(uMainSampler, outTexCoord);

          float distance = distance(outTexCoord, uPointer/resolution);
          float radius = 0.2 * uZoom;
          float softness = radius/2.0;
          float lightAmount = 1.0 - smoothstep(radius, radius + softness, distance);

          // float inBounds = step(0.0, metadataUv.x) * step(0.0, metadataUv.y) * (1.0 - step(1.0, metadataUv.x)) * (1.0 - step(1.0, metadataUv.y));
          
          gl_FragColor = mix(originalColor, normalMetadata, 0.0);
        }
    `,
    );
  }
  resolution = [0, 0];
  override setupUniforms(controller: LightingFilterController, drawingContext: Phaser.Renderer.WebGL.DrawingContext) {
    this.resolution[0] = drawingContext.width;
    this.resolution[1] = drawingContext.height;
    this.programManager.setUniform("resolution", this.resolution);
    for (const _key in controller.uniforms) {
      const key = _key as keyof typeof controller.uniforms;
      const value = controller.uniforms[key];

      // console.log(`${key}:${JSON.stringify(value)}`);

      this.programManager.setUniform(key, value);
    }
  }

  override setupTextures(
    controller: LightingFilterController,
    textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[],
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ) {
    textures[1] = controller.metadataTexture!;
    super.setupTextures(controller, textures, drawingContext);
  }
}

export class LightingFilterController extends Phaser.Filters.Controller {
  metadataTexture: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper | null = null;
  uniforms = {
    iChannel0: 1,
    uPointer: [0, 0],
    uTime: 0,
    uZoom: 0,
    uMinHeight: 0,
    uMaxHeight: 0,
    uParallaxAmount: 18, // parallax ratio height to px
    uMetadataResolution: [0, 0],
    uCameraWorld: [0, 0], // The camera's top-left corner in world coordinates
    uHalfTileInv: [0, 0], // The inverse dimensions of a single tile (for isometric projection math)
    uMapTileSize: [0, 0], // The total size of the map in tiles
  };
  game: GameScene;

  constructor(game: GameScene, container: Phaser.GameObjects.Container) {
    super(container.filterCamera, name);
    this.game = game;
    container.enableFilters().filters!.internal.add(this);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer.renderNodes.hasNode(name)) renderer.renderNodes.addNodeConstructor(name, LightingFilter);
    const map = this.game.map;
    this.uniforms.uHalfTileInv[0] = 2 / map.tileWidth;
    this.uniforms.uHalfTileInv[1] = 2 / map.tileHeight;
    this.uniforms.uMapTileSize[0] = map.width;
    this.uniforms.uMapTileSize[1] = map.height;
  }

  setTerrain(terrain: Terrain) {
    const { imageData: image, maxHeight, minHeight } = packTerrain(terrain);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;

    renderer.gl.pixelStorei(renderer.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const texture = renderer.createTextureFromSource(
      new ImageData(image.data, image.width, image.height),
      image.width,
      image.height,
      ScaleModes.LINEAR,
      true, // renderer.gl.CLAMP_TO_EDGE : Tell the texture to not repeat at the edges
      false, // Sets the `UNPACK_FLIP_Y_WEBGL` to false
    )!;
    renderer.gl.pixelStorei(renderer.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

    this.metadataTexture = texture;
    this.uniforms.uMetadataResolution[0] = image.width;
    this.uniforms.uMetadataResolution[1] = image.height;
    this.uniforms.uMinHeight = minHeight;
    this.uniforms.uMaxHeight = maxHeight;
  }

  update(time: number, _delta: number) {
    const pointer = this.game.input.activePointer;
    const camera = this.game.cameras.main;
    this.uniforms.uPointer[0] = pointer.x;
    this.uniforms.uPointer[1] = camera.height - pointer.y;
    this.uniforms.uTime = time / 1000;
    this.uniforms.uZoom = camera.zoom;
    this.uniforms.uCameraWorld[0] = camera.worldView.x;
    this.uniforms.uCameraWorld[1] = camera.worldView.y;
  }
}
