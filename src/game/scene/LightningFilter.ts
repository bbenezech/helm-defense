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
        uniform float time;
        uniform float zoom;
        uniform vec2 pointer;
        uniform vec2 resolution;
        varying vec2 outTexCoord;
        // gl_FragColor
        // gl_FragCoord

        void main() {
            vec4 originalColor = texture2D(uMainSampler, outTexCoord);
            float distance = distance(outTexCoord, pointer/resolution);
            float radius = 0.5 * zoom;
            float softness = radius/2.0;
            float lightAmount = 1.0 - smoothstep(radius, radius + softness, distance);
            vec3 finalColor = originalColor.rgb * lightAmount;
            gl_FragColor = vec4(finalColor, 1.0);
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
}

export class LightingFilterController extends Phaser.Filters.Controller {
  uniforms = { pointer: [0, 0], time: 0, zoom: 0 };
  game: GameScene;

  constructor(game: GameScene, container: Phaser.GameObjects.Container) {
    super(container.filterCamera, name);
    this.game = game;

    container.enableFilters().filters!.internal.add(this);
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer.renderNodes.hasNode(name)) renderer.renderNodes.addNodeConstructor(name, LightingFilter);
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
