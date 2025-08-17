import type { GameScene } from "../scene/game.ts";

export function createParticleTexture(gameScene: GameScene, key: string) {
  const graphics = gameScene.make.graphics();
  graphics.fillStyle(0xff_ff_00, 1);
  graphics.fillRect(0, 0, 1, 1);
  graphics.generateTexture(key, 1, 1);
  graphics.destroy();
}
