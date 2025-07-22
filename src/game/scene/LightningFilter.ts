import { ScaleModes } from "phaser";
import { packMetadata, type Heightmap, type Normalmap } from "../lib/heightmap.js";
import type { GameScene } from "./game.js";

const name = "LightningFilter";
class LightingFilter extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(
      name,
      manager,
      name,
      /*glsl*/ `
        precision mediump float;

        uniform sampler2D uMainSampler;
        uniform sampler2D iChannel0;
        uniform float time;
        uniform float zoom;
        uniform vec2 pointer;
        uniform vec2 resolution;
        uniform float uMinHeight;
        uniform float uMaxHeight;
        uniform vec2 uMetadataResolution;

        varying vec2 outTexCoord;

        // gl_FragColor
        // gl_FragCoord

        void main() {
          vec4 originalColor = texture2D(uMainSampler, outTexCoord);
          vec4 metadata = texture2D(iChannel0, outTexCoord);
          vec3 normal;
          normal.x = (metadata.r * 2.0) - 1.0;
          normal.y = (metadata.g * 2.0) - 1.0;
          normal.z = (metadata.b * 2.0) - 1.0;
          float height = metadata.a * (uMaxHeight - uMinHeight) + uMinHeight;
          gl_FragColor = vec4(metadata.rgb, 1.0);

           // float distance = distance(outTexCoord, pointer/resolution);
           // float radius = 0.5 * zoom;
           // float softness = radius/2.0;
           // float lightAmount = 1.0 - smoothstep(radius, radius + softness, distance);
           // vec3 finalColor = originalColor.rgb * lightAmount;
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
    pointer: [0, 0],
    time: 0,
    zoom: 0,
    uMinHeight: 0,
    uMaxHeight: 0,
    uMetadataResolution: [0, 0],
  };
  game: GameScene;

  constructor(game: GameScene, container: Phaser.GameObjects.Container) {
    super(container.filterCamera, name);
    this.game = game;
    container.enableFilters().filters!.internal.add(this);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer.renderNodes.hasNode(name)) renderer.renderNodes.addNodeConstructor(name, LightingFilter);
  }

  setMetadata(heightmap: Heightmap, normalmap: Normalmap) {
    const { imageData: image, maxHeight, minHeight } = packMetadata(heightmap, normalmap);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    // Disable premultiplied alpha for the metadata texture to ensure normal map colors are untouched.
    renderer.gl.pixelStorei(renderer.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const texture = renderer.createTextureFromSource(
      new ImageData(image.data, image.width, image.height),
      image.width,
      image.height,
      ScaleModes.LINEAR,
    );
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

    this.uniforms.zoom = camera.zoom;
    this.uniforms.pointer[0] = pointer.x;
    this.uniforms.pointer[1] = camera.height - pointer.y;
    // this.uniforms.map[0] = this.game.bounds.width;
    // this.uniforms.map[1] = this.game.bounds.height;
    // this.uniforms.mapPointer[0] = pointer.worldX - this.game.bounds.x;
    // this.uniforms.mapPointer[1] = this.game.bounds.height - (pointer.worldY - this.game.bounds.y);
    this.uniforms.time = time / 1000;
  }
}
