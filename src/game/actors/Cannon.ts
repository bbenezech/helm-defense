import { Bullet } from "./Bullet.js";
import {
  WORLD_UNIT_PER_METER,
  PARTICLE_SPRITE,
  CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  CANNON_WHEELS_SPRITE_ROTATION,
  INVISIBLE_UPDATE_INTERVAL_MS,
  VISIBLE_UPDATE_INTERVAL_MS,
  BULLET,
} from "../constants.js";
import { GameScene } from "../scene/game.js";
import { setNormalizedVelocity } from "../lib/trigo.js";
import timeScaleStore from "../../store/time-scale.js";
import { Coordinates } from "../lib/coordinates.js";
import { randomNormal } from "../lib/random.js";

const PRE_WHEELS_RECOIL_DURATION_MS = 100;
const RECOIL_DURATION_MS = 500;
const RECOIL_RETURN_DURATION_MS = 1500;
const RECOIL_FACTOR = 0.3;
const CANNON_GROUND_CLEARANCE = 0.5 * WORLD_UNIT_PER_METER;
const INITIAL_ALTITUDE = Phaser.Math.DegToRad(0);
const TURN_RATE_RADIANS_PER_SECOND = Phaser.Math.DegToRad(90);
const COOLDOWN_MS = 2000; // 2 seconds cooldown

export class Cannon extends Phaser.GameObjects.Image {
  private _muzzleWorldOffset: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _targetWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();

  gameScene: GameScene;
  coordinates: Coordinates;
  cannonCoordinates: Coordinates;
  velocity: Coordinates;
  azymuthVelocity: Coordinates;
  muzzleCoordinates: Coordinates;

  requestedAzymuth: number; // requested rotation
  azymuth: number; // current rotation of the cannon
  altitude = INITIAL_ALTITUDE; // elevation angle of the muzzle in radians
  shootRequested = false; // if true, shoot when ready
  dirty = true;

  recoilTween: Phaser.Tweens.TweenChain;
  shadowRecoilTween: Phaser.Tweens.TweenChain;
  wheelsRecoilTween: Phaser.Tweens.TweenChain;
  shadow: Phaser.GameObjects.Image;
  muzzleParticleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  muzzleFlashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  cannonLength: number; // width of the cannon sprite
  cannonRadius: number; // half heigth of the cannon sprite
  barrelLength: number; // barrel length is the length of the cannon minus the round part at the back, which actually is the length from origin of rotation to muzzle's end
  wheels: Phaser.GameObjects.Image; // wheels sprite
  shootCooldown: number = 0; // cooldown time in ms

  private moveTimer: number = 0; // Timer to accumulate delta time for move updates

