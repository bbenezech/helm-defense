import { Bullet } from "./Bullet";
import {
  CANNON_SPRITE,
  PIXELS_PER_METER,
  SMALL_WORLD_FACTOR,
} from "./constants";
import { GameScene } from "./GameScene";

const CANNON_ELEVATION_ANGLE = Phaser.Math.DegToRad(15); // Angle above horizontal plane
const INITIAL_SPEED_METERS_PER_SECOND = 440 / SMALL_WORLD_FACTOR;

export class Cannon extends Phaser.GameObjects.Sprite {
  gameScene: GameScene;
  private tempVelocityVector: Phaser.Math.Vector3 = new Phaser.Math.Vector3();

  constructor(gameScene: GameScene, x: number, y: number) {
    super(gameScene, x, y, CANNON_SPRITE);
    this.gameScene = gameScene;
    gameScene.add.existing(this);
    this.setDepth(10000); // todo just over bullets
  }

  shootingVector(
    position: { worldX: number; worldY: number },
    out: Phaser.Math.Vector3
  ) {
    const angleRad = Phaser.Math.Angle.Between(
      this.x,
      this.gameScene.getWorldY(this.x, this.y),
      position.worldX,
      this.gameScene.getWorldY(position.worldX, position.worldY)
    );
    const horizontalSpeed =
      INITIAL_SPEED_METERS_PER_SECOND *
      PIXELS_PER_METER *
      Math.cos(CANNON_ELEVATION_ANGLE);
    const vx = horizontalSpeed * Math.cos(angleRad); // X component of horizontal speed
    const vy = horizontalSpeed * Math.sin(angleRad); // Y component of horizontal speed
    const vz =
      PIXELS_PER_METER *
      INITIAL_SPEED_METERS_PER_SECOND *
      Math.sin(CANNON_ELEVATION_ANGLE); // Vertical component

    return out.set(vx, vy, vz);
  }

  // Shoots towards a target X/Y point on the ground plane
  shoot(position: { worldX: number; worldY: number }): Bullet {
    const { x, y, z } = this.shootingVector(position, this.tempVelocityVector);

    return new Bullet(this.gameScene, this.x, this.y, 0, x, y, z);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.rotation = Math.PI / 2;

    // Rotate cannon towards mouse
    const { x, y, z } = this.shootingVector(
      this.gameScene.input.activePointer,
      this.tempVelocityVector
    );

    this.rotation += Math.atan2(y - z, x);
  }
}
