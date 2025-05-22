import { Bullet } from "./Bullet";
import {
  WORLD_UNIT_PER_METER,
  PARTICLE_SPRITE,
  CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  CANNON_WHEELS_SPRITE_ROTATION,
  INVISIBLE_UPDATE_INTERVAL,
  VISIBLE_UPDATE_INTERVAL,
  BULLET,
  GRAVITY_SI,
} from "../constants";
import { GameScene } from "../GameScene";
import { log } from "../lib/log";
import { velocityVectorFromAzymuthAndAltitude } from "../lib/trigo";

const PRE_WHEELS_RECOIL_DURATION_MS = 100;
const RECOIL_DURATION_MS = 500;
const RECOIL_RETURN_DURATION_MS = 500;
const RECOIL_FACTOR = 0.3;
const DO_RECOIL = true;
const CANNON_GROUND_CLEARANCE = 0.5 * WORLD_UNIT_PER_METER;
const INITIAL_ALTITUDE = Phaser.Math.DegToRad(0);
const TURN_RATE_RADIANS_PER_SECOND = Phaser.Math.DegToRad(90);
const COOLDOWN_MS = 1000; // 1 second cooldown

export class Cannon extends Phaser.GameObjects.Image {
  // cache vectors to avoid creating new ones every frame, do not use directly, use getters
  private _velocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _screenVelocity: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _azymuth: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _screenAzymuth: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _muzzleWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _muzzleWorldOffset: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private _muzzleScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _targetWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private dirty: boolean = true;

  gameScene: GameScene;
  world: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  cannonWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  cannonScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  requestedAzymuth: number; // requested rotation
  azymuth: number; // current rotation of the cannon
  altitude: number; // elevation angle of the muzzle in radians
  shootRequested: boolean; // if true, shoot when ready

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
    this.cannonRadius = this.displayHeight / 2;
    this.cannonLength = this.displayWidth;

    const originX = this.cannonRadius / this.cannonLength;
    const originY = 0.5;

    this.setOrigin(originX, originY);
    this.shadow = this.gameScene.add
      .sprite(0, 0, CANNON_SPRITE)
      .setTint(0x000000)
      .setAlpha(0.3)
      .setOrigin(originX, originY);

    this.wheels = this.gameScene.add
      .sprite(0, 0, CANNON_WHEELS_SPRITE)
      .setScale(3)
      .setOrigin(0.5, 0.5);

    this.gameScene.add.existing(this);

    this.barrelLength = this.cannonLength * (1 - originX);
    this.altitude = INITIAL_ALTITUDE;
    this.requestedAzymuth = this.azymuth = Phaser.Math.DegToRad(rotationDeg); // Pointing to the top
    this.shootRequested = false;

