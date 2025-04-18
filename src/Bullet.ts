import * as Phaser from "phaser";
import {
  BULLET_SPRITE,
  INVISIBLE_UPDATE_INTERVAL,
  WORLD_UNIT_PER_METER,
  VISIBLE_UPDATE_INTERVAL,
  BULLET_RADIUS_METERS,
} from "./constants";
import { GameScene } from "./GameScene";
import { sphereToGroundCollision } from "./lib/sphereToGroundCollision"; // Import the collision function

const GRAVITY = 9.81 * WORLD_UNIT_PER_METER; // WU/s^2
const GROUND_FACTOR = 0.7; // Multiplier for horizontal velocity on bounce (1 = no friction)
const BOUNCE_FACTOR = 0.5; // Multiplier for vertical velocity on bounce (0 = no bounce, 1 = perfect bounce)
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

  constructor(
    gameScene: GameScene,
    world: Phaser.Math.Vector3,
    velocity: Phaser.Math.Vector3
  ) {
    super(gameScene, 0, 0, BULLET_SPRITE);

    this.world = world.clone();
    this.velocity = velocity.clone();
    this.gameScene = gameScene;
    // ½ * ρ * v²
    this.dragConstantSI = 0.5 * rho * C_d * BULLET_AREA_M2;
    this.radius = this.height / 2;
    this.gameScene.add.existing(this);
    this.shadowSprite = gameScene.add.image(0, 0, BULLET_SPRITE).setAlpha(0.5);
    this.invMass = 1 / BULLET_MASS_KG;
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

  move(delta: number) {
    const speed = this.velocity.length(); // Speed in World Units / Second
    if (speed === 0) return;

    const SECONDS = delta / 1000; // Convert ms to seconds for physics

    // --- Calculate Drag Acceleration ---
    let ax_drag = 0;
    let ay_drag = 0;
    let az_drag = 0;

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

    // --- Calculate Total Acceleration ---
    // XY acceleration is just drag
    const ax_total = -ax_drag;
    const ay_total = -ay_drag;
    // Z acceleration includes drag AND gravity
    const az_total = -az_drag - GRAVITY; // Subtract gravity

    this.velocity.x += ax_total * SECONDS;
    this.velocity.y += ay_total * SECONDS;
    this.velocity.z += az_total * SECONDS;

    // Update world position based on velocity
    this.world.x += this.velocity.x * SECONDS;
    this.world.y += this.velocity.y * SECONDS;
    this.world.z += this.velocity.z * SECONDS;

    // --- Ground Collision using sphereToGroundCollision ---
    const touchingGround = sphereToGroundCollision(
      this, // Pass the bullet instance (implements Solid interface)
      this.radius
    );

    if (touchingGround) {
      // Stop if slow and on the ground
      const speedSq = this.velocity.lengthSq(); // Use squared speed for efficiency
      // Threshold in (WU/s)^2, adjust as needed (e.g., (1 WU/s)^2)
      const stopSpeedThresholdSq = 1;
      if (speedSq < stopSpeedThresholdSq) {
        this.destroy();
        return;
      }
    }

    const screen = this.gameScene.getScreenPosition(this.world, this._screen);

    this.x = screen.x;
    this.y = screen.y;
  }

  updateVisuals() {
    this.setDepth(this.y);
    const shadowScreen = this.getShadowScreen();
    if (shadowScreen === null) {
      this.shadowSprite.setVisible(false);
    } else {
      if (this.shadowSprite.visible === false)
        this.shadowSprite.setVisible(true);
      this.shadowSprite
        .setPosition(shadowScreen.x, shadowScreen.y)
        .setDepth(this.y - 1);
    }
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
