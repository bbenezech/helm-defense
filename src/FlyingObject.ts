import * as Phaser from "phaser";
import { BULLET_SHADOW_SPRITE, PIXELS_PER_METER } from "./constants";
import { GameScene } from "./GameScene";

const GRAVITY = 9.81 * PIXELS_PER_METER;
const GROUND_FACTOR = 0.7; // Multiplier for horizontal velocity on bounce (1 = no friction)
const BOUNCE_FACTOR = 0.5; // Multiplier for vertical velocity on bounce (0 = no bounce, 1 = perfect bounce)
// canon de 12 livres
const BULLET_MASS_KG = 6;
const BULLET_RADIUS_METERS = 0.06;
const CANNON_LENGTH_METERS = 2.43;
const C_d = 0.5;
const A = Math.PI * BULLET_RADIUS_METERS * BULLET_RADIUS_METERS; // Cross Sectional Area
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³

export class FlyingObject extends Phaser.GameObjects.Sprite {
  public shadowSprite: Phaser.GameObjects.Image;
  public world: GameScene;
  public worldX: number;
  public worldY: number;
  public worldZ: number; // Height above ground
  public vx: number; // Velocity in world X
  public vy: number; // Velocity in world Y
  public vz: number; // Velocity in world Z (vertical)
  public dragFactor: number;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    sprite: string
  ) {
    super(scene, x, y, sprite);
    scene.add.existing(this);
    this.world = scene;
    this.worldX = x;
    this.worldY = y;
    this.worldZ = z;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.dragFactor =
      (0.5 *
        rho *
        C_d *
        Math.PI *
        BULLET_RADIUS_METERS *
        BULLET_RADIUS_METERS) /
      PIXELS_PER_METER;

    this.shadowSprite = scene.add
      .sprite(x, y, BULLET_SHADOW_SPRITE)
      .setAlpha(0.5); // Initial alpha
    this.updateVisuals();
  }

  elevation(): number {
    return this.worldZ - this.world.getGroundZ(this.worldX, this.worldY);
  }

  speed(): number {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy + this.vz * this.vz);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    const SECONDS = delta / 1000; // Convert ms to seconds for physics

    // --- Calculate Drag Acceleration ---
    let ax_drag = 0;
    let ay_drag = 0;
    let az_drag = 0;
    const speed = this.speed();

    if (speed > 0.01) {
      // Avoid division by zero and apply drag only if moving
      // Drag force magnitude = k * speed^2 (simplified from |v|*v)
      // Drag acceleration = F_drag / mass = (k * speed^2) / mass
      // Direction is opposite velocity, so multiply by (-vx/speed), (-vy/speed), (-vz/speed)
      const dragAccelMagnitude =
        (this.dragFactor * speed * speed) / BULLET_MASS_KG;

      ax_drag = -dragAccelMagnitude * (this.vx / speed);
      ay_drag = -dragAccelMagnitude * (this.vy / speed);
      az_drag = -dragAccelMagnitude * (this.vz / speed);
    }

    // --- Calculate Total Acceleration ---
    // XY acceleration is just drag
    const ax_total = ax_drag;
    const ay_total = ay_drag;
    // Z acceleration includes drag AND gravity
    const az_total = az_drag - GRAVITY; // Subtract gravity

    this.vx += ax_total * SECONDS;
    this.vy += ay_total * SECONDS;
    this.vz += az_total * SECONDS;

    // Update world position based on velocity
    this.worldX += this.vx * SECONDS;
    this.worldY += this.vy * SECONDS;
    this.worldZ += this.vz * SECONDS;

    const speedInMetersPerSecond = speed / PIXELS_PER_METER;
    const groundZ = this.world.getGroundZ(this.worldX, this.worldY);
    // Stop if slow and at ground
    if (speedInMetersPerSecond < 10 && this.worldZ <= groundZ) {
      this.destroy();
      return;
    }

    if (this.worldZ <= groundZ && this.vz < 0) {
      // Moving down and at/below ground
      // Correct position
      this.worldZ = groundZ;

      // Bounce: Reverse and dampen vertical velocity
      this.vz *= -BOUNCE_FACTOR;

      // Friction: Dampen horizontal velocity
      this.vx *= GROUND_FACTOR;
      this.vy *= GROUND_FACTOR;
    }

    this.updateVisuals();
  }

  updateVisuals(): void {
    const groundZ = this.world.getGroundZ(this.worldX, this.worldY);

    // Calculate screen position based on world coords and Z-height offset
    const screenX = this.worldX;
    const screenY = this.world.getTiltedY(
      this.worldX,
      this.worldY,
      this.worldZ
    );

    // Apply position and scale to the main sprite
    this.setPosition(screenX, screenY).setScale(1 + this.worldZ * 0.004); // 1 when Z=0, scales up with Z

    // Update Shadow Position (Projected onto ground plane visually)
    // Shadow's Y also needs the tilt offset, but based on the ground's Z
    const shadowScreenY = this.world.getTiltedY(
      this.worldX,
      this.worldY,
      groundZ
    );

    // Update shadow visual properties based on bullet's height (worldZ)
    this.shadowSprite
      .setPosition(this.worldX, shadowScreenY)
      .setScale(1 + this.worldZ * 0.006)
      .setAlpha(Math.max(0.1, 0.5 - this.worldZ * 0.003));

    // Depth sorting (simple version based on screenY)
    // Multiply by a factor to spread out depth values
    this.setDepth(Math.round(screenY) * 100000);
    // Ensure shadow is directly below the sprite it belongs to visually
    this.shadowSprite.setDepth(Math.round(screenY) - 1);
  }

  destroy(): void {
    this.shadowSprite.destroy();
    super.destroy();
  }
}