    this.muzzleParticleEmitter = this.gameScene.add.particles(
      0,
      0,
      PARTICLE_SPRITE,
      {
        speed: {
          min: BULLET.speed * 0.2,
          max: BULLET.speed * 1,
        },
        lifespan: { min: 400, max: 1000 },
        blendMode: "ADD",
        angle: { min: -7, max: 7 },
        frequency: -1,
        quantity: 70,
      }
    );

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
              getStart: () => this.cannonScreen.x,
              getEnd: () =>
                this.cannonScreen.x +
                this.cannonLength *
                  RECOIL_FACTOR *
                  Math.cos(this.rotation + Math.PI),
            },
            y: {
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS,
              getStart: () => this.cannonScreen.y,
              getEnd: () =>
                this.cannonScreen.y +
                this.cannonLength *
                  RECOIL_FACTOR *
                  Math.sin(this.rotation + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.cannonScreen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.cannonScreen.y,
            },
          },
        },
      ],
      onStop: () => {
        const { x, y } = this.cannonScreen;
        this.setPosition(x, y);
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
              getStart: () => this.screen.x,
              getEnd: () =>
                this.screen.x +
                this.cannonLength *
                  RECOIL_FACTOR *
                  Math.cos(this.azymuth + Math.PI),
            },
            y: {
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS,
              getStart: () => this.screen.y,
              getEnd: () =>
                this.screen.y +
                this.cannonLength *
                  RECOIL_FACTOR *
                  Math.sin(this.azymuth + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.screen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS,
              getEnd: () => this.screen.y,
            },
          },
        },
      ],
      onStop: () => {
        const { x, y } = this.screen;
        this.setPosition(x, y);
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
              getStart: () => this.screen.x,
              getEnd: () =>
                this.screen.x +
                this.cannonLength *
                  RECOIL_FACTOR *
                  0.5 *
                  Math.cos(this.azymuth + Math.PI),
            },
            y: {
              delay: PRE_WHEELS_RECOIL_DURATION_MS,
              ease: Phaser.Math.Easing.Expo.Out,
              duration: RECOIL_DURATION_MS - PRE_WHEELS_RECOIL_DURATION_MS,
              getStart: () => this.screen.y,
              getEnd: () =>
                this.screen.y +
                this.cannonLength *
                  RECOIL_FACTOR *
                  0.5 *
                  Math.sin(this.azymuth + Math.PI),
            },
          },
        },
        {
          props: {
            x: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS / 2,
              getEnd: () => this.screen.x,
            },
            y: {
              ease: Phaser.Math.Easing.Linear,
              duration: RECOIL_RETURN_DURATION_MS / 2,
              getEnd: () => this.screen.y,
            },
          },
        },
      ],
      onStop: () => {
        this.wheels.setPosition(this.screen.x, this.screen.y);
      },
    });
  }

  setWorld(world: Phaser.Math.Vector3) {
    this.world = this.world.copy(world);
    this.screen = this.gameScene.getScreenPosition(this.world, this.screen);

    this.cannonWorld.copy(this.world);
    this.cannonWorld.z = this.world.z + CANNON_GROUND_CLEARANCE;
    this.cannonScreen = this.gameScene.getScreenPosition(
      this.cannonWorld,
      this.cannonScreen
    );

    this.dirty = true;
  }

  setRequestedAzymuth(targetScreen: Phaser.Types.Math.Vector2Like) {
    const targetWorld = this.gameScene.getSurfaceWorldPosition(
      targetScreen,
      this._targetWorld
    );

    this.requestedAzymuth = Phaser.Math.Angle.BetweenPoints(
      this.cannonWorld,
      targetWorld
    );
  }

  getMuzzleWorld(velocity: Phaser.Math.Vector3) {
    const worldOffset = this._muzzleWorldOffset
      .copy(velocity)
      .scale(this.barrelLength);
    return this._muzzleWorld.addVectors(this.cannonWorld, worldOffset);
  }

  getVelocity() {
    return velocityVectorFromAzymuthAndAltitude(
      this.azymuth,
      this.altitude,
      this._velocity
    );
  }

  shoot() {
    const velocity = this.getVelocity();
    const muzzleWorld = this.getMuzzleWorld(velocity);
    new Bullet(this.gameScene, muzzleWorld, velocity);
    this.gameScene.cannonBlast.play(this.x, this.y);

    if (DO_RECOIL) {
      this.recoilTween.restart();
      this.shadowRecoilTween.restart();
      this.wheelsRecoilTween.restart();
    }

    const muzzleScreen = this.gameScene.getScreenPosition(
      muzzleWorld,
      this._muzzleScreen
    );

    this.muzzleParticleEmitter
      .setParticleGravity(
        // FIXME?
        0,
        GRAVITY_SI *
          WORLD_UNIT_PER_METER *
          this.gameScene.worldToScreen.z *
          Math.cos(this.rotation)
      )
      .setPosition(muzzleScreen.x, muzzleScreen.y)
      .setRotation(this.rotation)
      .setDepth(muzzleScreen.y)
      .explode();

    this.muzzleFlashEmitter
      .setPosition(muzzleScreen.x, muzzleScreen.y)
      .setRotation(this.rotation)
      .setDepth(muzzleScreen.y)
      .explode();

    this.gameScene.cameras.main.shake(50, 0.002);
  }

  move(delta: number) {
    const rotationNeeded =
      Math.abs(this.azymuth - this.requestedAzymuth) >= 0.01;

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
        TURN_RATE_RADIANS_PER_SECOND * (delta / 1000.0)
      );

      this.dirty = true;
    }
  }

  updateVisuals() {
    this.setPosition(this.cannonScreen.x, this.cannonScreen.y).setDepth(
      this.cannonScreen.y
    );
    this.shadow
      .setPosition(this.screen.x, this.screen.y)
      .setDepth(this.cannonScreen.y - 1);
    this.wheels
      .setPosition(this.screen.x, this.screen.y)
      .setDepth(this.cannonScreen.y - 2);

    const velocity = this.getVelocity();

    // rotate the cannon shadow to the azymuth and the cannon to the azymuth + altitude
    const screenVelocity = this.gameScene.getScreenPosition(
      velocity,
      this._screenVelocity
    );

    const screenAzymuth = this.gameScene.getScreenPosition(
      this._azymuth.set(Math.cos(this.azymuth), Math.sin(this.azymuth), 0),
      this._screenAzymuth
    );
    const screenAzymuthRotation = Math.atan2(screenAzymuth.y, screenAzymuth.x);
    const screenRotation = Math.atan2(screenVelocity.y, screenVelocity.x);

    this.setRotation(screenRotation); // full azymuth + altitude projection
    this.shadow.setRotation(screenAzymuthRotation); // azymuth projection only
    this.wheels.setRotation(
      // azymuth projection only + sprite rotation to zero it out to the right
      CANNON_WHEELS_SPRITE_ROTATION + screenAzymuthRotation
    );

    // scale the length of the cannon to the distance between the cannon and the muzzle
    const muzzleScreen = this.gameScene.getScreenPosition(
      this.getMuzzleWorld(velocity),
      this._muzzleScreen
    );
    const scaleX =
      Phaser.Math.Distance.BetweenPoints(this.cannonScreen, muzzleScreen) /
      this.barrelLength;

    this.scaleX = scaleX;
    this.shadow.scaleX = scaleX;
  }

  requestShoot(targetScreen: Phaser.Types.Math.Vector2Like) {
    this.shootRequested = true;
    this.setRequestedAzymuth(targetScreen);
  }

  preUpdate(time: number, delta: number) {
    const visible = this.gameScene.inViewport(this);
    const timerInterval = visible
      ? VISIBLE_UPDATE_INTERVAL
      : INVISIBLE_UPDATE_INTERVAL;

    this.moveTimer += delta;
    if (this.moveTimer >= timerInterval) {
      this.move(this.moveTimer);
      this.moveTimer = 0;
    }

    if (this.dirty) {
      this.dirty = false;
      this.updateVisuals();
    }
  }

  destroy(): void {
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
