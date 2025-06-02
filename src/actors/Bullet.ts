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
import { GameScene } from "../scene/game";
import { Collision, Solid, sphereToGroundCollision } from "../collision/sphereToGround"; // Import the collision function

// canon de 12 livres
const C_d = 0.5; // Drag coefficient (dimensionless), typical value for spheres
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³

export class Bullet extends Phaser.GameObjects.Image implements Solid {
  world: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  shadowScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  shadowWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  _screenVelocity: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  private moveTimer = 0;
  private dragTimer = 0;

  private dirty: boolean = true;

  velocity: Phaser.Math.Vector3;
  shadow: Phaser.GameObjects.Image;
  gameScene: GameScene;
  mass: number;
  invMass: number;
  dragConstantSI: number;
  explosionEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  explosion: false | Collision = false; // Explosion effect on next frame

  constructor(gameScene: GameScene, world: Phaser.Math.Vector3, normalizedVelocity: Phaser.Math.Vector3) {
    super(gameScene, 0, 0, BULLET_SPRITE);
    this.gameScene = gameScene;
    this.shadow = this.gameScene.add
      .image(0, 0, this.texture)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);

    this.velocity = normalizedVelocity.clone().scale(BULLET.speed);
    this.setWorld(world);
    this.dragConstantSI = 0.5 * rho * C_d * Math.PI * BULLET.radiusSI * BULLET.radiusSI; // ½ * ρ * v²
    this.gameScene.add.existing(this);
    this.mass = BULLET.mass;
    this.invMass = BULLET.invMass;
    this.explosionEmitter = this.gameScene.add.particles(this.x, this.y, PARTICLE_SPRITE, {
      lifespan: { min: 800, max: 1600 },
      angle: { min: -30, max: 30 },
      speed: { min: 140 * this.gameScene.worldToScreen.z, max: 180 * this.gameScene.worldToScreen.z },
      frequency: -1,
    });
  }

  setWorld(world: Phaser.Math.Vector3) {
    this.world = this.world.copy(world);
    this.screen = this.gameScene.getScreenPosition(this.world, this.screen);
    this.shadowWorld.x = this.world.x;
    this.shadowWorld.y = this.world.y;
    this.shadowWorld.z = this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;

    this.shadowScreen = this.gameScene.getScreenPosition(this.shadowWorld, this.shadowScreen);

    this.dirty = true;
  }

  move(delta: number) {
    if (this.velocity.x === 0 && this.velocity.y === 0 && this.velocity.z === 0) return;
    const speedSq = this.velocity.lengthSq();
    if (speedSq < 1) {
      this.velocity.reset();
      this.world.z = this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;
      this.setWorld(this.world);
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
    this.world.x += this.velocity.x * deltaSeconds;
    this.world.y += this.velocity.y * deltaSeconds;
    this.world.z += this.velocity.z * deltaSeconds;
    this.explosion = sphereToGroundCollision(this, speedSq, speed);

    this.setWorld(this.world);
  }

  updateVisuals() {
    this.setPosition(this.screen.x, this.screen.y).setDepth(this.screen.y);

    if (this.gameScene.getSurfaceZFromWorldPosition(this.world) === null) {
      this.shadow.setVisible(false);
    } else {
      if (this.shadow.visible === false) this.shadow.setVisible(true);
      this.shadow.setPosition(this.shadowScreen.x, this.shadowScreen.y).setDepth(this.shadowScreen.y);
    }

    if (this.explosion !== false) {
      const screenVelocity = this.gameScene.getScreenPosition(this.explosion.velocity, this._screenVelocity);
      const rotation = Math.atan2(screenVelocity.y, screenVelocity.x);

      const gravity = GRAVITY_SI * WORLD_UNIT_PER_METER * this.gameScene.worldToScreen.z;

      const rotationToGround = Phaser.Math.Angle.GetShortestDistance(rotation, Math.PI / 2);

      this.explosionEmitter
        .setParticleGravity(gravity * Math.cos(rotationToGround), gravity * Math.sin(rotationToGround))
        .setPosition(this.screen.x, this.screen.y)
        .setRotation(rotation)
        .explode(Phaser.Math.Clamp(this.explosion.energy * 20, 1, 20));
      this.explosion = false;
    }
  }

  preUpdate(time: number, delta: number) {
    const visible = this.gameScene.inViewport(this);
    const timerInterval = visible ? VISIBLE_UPDATE_INTERVAL : INVISIBLE_UPDATE_INTERVAL;

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

  destroy(): void {
    this.shadow.destroy();
    super.destroy();
  }
}
