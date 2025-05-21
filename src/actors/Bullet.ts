import * as Phaser from "phaser";
import {
  BULLET_SPRITE,
  INVISIBLE_UPDATE_INTERVAL,
  WORLD_UNIT_PER_METER,
  VISIBLE_UPDATE_INTERVAL,
  PARTICLE_SPRITE,
  BULLET,
  GRAVITY_SI,
} from "../constants";
import { GameScene } from "../GameScene";
import { Solid, sphereToGroundCollision } from "../collision/sphereToGround"; // Import the collision function

// canon de 12 livres
const C_d = 0.5; // Drag coefficient (dimensionless), typical value for spheres
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³

export class Bullet extends Phaser.GameObjects.Image implements Solid {
  private _screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _shadowScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _shadowWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();

  private moveTimer = 0;
  private dragTimer = 0;

  private dirty: boolean = true;

  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  shadow: Phaser.GameObjects.Image;
  gameScene: GameScene;
  mass: number;
  invMass: number;
  dragConstantSI: number;
  explosionEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  explosion: false | number = false; // Explosion effect on next frame

  constructor(
    gameScene: GameScene,
    world: Phaser.Math.Vector3,
    normalizedVelocity: Phaser.Math.Vector3
  ) {
    super(gameScene, 0, 0, BULLET_SPRITE);

    this.world = world.clone();
    this.velocity = normalizedVelocity.clone().scale(BULLET.speed);
    this.gameScene = gameScene;
    this.dragConstantSI =
      0.5 * rho * C_d * Math.PI * BULLET.radiusSI * BULLET.radiusSI; // ½ * ρ * v²
    this.gameScene.add.existing(this);
    this.shadow = this.gameScene.add
      .image(0, 0, this.texture)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);
    this.mass = BULLET.mass;
    this.invMass = BULLET.invMass;
    this.rotation = Math.atan2(this.velocity.y, this.velocity.x);
    const angle = Phaser.Math.RadToDeg(this.rotation);
    this.explosionEmitter = this.gameScene.add.particles(
      this.x,
      this.y,
      PARTICLE_SPRITE,
      {
        x: () => this.x,
        y: () => this.y,
        lifespan: { min: 500, max: 1000 },
        alpha: { start: 1, end: 0 },
        blendMode: "ADD",
        angle: { min: angle - 60, max: angle + 60 },
        speed: { min: 5, max: 80 },
        frequency: -1,
        gravityX: 0,
        gravityY:
          9.8 *
          WORLD_UNIT_PER_METER *
          this.gameScene.worldToScreen.z *
          Math.cos(this.rotation),
      }
    );
  }

  getShadowScreen(): Phaser.Math.Vector2 | null {
    const surfaceZ = this.gameScene.getSurfaceZFromWorldPosition(this.world);
    if (surfaceZ === null) return null; // No surface, return null

    this._shadowWorld.x = this.world.x;
    this._shadowWorld.y = this.world.y;
    this._shadowWorld.z = surfaceZ;

    return this.gameScene.getScreenPosition(
      this._shadowWorld,
      this._shadowScreen
    );
  }

  move(delta: number): boolean {
    const speedSq = this.velocity.lengthSq();
    if (speedSq === 0) return false;
    if (speedSq < 1) {
      this.velocity.reset();
      this.world.z =
        this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;
      return true;
    }

    // calculate drag every 1/4 of seconds
    this.dragTimer += delta;
    let speed;
    if (this.dragTimer >= 125) {
      const dragDeltaSeconds = this.dragTimer / 1000;
      this.dragTimer = 0;
      speed = Math.sqrt(speedSq);
      const speedSI = speed / WORLD_UNIT_PER_METER;
      // Calculate Drag Force magnitude in SI units (Newtons)
      // F_drag = k * speed_si^2
      // Units: (kg/m) * (m/s)^2 = kg * m / s^2 (Newtons)
      const dragForceMagnitudeSI = this.dragConstantSI * speedSI * speedSI;

      // Calculate Drag Acceleration magnitude
      const dragAccelerationMagnitude =
        dragForceMagnitudeSI * this.invMass * WORLD_UNIT_PER_METER;

      const axDrag = dragAccelerationMagnitude * (this.velocity.x / speed);
      const ayDrag = dragAccelerationMagnitude * (this.velocity.y / speed);
      const azDrag = dragAccelerationMagnitude * (this.velocity.z / speed);

      this.velocity.x += -axDrag * dragDeltaSeconds;
      this.velocity.y += -ayDrag * dragDeltaSeconds;
      this.velocity.z +=
        (-azDrag - GRAVITY_SI * WORLD_UNIT_PER_METER) * dragDeltaSeconds;
    }

    const deltaSeconds = delta / 1000; // Convert ms to seconds for physics
    this.world.x += this.velocity.x * deltaSeconds;
    this.world.y += this.velocity.y * deltaSeconds;
    this.world.z += this.velocity.z * deltaSeconds;

    this.explosion = sphereToGroundCollision(this, speedSq, speed);

    return true;
  }

  updateVisuals() {
    const screen = this.gameScene.getScreenPosition(this.world, this._screen);
    this.x = screen.x;
    this.y = screen.y;

    const shadowScreen = this.getShadowScreen();
    if (shadowScreen === null) {
      this.shadow.setVisible(false);
    } else {
      if (this.shadow.visible === false) this.shadow.setVisible(true);
      this.shadow
        .setPosition(shadowScreen.x, shadowScreen.y)
        .setDepth(shadowScreen.y);
    }

    this.setDepth(this.y);

    if (this.explosion !== false) {
      this.explosionEmitter.explode(
        Phaser.Math.Clamp(this.explosion * 10, 1, 10)
      );
      this.explosion = false;
    }
  }

  preUpdate(time: number, delta: number) {
    const visible = this.gameScene.inViewport(this);
    const timerInterval = visible
      ? VISIBLE_UPDATE_INTERVAL
      : INVISIBLE_UPDATE_INTERVAL;

    this.moveTimer += delta;
    if (this.moveTimer >= timerInterval) {
      this.dirty ||= this.move(this.moveTimer);
      this.moveTimer = 0;
    }

    if (this.gameScene.dirty || this.dirty) {
      this.dirty = false;
      this.updateVisuals();
    }
  }

  destroy(): void {
    this.shadow.destroy();
    super.destroy();
  }
}
