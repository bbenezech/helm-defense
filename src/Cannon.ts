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
  PLAY_SOUNDS,
  CANNON_WHEELS_SPRITE_ROTATION,
} from "./constants";
import { GameScene } from "./GameScene";

const PRE_RECOIL_DURATION_MS = 30;
const PRE_WHEELS_RECOIL_DURATION_MS = 100;
const RECOIL_DURATION_MS = 50;
const RECOIL_RETURN_DURATION_MS = 500;
const RECOIL_FACTOR = 0.3;
const DO_RECOIL = true;
const CANNON_GROUND_CLEARANCE = 0.5 * PIXELS_PER_METER;
const INITIAL_SPEED_METERS_PER_SECOND = 440 / SMALL_WORLD_FACTOR;
const ELEVATION_ANGLE = 15; // degrees

export class Cannon extends Phaser.GameObjects.Sprite {
  // cache vectors to avoid creating new ones every frame, do not use directly, use getters
  private _bulletWorldVelocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _bulletScreenVelocity: Phaser.Math.Vector2 =
    new Phaser.Math.Vector2();
  private _muzzleWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _muzzleWorldOffset: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _muzzleScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _targetWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _pointerScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  gameScene: GameScene;
  // base position of the shadow sprite and wheel sprite
  screen: Phaser.Math.Vector2;
  world: Phaser.Math.Vector3;
  // screen position of the cannon sprite
  cannonScreen: Phaser.Math.Vector2;
  cannonWorld: Phaser.Math.Vector3;
  muzzleSpeed: number;
  recoilTween: Phaser.Tweens.TweenChain | null = null;
  shadowRecoilTween: Phaser.Tweens.TweenChain | null = null;
  wheelsRecoilTween: Phaser.Tweens.TweenChain | null = null;
  shadow: Phaser.GameObjects.Image;
  muzzleParticleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  muzzleFlashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  elevationRotation: number; // vertical world elevation angle of the muzzle in radians
  cannonLength: number; // width of the cannon sprite
  cannonRadius: number; // half heigth of the cannon sprite
  barrelLength: number; // barrel length is the length of the cannon minus the round part at the back, which actually is the length from origin of rotation to muzzle's end
  wheels: Phaser.GameObjects.Image; // wheels sprite

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, CANNON_SPRITE);

    this.gameScene = gameScene;
    this.world = world;
    this.screen = gameScene.getScreenPosition(world, new Phaser.Math.Vector2());
    const cannonWorld = world.clone();
    cannonWorld.z += CANNON_GROUND_CLEARANCE;
    this.cannonWorld = cannonWorld;
    this.cannonScreen = gameScene.getScreenPosition(
      cannonWorld,
      new Phaser.Math.Vector2()
    );
    this.cannonRadius = this.displayHeight / 2;
    this.cannonLength = this.displayWidth;

    const originX = this.cannonRadius / this.cannonLength;
    const originY = 0.5;

    this.gameScene.add.existing(
      this.setPosition(this.cannonScreen.x, this.cannonScreen.y)
        .setOrigin(originX, originY)
        .setDepth(this.y)
    );
    this.shadow = this.gameScene.add
      .sprite(this.screen.x, this.screen.y, CANNON_SPRITE)
      .setTint(0x000000)
      .setAlpha(0.3)
      .setOrigin(originX, originY)
      .setDepth(this.y - 1);

    this.wheels = this.gameScene.add
      .sprite(this.screen.x, this.screen.y, CANNON_WHEELS_SPRITE)
      .setScale(3)
      .setOrigin(0.5, 0.5)
      .setDepth(this.y - 2);

    this.barrelLength = this.cannonLength * (1 - originX);
    this.muzzleSpeed = INITIAL_SPEED_METERS_PER_SECOND * PIXELS_PER_METER;
    this.elevationRotation = Phaser.Math.DegToRad(ELEVATION_ANGLE);
    this.rotate();

    this.muzzleParticleEmitter = this.gameScene.add.particles(
      this.x,
      this.y,
      PARTICLE_SPRITE,
      {
        speed: {
          min: this.muzzleSpeed * 0.5,
          max: this.muzzleSpeed * 1.5,
        },
        lifespan: { min: 800, max: 2000 },
        scale: { start: 1, end: 0.5 },
        alpha: { start: 0.8, end: 0.3 },
        blendMode: "ADD",
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

  getBulletVelocityTo(targetScreen: Phaser.Types.Math.Vector2Like) {
    const targetWorld = this.gameScene.getSurfaceWorldPosition(
      targetScreen,
      this._targetWorld
    );
    const azimuth = Phaser.Math.Angle.BetweenPoints(
      this.cannonWorld,
      targetWorld
    );

    const horizontalVelocity =
      this.muzzleSpeed * Math.cos(this.elevationRotation);
    const verticalVelocity =
      this.muzzleSpeed * Math.sin(this.elevationRotation);

    this._bulletWorldVelocity.x = horizontalVelocity * Math.cos(azimuth);
    this._bulletWorldVelocity.y = horizontalVelocity * Math.sin(azimuth);
    this._bulletWorldVelocity.z = verticalVelocity;
    return this._bulletWorldVelocity;
  }

  getMuzzleWorld() {
    const cosElev = Math.cos(this.elevationRotation);
    const sinElev = Math.sin(this.elevationRotation);
    const cosAzim = Math.cos(this.shadow.rotation); // Azimuth based on shadow
    const sinAzim = Math.sin(this.shadow.rotation);

    this._muzzleWorldOffset.x = this.barrelLength * cosElev * cosAzim;
    this._muzzleWorldOffset.y = this.barrelLength * cosElev * sinAzim;
    this._muzzleWorldOffset.z = this.barrelLength * sinElev;

    this._muzzleWorld.addVectors(this.cannonWorld, this._muzzleWorldOffset);

    return this._muzzleWorld;
  }

  shoot(targetScreen: Phaser.Types.Math.Vector2Like): Bullet | null {
    if (this.recoilTween) return null;

    this.rotate();

    const bulletVelocity = this.getBulletVelocityTo(targetScreen);
    const recoilRotation =
      Math.atan2(bulletVelocity.y, bulletVelocity.x) + Math.PI;
    const recoilDistance = this.cannonLength * RECOIL_FACTOR;
    const wheelsRecoilDistance = recoilDistance * 0.5;

    if (DO_RECOIL) {
      this.wheelsRecoilTween = this.gameScene.tweens.chain({
        targets: this.wheels,
        tweens: [
          {
            delay: PRE_RECOIL_DURATION_MS + PRE_WHEELS_RECOIL_DURATION_MS,
            x: this.screen.x + wheelsRecoilDistance * Math.cos(recoilRotation),
            y: this.screen.y + wheelsRecoilDistance * Math.sin(recoilRotation),
            duration: RECOIL_DURATION_MS - PRE_WHEELS_RECOIL_DURATION_MS,
            ease: "Sine.easeOut",
          },
          {
            x: this.screen.x,
            y: this.screen.y,
            duration: RECOIL_RETURN_DURATION_MS,
            ease: "Sine.easeIn",
          },
        ],
        onComplete: () => {
          this.shadowRecoilTween = null;
        },
        onStop: () => {
          this.shadowRecoilTween = null;
          this.shadow.setPosition(this.screen.x, this.screen.y);
        },
      });
      this.shadowRecoilTween = this.gameScene.tweens.chain({
        targets: this.shadow,
        tweens: [
          {
            delay: PRE_RECOIL_DURATION_MS,
            x: this.screen.x + recoilDistance * Math.cos(recoilRotation),
            y: this.screen.y + recoilDistance * Math.sin(recoilRotation),
            duration: RECOIL_DURATION_MS,
            ease: "Sine.easeOut",
          },
          {
            x: this.screen.x,
            y: this.screen.y,
            duration: RECOIL_RETURN_DURATION_MS,
            ease: "Sine.easeIn",
          },
        ],
        onComplete: () => {
          this.shadowRecoilTween = null;
        },
        onStop: () => {
          this.shadowRecoilTween = null;
          this.shadow.setPosition(this.screen.x, this.screen.y);
        },
      });

      this.recoilTween = this.gameScene.tweens.chain({
        targets: this,
        tweens: [
          {
            delay: PRE_RECOIL_DURATION_MS,
            x: this.cannonScreen.x + recoilDistance * Math.cos(recoilRotation),
            y: this.cannonScreen.y + recoilDistance * Math.sin(recoilRotation),
            duration: RECOIL_DURATION_MS,
            ease: "Sine.easeOut",
          },
          {
            x: this.cannonScreen.x,
            y: this.cannonScreen.y,
            duration: RECOIL_RETURN_DURATION_MS,
            ease: "Sine.easeIn",
          },
        ],
        onComplete: () => {
          this.recoilTween = null;
        },
        onStop: () => {
          this.recoilTween = null;
          this.setPosition(this.cannonScreen.x, this.cannonScreen.y);
        },
      });
    }

    const muzzleWorld = this.getMuzzleWorld();
    const muzzleScreen = this.gameScene.getScreenPosition(
      muzzleWorld,
      this._muzzleScreen
    );

    this.muzzleParticleEmitter
      .setParticleGravity(0, 9.8 * PIXELS_PER_METER * Math.cos(this.rotation))
      .setPosition(muzzleScreen.x, muzzleScreen.y)
      .setRotation(this.rotation)
      .explode();

    this.muzzleFlashEmitter
      .setPosition(muzzleScreen.x, muzzleScreen.y)
      .setRotation(this.rotation)
      .explode();

    this.gameScene.cameras.main.shake(50, 0.002);

    const blast = Math.ceil(Math.random() * 5);
    if (PLAY_SOUNDS)
      this.gameScene.sound.play(`cannon_blast_${blast}`, { volume: 0.5 });

    return new Bullet(this.gameScene, muzzleWorld, bulletVelocity);
  }

  getPointerScreen() {
    const pointer = this.gameScene.input.activePointer;
    this._pointerScreen.x = pointer.worldX;
    this._pointerScreen.y = pointer.worldY;
    return this._pointerScreen;
  }

  // Rotates the cannon sprite and shadow towards the mouse pointer
  rotate() {
    const bulletVelocity = this.getBulletVelocityTo(this.getPointerScreen());
    // Shadow and wheels rotation is the azimuth (they are flat on the ground)
    this.shadow.rotation = Math.atan2(bulletVelocity.y, bulletVelocity.x);
    this.wheels.rotation = CANNON_WHEELS_SPRITE_ROTATION + this.shadow.rotation;

    // Cannon barrel rotation is not simply the azimuth
    // we project the full velocity vector on the screen
    // to rotate the barrel visually in line
    // with the initial bullet's screen travel direction
    const screenBulletVelocity = this.gameScene.getScreenPosition(
      bulletVelocity,
      this._bulletScreenVelocity
    );
    this.rotation = Math.atan2(screenBulletVelocity.y, screenBulletVelocity.x);

    const muzzleScreen = this.gameScene.getScreenPosition(
      this.getMuzzleWorld(),
      this._muzzleScreen
    );
    const screenBarrelLength = Phaser.Math.Distance.BetweenPoints(
      muzzleScreen,
      this.cannonScreen
    );
    this.scaleX = screenBarrelLength / this.barrelLength;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    if (this.recoilTween === null) this.rotate();
  }
}
