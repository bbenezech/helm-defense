import { Bullet } from "./Bullet";
import {
  PIXEL_CANNON_SPRITE,
  PIXELS_PER_METER,
  SMALL_WORLD_FACTOR,
  CANNON_SHADOW_SPRITE,
  PARTICLE_SPRITE,
  CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
} from "./constants";
import { GameScene } from "./GameScene";

const PRE_RECOIL_DURATION_MS = 30;
const RECOIL_DURATION_MS = 50;
const RECOIL_RETURN_DURATION_MS = 500;
const RECOIL_FACTOR = 0.3;
const DO_RECOIL = true;
const HEIGHT_ABOVE_GROUND = 0.5 * PIXELS_PER_METER;

const INITIAL_SPEED_METERS_PER_SECOND = 440 / SMALL_WORLD_FACTOR;

export class Cannon extends Phaser.GameObjects.Sprite {
  gameScene: GameScene;
  muzzleVelocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  recoilTween: Phaser.Tweens.TweenChain | null = null;
  shadowRecoilTween: Phaser.Tweens.TweenChain | null = null;
  shadow: Phaser.GameObjects.Image;
  muzzleParticleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  muzzleFlashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  elevation: number;
  initialX: number;
  initialY: number;
  initialYWithElevation: number;
  cannonLength: number;
  cannonDiameter: number;
  barrelLength: number;
  wheels: Phaser.GameObjects.Image;

  constructor(gameScene: GameScene, x: number, y: number) {
    const initialYWithElevation = gameScene.getTiltedY(
      x,
      y,
      HEIGHT_ABOVE_GROUND
    );
    super(gameScene, x, initialYWithElevation, CANNON_SPRITE);
    this.gameScene = gameScene;
    this.initialX = x;
    this.initialY = y;
    this.initialYWithElevation = initialYWithElevation;
    this.elevation = Phaser.Math.DegToRad(5);
    const originX = this.displayHeight / (2 * this.displayWidth);
    const originY = 0.5;
    this.setOrigin(originX, originY);

    this.cannonLength = this.displayWidth;
    this.cannonDiameter = this.displayHeight;
    this.barrelLength = this.cannonLength * (1 - this.originX);
    this.setDepth(this.y);

    this.gameScene.add.existing(this);

    this.shadow = this.gameScene.add
      .sprite(x, y, CANNON_SHADOW_SPRITE)
      .setAlpha(0.3);
    this.shadow.setOrigin(originX, originY);
    this.shadow.setDepth(this.y - 1);

    this.wheels = this.gameScene.add.sprite(x, y - 10, CANNON_WHEELS_SPRITE);
    this.wheels.scale = 3;
    this.wheels.setDepth(this.y - 2);

    this.muzzleParticleEmitter = this.gameScene.add.particles(
      this.x,
      this.y,
      PARTICLE_SPRITE,
      {
        speed: {
          min: INITIAL_SPEED_METERS_PER_SECOND * PIXELS_PER_METER * 0.5,
          max: INITIAL_SPEED_METERS_PER_SECOND * PIXELS_PER_METER * 1.5,
        }, // Pixels per second
        lifespan: { min: 800, max: 2000 }, // Milliseconds (adjust for desired fade distance)
        scale: { start: 1, end: 0.5 }, // Shrink to nothing
        alpha: { start: 0.8, end: 0.3 }, // Fade out
        blendMode: "ADD", // 'ADD' blend mode often looks good
        angle: { min: -7, max: 7 },
        frequency: -1,
        quantity: 70,
      }
    );

    this.muzzleFlashEmitter = this.gameScene.add.particles(
      this.x,
      this.y,
      FLARES,
      {
        frame: "black",
        color: [0xfacc22, 0xf89800, 0xf83600, 0x040404],
        colorEase: "quart.out",
        scale: 0.2,
        lifespan: { min: 0, max: 1500 },
        angle: { min: -20, max: 20 },
        speed: { min: 10, max: 150 },
        blendMode: "ADD",
        frequency: -1,
        quantity: 20,
      }
    );
  }

  // Calculates the 3D muzzle velocity vector based on a target direction
  getMuzzleVelocity(
    direction: { worldX: number; worldY: number },
    out: Phaser.Math.Vector3
  ): Phaser.Math.Vector3 {
    const targetUntiltedY = this.gameScene.getUntiltedY(
      direction.worldX,
      direction.worldY
    );
    const cannonUntiltedY = this.gameScene.getUntiltedY(this.x, this.y);

    const azimuth = Phaser.Math.Angle.Between(
      this.x,
      cannonUntiltedY,
      direction.worldX,
      targetUntiltedY
    );

    const horizontalSpeedPixels =
      INITIAL_SPEED_METERS_PER_SECOND * PIXELS_PER_METER;

    const velocityHorizontal = horizontalSpeedPixels * Math.cos(this.elevation);
    const velocityX = velocityHorizontal * Math.cos(azimuth);
    const velocityY = velocityHorizontal * Math.sin(azimuth);
    const velocityZ = horizontalSpeedPixels * Math.sin(this.elevation);

    return out.set(velocityX, velocityY, velocityZ);
  }

