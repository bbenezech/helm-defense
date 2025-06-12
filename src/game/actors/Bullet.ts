import * as Phaser from "phaser";
import {
  BULLET_SPRITE,
  INVISIBLE_UPDATE_INTERVAL_MS,
  WORLD_UNIT_PER_METER,
  VISIBLE_UPDATE_INTERVAL_MS,
  PARTICLE_SPRITE,
  BULLET,
  GRAVITY_SI,
} from "../constants";
import { GameScene } from "../scene/game";
import { sphereToGroundCollision, type Solid } from "../collision/sphere-to-ground"; // Import the collision function
import timeScaleStore from "../../store/time-scale";
import { randomNormal } from "../lib/random";
import { Coordinates } from "../lib/coordinates";

const C_d = 0.5; // Drag coefficient (dimensionless), typical value for spheres
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³
const STATIC_PARTICLE_MS = 3000;

export class Bullet extends Phaser.GameObjects.Image implements Solid {
  position: Coordinates;
  shadowPosition: Coordinates;
  velocity: Coordinates;

  private moveTimer = 0;
  private dragTimer = 0;

  private dirty: boolean = true;

  shadow: Phaser.GameObjects.Image;
  gameScene: GameScene;
  mass: number;
  invMass: number;
  dragConstantSI: number;
  explosionEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  explosion: false | number = false; // Explosion effect on next frame

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3, normalizedVelocity: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, BULLET_SPRITE);
    this.gameScene = gameScene;
    this.shadow = this.gameScene.add
      .image(0, 0, this.texture)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);

    this.velocity = new Coordinates(this, normalizedVelocity);
    this.velocity.scale(BULLET.speed);
    this.position = new Coordinates(this, world);
    this.shadowPosition = new Coordinates(this, world);

    this.dragConstantSI = 0.5 * rho * C_d * Math.PI * BULLET.radiusSI * BULLET.radiusSI; // ½ * ρ * v²
    this.gameScene.add.existing(this);
    this.mass = BULLET.mass;
    this.invMass = BULLET.invMass;
    this.explosionEmitter = this.gameScene.add.particles(0, 0, PARTICLE_SPRITE, {
      frequency: -1,
      radial: false,
      speedX: () => randomNormal(this.velocity.screen.x / 2, 10),
      speedY: () => randomNormal(this.velocity.screen.y / 2, 10),
      accelerationX: this.gameScene.gravity.screen.x,
      accelerationY: this.gameScene.gravity.screen.y,
      x: {
        onEmit: () => this.position.screen.x,
        onUpdate: (particle, _key, _t, value) => {
          if (particle.velocityY !== 0 && particle.lifeCurrent < STATIC_PARTICLE_MS) {
            particle.velocityX = 0;
            particle.velocityY = 0;
            particle.alpha = 0.7;
          }
          return value;
        },
      },
      y: () => this.position.screen.y,
      lifespan: {
        onEmit: () =>
          ((this.velocity.z / 2) * 2 * 1000) / -this.gameScene.gravity.world.z +
          STATIC_PARTICLE_MS +
          Math.random() * 500 -
          250,
      },
    });
  }

  move(delta: number) {
    this.dirty = true;
    if (this.velocity.x === 0 && this.velocity.y === 0 && this.velocity.z === 0) return;
    const speedSq = this.velocity.lengthSq();
    if (speedSq < 1) {
      this.velocity.reset();
      this.position.z = this.gameScene.getSurfaceZFromWorldPosition(this.position) ?? 0;
      return;
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
      const dragAccelerationMagnitude = dragForceMagnitudeSI * this.invMass * WORLD_UNIT_PER_METER;

      const axDrag = dragAccelerationMagnitude * (this.velocity.x / speed);
      const ayDrag = dragAccelerationMagnitude * (this.velocity.y / speed);
      const azDrag = dragAccelerationMagnitude * (this.velocity.z / speed);

      this.velocity.x += -axDrag * dragDeltaSeconds;
      this.velocity.y += -ayDrag * dragDeltaSeconds;
      this.velocity.z += (-azDrag - GRAVITY_SI * WORLD_UNIT_PER_METER) * dragDeltaSeconds;
    }

    const deltaSeconds = delta / 1000; // Convert ms to seconds for physics
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.position.z += this.velocity.z * deltaSeconds;
    this.explosion = sphereToGroundCollision(this, speedSq, speed);
  }

  updateVisuals() {
    this.setPosition(this.position.screen.x, this.position.screen.y).setDepth(this.position.screen.y);
    const surfaceZ = this.gameScene.getSurfaceZFromWorldPosition(this.position);
    if (surfaceZ === null) {
      this.shadow.setVisible(false);
    } else {
      this.shadowPosition.set(this.position.x, this.position.y, surfaceZ);
      if (this.shadow.visible === false) this.shadow.setVisible(true);
      this.shadow
        .setPosition(this.shadowPosition.screen.x, this.shadowPosition.screen.y)
        .setDepth(this.shadowPosition.screen.y);
    }

    if (this.explosion !== false) {
      this.explosionEmitter.explode(Phaser.Math.Clamp(this.explosion * 30, 1, 30));
      this.explosion = false;
    }
  }

  preUpdate(_time: number, delta: number) {
    const timeScale = timeScaleStore.get();
    delta = delta * timeScale; // Convert to seconds and apply speed multiplier
    this.explosionEmitter.timeScale = timeScale;

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
    this.shadow.destroy();
    super.destroy();
  }
}
