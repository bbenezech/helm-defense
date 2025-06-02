import { ENEMY_SPRITE } from "../constants";
import { GameScene } from "../scene/game";
import { Solid } from "../collision/sphereToGround";

const ENNEMY_MASS_KG = 100;

export class Enemy extends Phaser.GameObjects.Image implements Solid {
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  shadow: Phaser.GameObjects.Image;
  gameScene: GameScene;
  invMass: number;
  mass: number;

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, ENEMY_SPRITE);

    this.world = world.clone();
    this.velocity = new Phaser.Math.Vector3(0, 0, 0);
    this.gameScene = gameScene;
    this.mass = ENNEMY_MASS_KG;
    this.invMass = 1 / ENNEMY_MASS_KG;
    this.gameScene.add.existing(this);
    this.shadow = this.gameScene.add
      .image(0, 0, this.texture)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);
  }

  destroy(): void {
    super.destroy();
    this.shadow.destroy();
  }
}
