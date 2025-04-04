import Phaser from "phaser";
import { Enemy } from "./Enemy";
import { World } from "./World";

export const ENEMY_CONFIG = {
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
      enemies.add(scene.add.sprite(x, y, "enemy"));
    }
  }
  scene.tweens.add({
    targets: enemies,
    y: height * 16 + 50,
    duration: 100000,
    ease: "Linear",
    repeat: -1,
  });

  return enemies;
}
