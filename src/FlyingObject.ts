import * as Phaser from "phaser";
import {
  GRAVITY,
  BOUNCE_FACTOR,
  GROUND_FRICTION,
  TILT_FACTOR,
  PIXELS_PER_METER,
} from "./constants";
import { World } from "./World";

export class FlyingObject extends Phaser.GameObjects.Image {
  public shadowSprite: Phaser.GameObjects.Image;
  public world: World;
  public worldX: number;
  public worldY: number;
  public worldZ: number; // Height above ground
  public vx: number; // Velocity in world X
  public vy: number; // Velocity in world Y
  public vz: number; // Velocity in world Z (vertical)

  constructor(
    scene: World,
    x: number,
    y: number,
    z: number, // Initial world position
    vx: number,
    vy: number,
    vz: number, // Initial velocity
    sprite: string
  ) {
    super(scene, x, y, sprite);
    scene.add.existing(this);
    this.world = scene;
    this.worldX = x;
    this.worldY = y;
    this.worldZ = z + scene.getGroundHeight(x, y); // Adjust Z to ground height
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.shadowSprite = scene.add.sprite(x, y, "shadow").setAlpha(0.5); // Initial alpha
    this.updateVisuals();
  }

  elevation(): number {
    return this.worldZ - this.world.getGroundHeight(this.worldX, this.worldY);
  }

  update(time: number, delta: number): boolean {
    const deltaSecs = delta / 1000; // Convert ms to seconds for physics

    // Apply gravity
    this.vz -= GRAVITY * PIXELS_PER_METER * deltaSecs;

    // Update world position based on velocity
    this.worldX += this.vx * deltaSecs;
    this.worldY += this.vy * deltaSecs;
    this.worldZ += this.vz * deltaSecs;

    const speedInMetersPerSecond =
      Math.sqrt(this.vx * this.vx + this.vy * this.vy) / PIXELS_PER_METER;
    const groundZ = this.world.getGroundHeight(this.worldX, this.worldY);
    // Stop if slow and at ground
    if (speedInMetersPerSecond < 10 && this.worldZ <= groundZ) return false;

    if (this.worldZ <= groundZ && this.vz < 0) {
      // Moving down and at/below ground
      // Correct position
      this.worldZ = groundZ;

      // Bounce: Reverse and dampen vertical velocity
      this.vz *= -BOUNCE_FACTOR;

      // Friction: Dampen horizontal velocity
      this.vx *= GROUND_FRICTION;
      this.vy *= GROUND_FRICTION;
    }

    this.updateVisuals();

    return true;
  }

  updateVisuals(): void {
    const groundZ = this.world.getGroundHeight(this.worldX, this.worldY);

    // Calculate screen position based on world coords and Z-height offset
    const screenX = this.worldX;
    const screenY = this.worldY - this.worldZ * TILT_FACTOR; // Higher Z moves it up screen

    // Apply position and scale to the main sprite
    this.setPosition(screenX, screenY).setScale(1 + this.worldZ * 0.008); // 1 when Z=0, scales up with Z

    // Update Shadow Position (Projected onto ground plane visually)
    // Shadow's Y also needs the tilt offset, but based on the ground's Z
    const shadowScreenY = this.worldY - groundZ * TILT_FACTOR;
    // Update shadow visual properties based on bullet's height (worldZ)
    this.shadowSprite
      .setPosition(this.worldX, shadowScreenY)
      .setScale(1 + this.worldZ * 0.006)
      .setAlpha(Math.max(0.1, 0.5 - this.worldZ * 0.003));

    // Depth sorting (simple version based on screenY)
    // Multiply by a factor to spread out depth values
    this.setDepth(Math.round(screenY));
    // Ensure shadow is directly below the sprite it belongs to visually
    this.shadowSprite.setDepth(Math.round(screenY) - 1);
  }

  destroy(): void {
    this.shadowSprite.destroy();
    super.destroy();
  }
}
