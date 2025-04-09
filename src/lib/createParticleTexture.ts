import { GameScene } from "../GameScene";

export function createParticleTexture(gameScene: GameScene, key: string) {
  const graphics = gameScene.make.graphics();
  graphics.fillStyle(0xffff00, 1); // White color, full alpha
  graphics.fillRect(0, 0, 3, 3); // Draw a small 4x4 square
  graphics.generateTexture(key, 3, 3);
  graphics.destroy();
}
