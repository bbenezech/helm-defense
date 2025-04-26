import * as Phaser from "phaser";
import {
  BULLET_SPRITE,
  INVISIBLE_UPDATE_INTERVAL,
  WORLD_UNIT_PER_METER,
  VISIBLE_UPDATE_INTERVAL,
  BULLET_RADIUS_METERS,
  PARTICLE_SPRITE,
} from "./constants";
import { GameScene } from "./GameScene";
import { sphereToGroundCollision } from "./lib/sphereToGroundCollision"; // Import the collision function

const GRAVITY = 9.81 * WORLD_UNIT_PER_METER; // WU/s^2
// canon de 12 livres
const BULLET_MASS_KG = 6;
const C_d = 0.5; // Drag coefficient (dimensionless), typical value for spheres
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³
const BULLET_AREA_M2 = Math.PI * BULLET_RADIUS_METERS * BULLET_RADIUS_METERS; // Cross-sectional area in m^2

export class Bullet extends Phaser.GameObjects.Image {
  private _screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _shadowScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _shadowWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3();

  private moveTimer = 0;

  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  shadowSprite: Phaser.GameObjects.Image;
  gameScene: GameScene;
  dragConstantSI: number;
  radius: number;
  invMass: number;
  explosionEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  rotation: number;

  constructor(
    gameScene: GameScene,
    world: Phaser.Math.Vector3,
    velocity: Phaser.Math.Vector3,
    rotation: number
  ) {
    super(gameScene, 0, 0, BULLET_SPRITE);

    this.world = world.clone();
    this.velocity = velocity.clone();
    this.rotation = rotation;
    this.gameScene = gameScene;
    // ½ * ρ * v²
    this.dragConstantSI = 0.5 * rho * C_d * BULLET_AREA_M2;
    this.radius = this.height / 2;
    this.gameScene.add.existing(this);
    this.shadowSprite = gameScene.add
      .image(0, 0, BULLET_SPRITE)
      .setAlpha(0.5)
      .setScale(this.gameScene.worldToScreen.x, this.gameScene.worldToScreen.y);
    this.invMass = 1 / BULLET_MASS_KG;
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

    this.updateVisuals();
  }

  groundElevation(): number {
    const surfaceZ =
      this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;
    return this.world.z - surfaceZ;
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

  stop() {
    this.velocity.reset();
    const surfaceZ =
      this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;
    this.world.z = surfaceZ + this.radius; // Set to ground level
  }

  stopped() {
    return (
      this.velocity.x === 0 && this.velocity.y === 0 && this.velocity.z === 0
    );
  }

  move(delta: number) {
    if (this.stopped()) return;
    if (this.velocity.lengthSq() < 1) {
      this.stop();
      return;
    }

    const SECONDS = delta / 1000; // Convert ms to seconds for physics

    // --- Calculate Drag Acceleration ---
    let ax_drag = 0;
    let ay_drag = 0;
    let az_drag = 0;

    const speed = this.velocity.length(); // Speed in World Units / Second
    const speed_si = speed / WORLD_UNIT_PER_METER; // Units: (WU/s) / (WU/m) = m/s
    // Calculate Drag Force magnitude in SI units (Newtons)
    // F_drag = k * speed_si^2
    // Units: (kg/m) * (m/s)^2 = kg * m / s^2 (Newtons)
    const F_drag_magnitude_si = this.dragConstantSI * speed_si * speed_si;

    // Calculate Drag Acceleration magnitude in SI units (m/s^2)
    // a = F / m
    // Units: (kg * m / s^2) / kg = m / s^2
    const accel_drag_magnitude_si = F_drag_magnitude_si / BULLET_MASS_KG;

    // Convert Drag Acceleration magnitude back to World Units (World Units / s^2)
    // Units: (m / s^2) * (WU / m) = WU / s^2
    const accel_drag_magnitude_world =
      accel_drag_magnitude_si * WORLD_UNIT_PER_METER;

    ax_drag = accel_drag_magnitude_world * (this.velocity.x / speed);
    ay_drag = accel_drag_magnitude_world * (this.velocity.y / speed);
    az_drag = accel_drag_magnitude_world * (this.velocity.z / speed);

    const ax_total = -ax_drag;
    const ay_total = -ay_drag;
    const az_total = -az_drag - GRAVITY; // Subtract gravity

    this.velocity.x += ax_total * SECONDS;
    this.velocity.y += ay_total * SECONDS;
    this.velocity.z += az_total * SECONDS;

    this.world.x += this.velocity.x * SECONDS;
    this.world.y += this.velocity.y * SECONDS;
    this.world.z += this.velocity.z * SECONDS;

    // --- Ground Collision using sphereToGroundCollision ---
    const tnt_kg = sphereToGroundCollision(
      this, // Pass the bullet instance (implements Solid interface)
      this.radius
    );

    if (tnt_kg !== false) {
      this.explosionEmitter.explode(Phaser.Math.Clamp(tnt_kg * 10, 1, 10));
    }
  }

  updateVisuals() {
    const screen = this.gameScene.getScreenPosition(this.world, this._screen);
    this.x = screen.x;
    this.y = screen.y;

    const shadowScreen = this.getShadowScreen();
    if (shadowScreen === null) {
      this.shadowSprite.setVisible(false);
    } else {
      if (this.shadowSprite.visible === false)
        this.shadowSprite.setVisible(true);
      this.shadowSprite
        .setPosition(shadowScreen.x, shadowScreen.y)
        .setDepth(shadowScreen.y);
    }

    this.setDepth(this.y);
  }

  preUpdate(time: number, delta: number) {
    const visible = true;
    const timerInterval = visible
      ? VISIBLE_UPDATE_INTERVAL
      : INVISIBLE_UPDATE_INTERVAL;
    this.moveTimer += delta;
    if (this.moveTimer >= timerInterval) {
      this.move(this.moveTimer);
      if (visible) this.updateVisuals();
      this.moveTimer = 0;
    }
  }

  destroy(): void {
    this.shadowSprite.destroy();
    super.destroy();
  }
}