  constructor(gameScene: GameScene, rotationDeg: number) {
    super(gameScene, 0, 0, CANNON_SPRITE);

    this.gameScene = gameScene;
    this.coordinates = new Coordinates(this);
    this.cannonCoordinates = new Coordinates(this);
    this.velocity = new Coordinates(this);
    this.azymuthVelocity = new Coordinates(this);
    this.muzzleCoordinates = new Coordinates(this);

    this.cannonRadius = this.displayHeight / 2;
    this.cannonLength = this.displayWidth;
    const originX = this.cannonRadius / this.cannonLength;
    const originY = 0.5;
    this.barrelLength = this.cannonLength * (1 - originX);

    this.setOrigin(originX, originY);
    this.shadow = this.gameScene.add
      .sprite(0, 0, CANNON_SPRITE)
      .setTint(0x000000)
      .setAlpha(0.3)
      .setOrigin(originX, originY);

    this.wheels = this.gameScene.add.sprite(0, 0, CANNON_WHEELS_SPRITE).setScale(3).setOrigin(0.5, 0.5);

    this.gameScene.add.existing(this);
    this.requestedAzymuth = this.azymuth = Phaser.Math.DegToRad(rotationDeg);
    this.muzzleParticleEmitter = this.gameScene.add.particles(0, 0, PARTICLE_SPRITE, {
      emitting: false,
      quantity: 5,
      stopAfter: 75,
      radial: false,
      x: () => this.muzzleCoordinates.screen.x,
      y: () => this.muzzleCoordinates.screen.y,
      speedX: () => randomNormal(this.velocity.screen.x * 0.7, 40),
      speedY: () => randomNormal(this.velocity.screen.y * 0.7, 40),
      accelerationX: this.gameScene.gravity.screen.x,
      accelerationY: this.gameScene.gravity.screen.y,
      lifespan: () => Math.random() * 500 + 400,
      scale: { start: 10, end: 4, ease: Phaser.Math.Easing.Expo.Out },
      alpha: { start: 0.8, end: 0, ease: Phaser.Math.Easing.Expo.InOut },
    });

    this.muzzleFlashEmitter = this.gameScene.add.particles(0, 0, FLARES, {
      color: [0xfacc22, 0xf89800, 0xf83600, 0x040404],
      colorEase: "quart.out",
      scale: 0.2,
      lifespan: { min: 0, max: 1500 },
      angle: { min: -20, max: 20 },
      speed: { min: 10, max: 150 },
      blendMode: "ADD",
      frequency: -1,
      quantity: 20,
    });

    this.recoilTween = this.gameScene.tweens.chain({
      paused: true,
      persist: true,
      targets: this,
      tweens: [
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Expo.Out, // https://phaser.io/examples/v3.85.0/tweens/eases/view/ease-equations
              duration: RECOIL_DURATION_MS,
              getStart: () => this.cannonCoordinates.screen.x,
              getEnd: () =>
                this.cannonCoordinates.screen.x + this.cannonLength * RECOIL_FACTOR * Math.cos(this.rotation + Math.PI),
            },
            y: {
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS,
              getStart: () => this.cannonCoordinates.screen.y,
              getEnd: () =>
                this.cannonCoordinates.screen.y + this.cannonLength * RECOIL_FACTOR * Math.sin(this.rotation + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.cannonCoordinates.screen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.cannonCoordinates.screen.y,
            },
          },
        },
      ],
      onStop: () => {
        this.setPosition(this.cannonCoordinates.screen.x, this.cannonCoordinates.screen.y);
      },
    });

    this.shadowRecoilTween = this.gameScene.tweens.chain({
      paused: true,
      persist: true,
      targets: this.shadow,
      tweens: [
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Expo.Out, // https://phaser.io/examples/v3.85.0/tweens/eases/view/ease-equations
              duration: RECOIL_DURATION_MS,
              getStart: () => this.coordinates.screen.x,
              getEnd: () =>
                this.coordinates.screen.x + this.cannonLength * RECOIL_FACTOR * Math.cos(this.azymuth + Math.PI),
            },
            y: {
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS,
              getStart: () => this.coordinates.screen.y,
              getEnd: () =>
                this.coordinates.screen.y + this.cannonLength * RECOIL_FACTOR * Math.sin(this.azymuth + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.coordinates.screen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.coordinates.screen.y,
            },
          },
        },
      ],
      onStop: () => {
        this.setPosition(this.coordinates.screen.x, this.coordinates.screen.y);
      },
    });

    this.wheelsRecoilTween = this.gameScene.tweens.chain({
      paused: true,
      persist: true,
      targets: this.wheels,
      tweens: [
        {
          props: {
            x: {
              delay: PRE_WHEELS_RECOIL_DURATION_MS,
              ease: Phaser.Math.Easing.Expo.Out, // https://phaser.io/examples/v3.85.0/tweens/eases/view/ease-equations
              duration: RECOIL_DURATION_MS - PRE_WHEELS_RECOIL_DURATION_MS,
              getStart: () => this.coordinates.screen.x,
              getEnd: () =>
                this.coordinates.screen.x + this.cannonLength * RECOIL_FACTOR * 0.5 * Math.cos(this.azymuth + Math.PI),
            },
            y: {
              delay: PRE_WHEELS_RECOIL_DURATION_MS,
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS - PRE_WHEELS_RECOIL_DURATION_MS,
              getStart: () => this.coordinates.screen.y,
              getEnd: () =>
                this.coordinates.screen.y + this.cannonLength * RECOIL_FACTOR * 0.5 * Math.sin(this.azymuth + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS / 2,
              getEnd: () => this.coordinates.screen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS / 2,
              getEnd: () => this.coordinates.screen.y,
            },
          },
        },
      ],
      onStop: () => {
        this.wheels.setPosition(this.coordinates.screen.x, this.coordinates.screen.y);
      },
    });
  }

  setWorld(world: Phaser.Math.Vector3) {
    this.coordinates.copy(world);
    this.cannonCoordinates.copy(world);
    this.cannonCoordinates.z += CANNON_GROUND_CLEARANCE;

    this.dirty = true;
  }

  setRequestedAzymuth(targetScreen: Phaser.Types.Math.Vector2Like) {
    const targetWorld = this.gameScene.getSurfaceWorldPosition(targetScreen, this._targetWorld);

    this.requestedAzymuth = Phaser.Math.Angle.BetweenPoints(this.cannonCoordinates, targetWorld);
  }

  shoot() {
    new Bullet(this.gameScene, this.muzzleCoordinates, this.velocity);
    this.gameScene.cannonBlast.play(this.x, this.y);

    this.recoilTween.restart();
    this.shadowRecoilTween.restart();
    this.wheelsRecoilTween.restart();

    this.muzzleParticleEmitter.start();
    this.muzzleFlashEmitter
      .setPosition(this.muzzleCoordinates.screen.x, this.muzzleCoordinates.screen.y)
      .setRotation(this.rotation)
      .explode();

    this.gameScene.nudge();
  }

  move(delta: number) {
    const rotationNeeded = Math.abs(this.azymuth - this.requestedAzymuth) >= 0.0001;
    this.shootCooldown -= delta;
    if (this.shootCooldown <= 0 && !rotationNeeded && this.shootRequested) {
      this.shootRequested = false;
      this.shootCooldown = COOLDOWN_MS;
      this.shoot();
    }

    if (rotationNeeded) {
      this.azymuth = Phaser.Math.Angle.RotateTo(
        this.azymuth,
        this.requestedAzymuth,
        TURN_RATE_RADIANS_PER_SECOND * (delta / 1000.0),
      );

      this.dirty = true;
    }
  }

  updateVisuals() {
    this.setPosition(this.cannonCoordinates.screen.x, this.cannonCoordinates.screen.y).setDepth(
      this.cannonCoordinates.screen.y,
    );
    this.shadow
      .setPosition(this.coordinates.screen.x, this.coordinates.screen.y)
      .setDepth(this.cannonCoordinates.screen.y - 1);
    this.wheels
      .setPosition(this.coordinates.screen.x, this.coordinates.screen.y)
      .setDepth(this.cannonCoordinates.screen.y - 2);

    setNormalizedVelocity(this.azymuth, this.altitude, this.velocity).scale(BULLET.speed);
    this.muzzleCoordinates.addVectors(
      this.cannonCoordinates,
      this._muzzleWorldOffset.copy(this.velocity).normalize().scale(this.barrelLength),
    );
    this.azymuthVelocity.set(Math.cos(this.azymuth), Math.sin(this.azymuth), 0);

    const screenAzymuthRotation = Math.atan2(this.azymuthVelocity.screen.y, this.azymuthVelocity.screen.x);
    const screenRotation = Math.atan2(this.velocity.screen.y, this.velocity.screen.x);

    this.setRotation(screenRotation); // full azymuth + altitude projection
    this.shadow.setRotation(screenAzymuthRotation); // azymuth projection only
    this.wheels.setRotation(
      // azymuth projection only + sprite rotation to zero it out to the right
      CANNON_WHEELS_SPRITE_ROTATION + screenAzymuthRotation,
    );

    const scaleX =
      Phaser.Math.Distance.BetweenPoints(this.cannonCoordinates.screen, this.muzzleCoordinates.screen) /
      this.barrelLength;

    this.scaleX = scaleX;
    this.shadow.scaleX = scaleX;
  }

  requestShoot(targetScreen: Phaser.Types.Math.Vector2Like) {
    this.shootRequested = true;
    this.setRequestedAzymuth(targetScreen);
  }

  preUpdate(_time: number, delta: number) {
    const timeScale = timeScaleStore.get();

    delta = delta * timeScale;
    this.muzzleParticleEmitter.timeScale = timeScale;
    this.muzzleFlashEmitter.timeScale = timeScale;
    this.recoilTween.timeScale = timeScale;
    this.shadowRecoilTween.timeScale = timeScale;
    this.wheelsRecoilTween.timeScale = timeScale;

    const visible = this.gameScene.inViewport(this);
    const timerInterval = visible ? VISIBLE_UPDATE_INTERVAL_MS : INVISIBLE_UPDATE_INTERVAL_MS;

    this.moveTimer += delta;
    if (this.moveTimer >= timerInterval) {
      this.move(this.moveTimer);
      this.moveTimer = 0;
    }

    if (this.dirty || this.gameScene.dirty) {
      this.dirty = false;
      this.updateVisuals();
    }
  }

  override destroy(): void {
    this.muzzleParticleEmitter.destroy();
    this.muzzleFlashEmitter.destroy();
    this.shadow.destroy();
    this.wheels.destroy();
    this.recoilTween.destroy();
    this.shadowRecoilTween.destroy();
    this.wheelsRecoilTween.destroy();
    super.destroy();
  }
}
