import type { GameScene } from "../scene/game.js";

export function createParticleTexture(gameScene: GameScene, key: string) {
  const graphics = gameScene.make.graphics();
  graphics.fillStyle(0xffff00, 1);
  graphics.fillRect(0, 0, 1, 1);
  graphics.generateTexture(key, 1, 1);
  graphics.destroy();
}
