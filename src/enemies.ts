import Phaser from "phaser";

export const ENEMY_CONFIG = {
  ROWS: 20,
  COLUMNS: 10,
  ROW_SPACING_PX: 32,
  COLUMN_SPACING_PX: 32,
  LEFT_OFFSET: 100,
};

export function createEnemyContainer(scene: Phaser.Scene) {
  return scene.add.container(0, -50);
}

export function createEnemy(
  scene: Phaser.Scene,
  x: number,
  y: number
): Phaser.GameObjects.Sprite {
  const enemy = scene.add.sprite(x, y, "enemy");
  enemy.setInteractive();

  enemy.on("pointerdown", () => createDeathAnimation(scene, enemy));

  return enemy;
}

export function createDeathAnimation(
  scene: Phaser.Scene,
  enemy: Phaser.GameObjects.Sprite
) {
  scene.tweens.add({
    targets: enemy,
    angle: 720,
    scale: 0,
    alpha: 0,
    duration: 1000,
    onComplete: () => {
      // Need to cast to any due to circular reference with the World scene
      (scene as any).enemies?.remove(enemy);
      enemy.destroy();
    },
  });
}

export function createEnemyFormation(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container
) {
  const { ROWS, COLUMNS, ROW_SPACING_PX, COLUMN_SPACING_PX, LEFT_OFFSET } =
    ENEMY_CONFIG;
  const TOP_OFFSET = ROWS * ROW_SPACING_PX;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      const enemy = createEnemy(
        scene,
        LEFT_OFFSET + col * COLUMN_SPACING_PX,
        -TOP_OFFSET + row * ROW_SPACING_PX
      );
      container.add(enemy);
    }
  }
}

export function createMovementAnimation(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  mapHeight: number
) {
  scene.tweens.add({
    targets: container,
    y: mapHeight * 16 + 50,
    duration: 100000,
    ease: "Linear",
    repeat: -1,
  });
}