  // Calculates the muzzle offset and spawn position based on current cannon state
  calculateMuzzleSpawnPosition() {
    const cosElev = Math.cos(this.elevation);
    const sinElev = Math.sin(this.elevation);
    const cosAzim = Math.cos(this.shadow.rotation); // Azimuth based on shadow
    const sinAzim = Math.sin(this.shadow.rotation);

    const muzzleOffsetX = this.barrelLength * cosElev * cosAzim;
    const muzzleOffsetY = this.barrelLength * cosElev * sinAzim;
    const muzzleOffsetZ = this.barrelLength * sinElev;

    const x = this.initialX + muzzleOffsetX;
    const y =
      this.gameScene.getUntiltedY(this.initialX, this.initialYWithElevation) +
      muzzleOffsetY;
    const z =
      this.gameScene.getGroundZ(this.initialX, this.initialYWithElevation) +
      muzzleOffsetZ;

    return {
      muzzleOffsetX,
      muzzleOffsetY,
      muzzleOffsetZ,
      x,
      y,
      z,
    };
  }

  // Fires a bullet towards the given direction
  shoot(direction: { worldX: number; worldY: number }): Bullet | null {
    if (this.recoilTween) return null;

    const {
      x: velocityX,
      y: velocityY,
      z: velocityZ,
    } = this.getMuzzleVelocity(direction, this.muzzleVelocity);

    const muzzleAngle = Math.atan2(velocityY, velocityX);
    const recoilAngle = muzzleAngle + Math.PI;

    const recoilDistance = this.cannonLength * RECOIL_FACTOR;

    if (DO_RECOIL) {
      this.shadowRecoilTween = this.gameScene.tweens.chain({
        targets: this.shadow,
        tweens: [
          {
            delay: PRE_RECOIL_DURATION_MS,
            x: this.initialX + recoilDistance * Math.cos(recoilAngle),
            y: this.initialY + recoilDistance * Math.sin(recoilAngle),
            duration: RECOIL_DURATION_MS,
            ease: "Sine.easeOut",
          },
          {
            x: this.initialX,
            y: this.initialY,
            duration: RECOIL_RETURN_DURATION_MS,
            ease: "Sine.easeIn",
          },
        ],
        onComplete: () => {
          this.shadowRecoilTween = null;
        },
        onStop: () => {
          this.shadowRecoilTween = null;
          this.shadow.setPosition(this.initialX, this.initialY);
        },
      });

      this.recoilTween = this.gameScene.tweens.chain({
        targets: this,
        tweens: [
          {
            delay: PRE_RECOIL_DURATION_MS,
            x: this.initialX + recoilDistance * Math.cos(recoilAngle),
            y:
              this.initialYWithElevation +
              recoilDistance * Math.sin(recoilAngle),
            duration: RECOIL_DURATION_MS,
            ease: "Sine.easeOut",
          },
          {
            x: this.initialX,
            y: this.initialYWithElevation,
            duration: RECOIL_RETURN_DURATION_MS,
            ease: "Sine.easeIn",
          },
        ],
        onComplete: () => {
          this.recoilTween = null;
        },
        onStop: () => {
          this.recoilTween = null;
          this.setPosition(this.initialX, this.initialYWithElevation);
        },
      });
    }

    const {
      x: spawnX,
      y: spawnY,
      z: spawnZ,
    } = this.calculateMuzzleSpawnPosition();
    const screenX = spawnX;
    const screenY = this.gameScene.getTiltedY(spawnX, spawnY, spawnZ);
    const gravityX = 0;
    const gravityY = 9.8 * PIXELS_PER_METER * Math.cos(this.rotation);
    this.muzzleParticleEmitter
      .setParticleGravity(gravityX, gravityY)
      .setPosition(screenX, screenY)
      .setRotation(this.rotation)
      .explode();

    this.muzzleFlashEmitter
      .setPosition(screenX, screenY)
      .setRotation(this.rotation)
      .explode();

    this.gameScene.cameras.main.shake(50, 0.002);

    const blast = Math.ceil(Math.random() * 5);
    this.gameScene.sound.play(`cannon_blast_${blast}`, { volume: 0.5 });

    return new Bullet(
      this.gameScene,
      spawnX,
      spawnY,
      spawnZ,
      velocityX,
      velocityY,
      velocityZ
    );
  }

  // Rotates the cannon sprite and shadow towards the mouse pointer
  rotate() {
    const {
      x: targetVelocityX,
      y: targetVelocityY,
      z: targetVelocityZ,
    } = this.getMuzzleVelocity(
      this.gameScene.input.activePointer,
      this.muzzleVelocity
    );

    // Visual rotation includes the tilt effect
    const visualTargetX = targetVelocityX;
    const visualTargetY = this.gameScene.getTiltedY(
      targetVelocityX,
      targetVelocityY,
      targetVelocityZ
    );
    this.rotation = Math.atan2(visualTargetY, visualTargetX);

    // Shadow rotation represents the actual horizontal aim (azimuth)
    this.shadow.rotation = Math.atan2(targetVelocityY, targetVelocityX);
    this.wheels.rotation = Math.PI / 2 + this.rotation;

    // Calculate spawn position for visual scaling
    const {
      x: spawnX,
      y: spawnY,
      z: spawnZ,
    } = this.calculateMuzzleSpawnPosition();

    const tiltedSpawnX = spawnX;
    const tiltedSpawnY = this.gameScene.getTiltedY(spawnX, spawnY, spawnZ);

    const originToMuzzleX = tiltedSpawnX - this.initialX;
    const originToMuzzleY = tiltedSpawnY - this.initialYWithElevation;

    // Scale the cannon sprite visually based on the projected barrel length
    const visualBarrelLength = Math.sqrt(
      originToMuzzleX * originToMuzzleX + originToMuzzleY * originToMuzzleY
    );
    this.scaleX = visualBarrelLength / this.barrelLength;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    if (this.recoilTween === null) this.rotate();
  }
}
