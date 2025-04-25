import { Bullet } from "./Bullet";
import {
  WORLD_UNIT_PER_METER,
  SMALL_WORLD_FACTOR,
  PARTICLE_SPRITE,
  CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  PLAY_SOUNDS,
  CANNON_WHEELS_SPRITE_ROTATION,
  INVISIBLE_UPDATE_INTERVAL,
  VISIBLE_UPDATE_INTERVAL,
} from "./constants";
import { GameScene } from "./GameScene";

const PRE_RECOIL_DURATION_MS = 30;
const PRE_WHEELS_RECOIL_DURATION_MS = 100;
const RECOIL_DURATION_MS = 50;
const RECOIL_RETURN_DURATION_MS = 500;
const RECOIL_FACTOR = 0.3;
const DO_RECOIL = true;
const CANNON_GROUND_CLEARANCE = 0.5 * WORLD_UNIT_PER_METER;
const INITIAL_SPEED_METERS_PER_SECOND = 440; // 440 m/s
const INITIAL_ALTITUDE = Phaser.Math.DegToRad(10);
const TURN_RATE_RADIANS_PER_SECOND = Phaser.Math.DegToRad(90);

export class Cannon extends Phaser.GameObjects.Image {
  // cache vectors to avoid creating new ones every frame, do not use directly, use getters
  private _screenVelocity: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _velocity: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
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

  muzzleSpeed: number;
  recoilTween: Phaser.Tweens.TweenChain | null = null;
  shadowRecoilTween: Phaser.Tweens.TweenChain | null = null;
  wheelsRecoilTween: Phaser.Tweens.TweenChain | null = null;
  shadow: Phaser.GameObjects.Image;
  muzzleParticleEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  muzzleFlashEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  cannonLength: number; // width of the cannon sprite
  cannonRadius: number; // half heigth of the cannon sprite
  barrelLength: number; // barrel length is the length of the cannon minus the round part at the back, which actually is the length from origin of rotation to muzzle's end
  wheels: Phaser.GameObjects.Image; // wheels sprite

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
    this.muzzleSpeed =
      (INITIAL_SPEED_METERS_PER_SECOND * WORLD_UNIT_PER_METER) /
      SMALL_WORLD_FACTOR;
    this.altitude = INITIAL_ALTITUDE;
    this.requestedAzymuth = this.azymuth = Phaser.Math.DegToRad(rotationDeg); // Pointing to the top
    this.shootRequested = false;

    this.muzzleParticleEmitter = this.gameScene.add
      .particles(this.x, this.y, PARTICLE_SPRITE, {
        speed: {
          min: this.muzzleSpeed * 0.5,
          max: this.muzzleSpeed * 1.5,
        },
        lifespan: { min: 800, max: 2000 },
        scale: { start: 1, end: 0 },
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
    const cosElev = Math.cos(this.altitude);
    const sinElev = Math.sin(this.altitude);
    const cosAzim = Math.cos(this.azymuth);
    const sinAzim = Math.sin(this.azymuth);
    const barrelLengthWorld =
      this.barrelLength * this.gameScene.screenToWorldHorizontal.x; // the barrel length is measured on the X axis in world units

    this._muzzleWorldOffset.x = barrelLengthWorld * cosElev * cosAzim;
    this._muzzleWorldOffset.y = barrelLengthWorld * cosElev * sinAzim;
    this._muzzleWorldOffset.z = barrelLengthWorld * sinElev;

    this._muzzleWorld.addVectors(this.cannonWorld, this._muzzleWorldOffset);

    return this._muzzleWorld;
  }

  readyToShoot() {
    return (
      Math.abs(this.azymuth - this.requestedAzymuth) < 0.01 &&
      this.recoilTween === null
    );
  }

  getVelocity() {
    const horizontalSpeed = this.muzzleSpeed * Math.cos(this.altitude);
    const verticalSpeed = this.muzzleSpeed * Math.sin(this.altitude);

    this._velocity.set(
      horizontalSpeed * Math.cos(this.azymuth),
      horizontalSpeed * Math.sin(this.azymuth),
      verticalSpeed
    );

    return this._velocity;
  }

  shoot(visible: boolean) {
    const muzzleWorld = this.getMuzzleWorld();
    const bullet = new Bullet(
      this.gameScene,
      muzzleWorld,
      this.getVelocity(),
      this.azymuth
    );

    this.gameScene.bullets.add(bullet);

    if (PLAY_SOUNDS) {
      const blast = Math.ceil(Math.random() * 5);
      this.gameScene.sound.play(`cannon_blast_${blast}`, { volume: 0.5 });
    }

    if (visible) {
      if (DO_RECOIL) {
        const recoilRotation = this.azymuth + Math.PI; // 180 degrees rotation
        const cannonRecoilRotation = this.rotation + Math.PI; // 90 degrees rotation
        const recoilDistance = this.cannonLength * RECOIL_FACTOR;
        const wheelsRecoilDistance = recoilDistance * 0.5;

        this.wheelsRecoilTween = this.gameScene.tweens.chain({
          targets: this.wheels,
          tweens: [
            {
              delay: PRE_RECOIL_DURATION_MS + PRE_WHEELS_RECOIL_DURATION_MS,
              x:
                this.screen.x + wheelsRecoilDistance * Math.cos(recoilRotation),
              y:
                this.screen.y + wheelsRecoilDistance * Math.sin(recoilRotation),
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
              x:
                this.cannonScreen.x +
                recoilDistance * Math.cos(cannonRecoilRotation),
              y:
                this.cannonScreen.y +
                recoilDistance * Math.sin(cannonRecoilRotation),
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

      const muzzleScreen = this.gameScene.getScreenPosition(
        muzzleWorld,
        this._muzzleScreen
      );

      this.muzzleParticleEmitter
        .setParticleGravity(
          0,
          9.8 *
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

  // Rotates the cannon sprite and shadow towards the mouse pointer
  move(delta: number, visible: boolean) {
    // Calculate max rotation step for this frame
    const maxAngleStep = TURN_RATE_RADIANS_PER_SECOND * (delta / 1000.0);

    // Calculate the new azimuth using RotateTo for smooth interpolation
    // This function handles wrapping around -PI/PI and finds the shortest path.
    this.azymuth = Phaser.Math.Angle.RotateTo(
      this.azymuth,
      this.requestedAzymuth,
      maxAngleStep
    );

    if (visible) this.updateVisuals();
  }

  updateVisuals() {
    // Update cannon's rotation
    const velocity = this.getVelocity();
    const screenVelocity = this.gameScene.getScreenPosition(
      velocity,
      this._screenVelocity
    );

    this.shadow.setRotation(this.azymuth);
    this.wheels.setRotation(CANNON_WHEELS_SPRITE_ROTATION + this.azymuth);
    this.rotation = Math.atan2(screenVelocity.y, screenVelocity.x);

    // Update cannon scale based on projected barrel length (perspective effect)
    const muzzleWorld = this.getMuzzleWorld();
    const muzzleScreen = this.gameScene.getScreenPosition(
      muzzleWorld,
      this._muzzleScreen
    );
    this.scaleX =
      Phaser.Math.Distance.BetweenPointsSquared(
        this.cannonScreen,
        muzzleScreen
      ) /
      (this.barrelLength * this.barrelLength);
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
