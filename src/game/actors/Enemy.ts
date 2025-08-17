import type { Solid } from "../collision/sphere-to-ground.ts";
import { ENEMY_SPRITE } from "../constants.ts";
import type { GameScene } from "../scene/game.ts";

const ENNEMY_MASS_KG = 100;

export class Enemy extends Phaser.GameObjects.Image implements Solid {
  coordinates: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3(0, 0, 0);
  gameScene: GameScene;
  mass = ENNEMY_MASS_KG;
  invMass = 1 / ENNEMY_MASS_KG;
  radius: number = 0.5;
  squareRadius: number = this.radius * this.radius;
  dirty: boolean = true;
  screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, ENEMY_SPRITE);

    this.coordinates = world.clone();
    this.gameScene = gameScene;
    this.gameScene.add.existing(this);
  }

  updateVisuals() {
    this.setPosition(this.screen.x, this.screen.y);
    this.setRotation(0);
    this.setDepth(this.y);
  }

  preUpdate(_time: number, _delta: number) {
    if (this.dirty || this.gameScene.dirty) {
      this.dirty = false;
      this.updateVisuals();
    }
  }

  override destroy(): void {
    super.destroy();
  }
}
