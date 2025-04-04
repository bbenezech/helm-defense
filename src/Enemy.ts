import { ENEMY_SPRITE } from "./constants";
import { World } from "./World";

const ENEMY_CONFIG = {
  ROWS: 20,
  COLUMNS: 10,
  ROW_SPACING_PX: 32,
  COLUMN_SPACING_PX: 32,
};

export function createEnemyContainer(
  scene: World,
  x: number,
  y: number,
  height: number
) {
  const enemies = scene.add.container(x, y);
  const { ROWS, COLUMNS, ROW_SPACING_PX, COLUMN_SPACING_PX } = ENEMY_CONFIG;
  const TOP_OFFSET = ROWS * ROW_SPACING_PX;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const x = col * COLUMN_SPACING_PX;
      const y = -TOP_OFFSET + row * ROW_SPACING_PX;
      enemies.add(new Enemy(scene, x, y));
    }
  }

  scene.tweens.add({
    targets: enemies,
    y: height * 16 + 50,
    duration: 100_000, // 10 seconds
    ease: "Linear",
    repeat: -1,
  });

  return enemies;
}

export const ENEMY_HEIGHT_METERS = 1.5;
export class Enemy extends Phaser.GameObjects.Sprite {
  constructor(scene: World, x: number, y: number) {
    super(scene, x, y, ENEMY_SPRITE);
    scene.add.existing(this);
  }

  update(time: number, delta: number) {
    return super.update(time, delta);
  }

  destroy(): void {
    super.destroy();
  }
}
