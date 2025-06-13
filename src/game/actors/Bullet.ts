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
import { createCraterMark } from "../lib/createCraterMark";
import { azimuthRadFromVelocityVector } from "../lib/trigo";

const C_d = 0.5; // Drag coefficient (dimensionless), typical value for spheres
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³
const STATIC_PARTICLE_MS = 3000;

export class Bullet extends Phaser.GameObjects.Image implements Solid {
  coordinates: Coordinates;
  shadowCoordinates: Coordinates;
  velocity: Coordinates;
  explosionVelocity: Coordinates;

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

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3, velocity: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, BULLET_SPRITE);
    this.gameScene = gameScene;
    this.shadow = this.gameScene.add
      .image(0, 0, this.texture)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);

    this.velocity = new Coordinates(this, velocity);
    this.coordinates = new Coordinates(this, world);
    this.shadowCoordinates = new Coordinates(this);
    this.explosionVelocity = new Coordinates(this);

    this.dragConstantSI = 0.5 * rho * C_d * Math.PI * BULLET.radiusSI * BULLET.radiusSI; // ½ * ρ * v²
    this.gameScene.add.existing(this);
    this.mass = BULLET.mass;
    this.invMass = BULLET.invMass;
    this.explosionEmitter = this.gameScene.add.particles(0, 0, PARTICLE_SPRITE, {
      frequency: -1,
      radial: false,
      speedX: () =>
        randomNormal(
          this.explosionVelocity.screen.x,
          this.explosionVelocity.length() * this.gameScene.worldToScreen.x * 0.1,
        ),
      speedY: () =>
        randomNormal(
          this.explosionVelocity.screen.y,
          this.explosionVelocity.length() * this.gameScene.worldToScreen.y * 0.1,
        ),
      accelerationX: this.gameScene.gravity.screen.x,
      accelerationY: this.gameScene.gravity.screen.y,
      scale: { onEmit: () => Math.random() * 4 + 1 },
      x: {
        onEmit: () => this.coordinates.screen.x,
        onUpdate: (particle, _key, _t, value) => {
          if (particle.velocityY !== 0 && particle.lifeCurrent < STATIC_PARTICLE_MS) {
            particle.velocityX = 0;
            particle.velocityY = 0;
            particle.accelerationX = 0;
            particle.accelerationY = 0;
          }
          return value;
        },
      },
      y: () => this.coordinates.screen.y,
      lifespan: {
        onEmit: () =>
          (this.explosionVelocity.z * 2 * 1000) / -this.gameScene.gravity.z +
          (Math.random() * 400 - 200) * this.gameScene.worldToScreen.y +
          STATIC_PARTICLE_MS,
      },
    });
  }

  move(delta: number) {
    this.dirty = true;
    if (this.velocity.x === 0 && this.velocity.y === 0 && this.velocity.z === 0) return;
    const speedSq = this.velocity.lengthSq();
    if (speedSq < 1) {
      this.velocity.reset();
      this.coordinates.z = this.gameScene.getSurfaceZFromWorldPosition(this.coordinates) ?? 0;
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
    this.coordinates.x += this.velocity.x * deltaSeconds;
    this.coordinates.y += this.velocity.y * deltaSeconds;
    this.coordinates.z += this.velocity.z * deltaSeconds;
    this.explosion = sphereToGroundCollision(this, speedSq, speed);
  }

  updateVisuals() {
    this.setPosition(this.coordinates.screen.x, this.coordinates.screen.y).setDepth(this.coordinates.screen.y);
    const surfaceZ = this.gameScene.getSurfaceZFromWorldPosition(this.coordinates);
    if (surfaceZ === null) {
      this.shadow.setVisible(false);
    } else {
      this.shadowCoordinates.set(this.coordinates.x, this.coordinates.y, surfaceZ);
      if (this.shadow.visible === false) this.shadow.setVisible(true);
      this.shadow
        .setPosition(this.shadowCoordinates.screen.x, this.shadowCoordinates.screen.y)
        .setDepth(this.shadowCoordinates.screen.y);
    }

    if (this.explosion !== false) {
      this.explosionVelocity.copy(this.velocity).scale(0.7);
      this.explosionEmitter.explode(Phaser.Math.Clamp(this.explosion * 30, 0, 30));
      const radius = Phaser.Math.Clamp(this.explosion * 2.5, 1, 100);

      createCraterMark(this.gameScene, this.coordinates.screen.x, this.coordinates.screen.y, {
        rotation: azimuthRadFromVelocityVector(this.velocity),
        radius,
        stretchX: this.gameScene.worldToScreen.x,
        stretchY: this.gameScene.worldToScreen.y,
        duration: 10000, // Lasts for 10 seconds
        color: 0x1a1a1a, // A dark, brownish-black
      });

      this.gameScene.nudge(this.explosion / 10);

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
