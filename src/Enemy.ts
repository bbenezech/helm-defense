import { World } from "./World";
export const ENEMY_HEIGHT_METERS = 1.5;
export class Enemy extends Phaser.GameObjects.Sprite {
  constructor(scene: World, x: number, y: number) {
    super(scene, x, y, "ennemy");
    scene.add.sprite(x, y, "ennemy");
  }

  update(time: number, delta: number) {
    return super.update(time, delta);
  }

  destroy(): void {
    super.destroy();
  }
}
