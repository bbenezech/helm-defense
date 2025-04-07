import { Bullet } from "./Bullet";
import {
  CANNON_SPRITE,
  PIXELS_PER_METER,
  SMALL_WORLD_FACTOR,
} from "./constants";
import { GameScene } from "./GameScene";

const RECOIL_DURATION_MS = 50; // How long the backward movement takes
const RECOIL_RETURN_DURATION_MS = 500; // How long it takes to return to original position

const INITIAL_SPEED_METERS_PER_SECOND = 440 / SMALL_WORLD_FACTOR;

export class Cannon extends Phaser.GameObjects.Sprite {
  gameScene: GameScene;
  private muzzleVelocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private recoilTween: Phaser.Tweens.TweenChain | null = null;
  elevation = Phaser.Math.DegToRad(15); // muzzle elevation in grad
  initialX: number;
  initialY: number;

  constructor(gameScene: GameScene, x: number, y: number) {
    super(gameScene, x, y, CANNON_SPRITE);
    this.gameScene = gameScene;
    this.initialX = x;
    this.initialY = y;
    gameScene.add.existing(this);
    this.setDepth(10000); // todo just over bullets
  }

  getMuzzleVelocity(
    direction: { worldX: number; worldY: number },
    out: Phaser.Math.Vector3
  ) {
    const angleRad = Phaser.Math.Angle.Between(
      this.x,
      this.gameScene.getUntiltedY(this.x, this.y),
      direction.worldX,
      this.gameScene.getUntiltedY(direction.worldX, direction.worldY)
    );
    const horizontalSpeed =
      INITIAL_SPEED_METERS_PER_SECOND *
      PIXELS_PER_METER *
      Math.cos(this.elevation);
    const vx = horizontalSpeed * Math.cos(angleRad); // X component of horizontal speed
    const vy = horizontalSpeed * Math.sin(angleRad); // Y component of horizontal speed
    const vz =
      PIXELS_PER_METER *
      INITIAL_SPEED_METERS_PER_SECOND *
      Math.sin(this.elevation); // Vertical component

    return out.set(vx, vy, vz);
  }

  // instantiate a bullet that goes flying toward a 2d coordinate
  shoot(direction: { worldX: number; worldY: number }): Bullet | null {
    if (this.recoilTween) return null;

    const recoilAngle = this.rotation + Math.PI / 2; // opposite of firing angle
    const recoilDistance = this.displayWidth / 2;
    const recoilX = this.initialX + recoilDistance * Math.cos(recoilAngle);
    const recoilY = this.initialY + recoilDistance * Math.sin(recoilAngle);

    this.recoilTween = this.gameScene.tweens.chain({
      targets: this,
      tweens: [
        {
          x: recoilX,
          y: recoilY,
          duration: RECOIL_DURATION_MS,
          ease: "Sine.easeOut", // Start fast, slow down
        },
        {
          // Return to original position
          x: this.initialX,
          y: this.initialY,
          duration: RECOIL_RETURN_DURATION_MS,
          ease: "Sine.easeIn", // Start slow, speed up
        },
      ],
      onComplete: () => {
        this.recoilTween = null;
        this.setPosition(this.initialX, this.initialY);
      },
      onStop: () => {
        this.recoilTween = null;
        this.setPosition(this.initialX, this.initialY);
      },
    });

    const spawnX = this.initialX;
    const spawnY = this.gameScene.getUntiltedY(this.initialX, this.initialY);
    const spawnZ = this.gameScene.getGroundZ(this.initialX, this.initialY);
    const {
      x: vx,
      y: vy,
      z: vz,
    } = this.getMuzzleVelocity(direction, this.muzzleVelocity);

    return new Bullet(this.gameScene, spawnX, spawnY, spawnZ, vx, vy, vz);
  }

  rotate() {
    // Rotate cannon towards mouse
    const { x, y, z } = this.getMuzzleVelocity(
      this.gameScene.input.activePointer,
      this.muzzleVelocity
    );

    const realX = x;
    const realY = this.gameScene.getTiltedY(x, y, z);

    // the tile must be rotated 90 degrees on the right
    // the cannon is visually rotated to account for vertical muzzle angle, so that bullet fly straight out of the muzzle visually
    this.rotation = Math.PI / 2 + Math.atan2(realY, realX);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    // do not rotate while firing
    if (this.recoilTween === null) this.rotate();
  }
}
