import { Bullet } from "./Bullet";
import {
  WORLD_UNIT_PER_METER,
  PARTICLE_SPRITE,
  CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  PLAY_SOUNDS,
  CANNON_WHEELS_SPRITE_ROTATION,
  INVISIBLE_UPDATE_INTERVAL,
  VISIBLE_UPDATE_INTERVAL,
  BULLET,
  GRAVITY_SI,
} from "../constants";
import { GameScene } from "../GameScene";
import { log } from "../lib/log";

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

  gameScene: GameScene;
  // base position of the shadow sprite and wheel sprite
  screen: Phaser.Math.Vector2;
  world: Phaser.Math.Vector3;
  // screen position of the cannon sprite
  cannonScreen: Phaser.Math.Vector2;
  cannonWorld: Phaser.Math.Vector3;

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
  cooldown: number = 0; // cooldown time in ms

  private moveTimer: number = 0; // Timer to accumulate delta time for move updates

  constructor(
    gameScene: GameScene,
    world: Phaser.Math.Vector3,
    rotationDeg: number
  ) {
    const cannonWorld = world.clone();
    cannonWorld.z += CANNON_GROUND_CLEARANCE;
    const cannonScreen = gameScene.getScreenPosition(
      cannonWorld,
      new Phaser.Math.Vector2()
    );

    super(gameScene, cannonScreen.x, cannonScreen.y, CANNON_SPRITE);

    this.gameScene = gameScene;
    this.world = world;
    this.screen = gameScene.getScreenPosition(world, new Phaser.Math.Vector2());
    this.cannonWorld = cannonWorld;
    this.cannonScreen = cannonScreen;
    this.cannonRadius = this.displayHeight / 2;
    this.cannonLength = this.displayWidth;

    const originX = this.cannonRadius / this.cannonLength;
    const originY = 0.5;

    this.gameScene.add.existing(
      this.setOrigin(originX, originY).setDepth(this.y)
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
    this.altitude = INITIAL_ALTITUDE;
    this.requestedAzymuth = this.azymuth = Phaser.Math.DegToRad(rotationDeg); // Pointing to the top
    this.shootRequested = false;

    this.muzzleParticleEmitter = this.gameScene.add
      .particles(this.x, this.y, PARTICLE_SPRITE, {
        speed: {
          min: BULLET.speed * 0.2,
          max: BULLET.speed * 1,
        },
        lifespan: { min: 400, max: 1000 },
        blendMode: "ADD",
        angle: { min: -7, max: 7 },
        frequency: -1,
        quantity: 70,
      })
      .setDepth(this.y);

    this.muzzleFlashEmitter = this.gameScene.add
      .particles(this.x, this.y, FLARES, {
        color: [0xfacc22, 0xf89800, 0xf83600, 0x040404],
        colorEase: "quart.out",
        scale: 0.2,
        lifespan: { min: 0, max: 1500 },
        angle: { min: -20, max: 20 },
        speed: { min: 10, max: 150 },
        blendMode: "ADD",
        frequency: -1,
        quantity: 20,
      })
      .setDepth(this.y);

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
        this.setPosition(this.cannonScreen.x, this.cannonScreen.y);
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
        this.setPosition(this.screen.x, this.screen.y);
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

    this.updateVisuals();
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

  getMuzzleWorld() {
    return this._muzzleWorld.addVectors(
      this.cannonWorld,
      this.getMuzzleWorldOffset()
    );
  }

  readyToShoot() {
    return (
      this.cooldown <= 0 &&
      Math.abs(this.azymuth - this.requestedAzymuth) < 0.01
    );
  }

  getVelocity() {
    const horizontalSpeed = Math.cos(this.altitude);
    return this._velocity.set(
      horizontalSpeed * Math.cos(this.azymuth),
      horizontalSpeed * Math.sin(this.azymuth),
      Math.sin(this.altitude)
    );
  }

  getMuzzleWorldOffset() {
    return this._muzzleWorldOffset
      .copy(this.getVelocity())
      .scale(this.barrelLength);
  }

  shoot(visible: boolean) {
    log("cannon shoot");
    this.cooldown = COOLDOWN_MS; // 1 second cooldown
    const muzzleWorld = this.getMuzzleWorld();
    new Bullet(this.gameScene, muzzleWorld, this.getVelocity());

    if (PLAY_SOUNDS) {
      const blast = Math.ceil(Math.random() * 5);
      this.gameScene.sound.play(`cannon_blast_${blast}`, { volume: 0.5 });
    }

    if (visible) {
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
          0,
          GRAVITY_SI *
            WORLD_UNIT_PER_METER *
            this.gameScene.worldToScreen.z *
            Math.cos(this.azymuth)
        )
        .setPosition(muzzleScreen.x, muzzleScreen.y)
        .setRotation(this.rotation)
        .explode();

      this.muzzleFlashEmitter
        .setPosition(muzzleScreen.x, muzzleScreen.y)
        .setRotation(this.rotation)
        .explode();

      this.gameScene.cameras.main.shake(50, 0.002);
    }
  }

  move(delta: number, visible: boolean) {
    const maxAngleStep = TURN_RATE_RADIANS_PER_SECOND * (delta / 1000.0);
    this.azymuth = Phaser.Math.Angle.RotateTo(
      this.azymuth,
      this.requestedAzymuth,
      maxAngleStep
    );

    if (visible) this.updateVisuals();
  }

  updateVisuals() {
    // rotate the cannon shadow to the azymuth and the cannon to the azymuth + altitude
    const screenVelocity = this.gameScene.getScreenPosition(
      this.getVelocity(),
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
      this.getMuzzleWorld(),
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
    if (this.cooldown > 0) this.cooldown -= delta;
    const visible = this.gameScene.inViewport(this);
    const timerInterval = visible
      ? VISIBLE_UPDATE_INTERVAL
      : INVISIBLE_UPDATE_INTERVAL;

    if (this.readyToShoot()) {
      if (this.shootRequested) {
        this.shootRequested = false;
        this.shoot(visible);
      }
    } else {
      this.moveTimer += delta;
      if (this.moveTimer >= timerInterval) {
        this.move(this.moveTimer, visible);
        this.moveTimer = 0;
      }
    }
  }
}
