import * as Phaser from "phaser";
import {
  BULLET_SHADOW_SPRITE,
  BULLET_SPRITE,
  PIXELS_PER_METER,
} from "./constants";
import { GameScene } from "./GameScene";

const GRAVITY = 9.81 * PIXELS_PER_METER;
const GROUND_FACTOR = 0.7; // Multiplier for horizontal velocity on bounce (1 = no friction)
const BOUNCE_FACTOR = 0.5; // Multiplier for vertical velocity on bounce (0 = no bounce, 1 = perfect bounce)
// canon de 12 livres
const BULLET_MASS_KG = 6;
const BULLET_RADIUS_METERS = 0.06;
const C_d = 0.5;
const rho = 1.225; // Air Density (rho): Standard sea-level density ≈ 1.225 kg/m³

export class Bullet extends Phaser.GameObjects.Image {
  private _screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0);
  private _shadowScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0);
  private _shadowWorld: Phaser.Math.Vector3 = new Phaser.Math.Vector3(0, 0, 0);

  shadowSprite: Phaser.GameObjects.Image;
  gameScene: GameScene;
  dragFactor: number;
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;

  constructor(
    gameScene: GameScene,
    world: Phaser.Math.Vector3,
    velocity: Phaser.Math.Vector3
  ) {
    super(gameScene, 0, 0, BULLET_SPRITE);
    this.world = world.clone();
    this.velocity = velocity.clone();
    this.gameScene = gameScene;
    this.dragFactor =
      (0.5 *
        rho *
        C_d *
        Math.PI *
        BULLET_RADIUS_METERS *
        BULLET_RADIUS_METERS) /
      PIXELS_PER_METER;

    this.gameScene.add.existing(this);
    this.shadowSprite = gameScene.add.sprite(0, 0, BULLET_SHADOW_SPRITE);
  }

  groundElevation(): number {
    const surfaceZ =
      this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0;
    return this.world.z - surfaceZ;
  }

  getShadowWorld(): Phaser.Math.Vector3 | null {
    this._shadowWorld.x = this.world.x;
    this._shadowWorld.y = this.world.y;
    const surfaceZ = this.gameScene.getSurfaceZFromWorldPosition(this.world);

    this._shadowWorld.y = this.world.y;
    if (surfaceZ === null) {
      return null; // No surface, return null
    } else {
      this._shadowWorld.z = surfaceZ;
    }

    return this._shadowWorld;
  }

  getShadowScreen(): Phaser.Math.Vector2 | null {
    const shadowWorld = this.getShadowWorld();
    if (shadowWorld === null) return null; // No surface, return null

    return this.gameScene.getScreenPosition(shadowWorld, this._shadowScreen);
  }

  preUpdate(time: number, delta: number) {
    const SECONDS = delta / 1000; // Convert ms to seconds for physics

    // --- Calculate Drag Acceleration ---
    let ax_drag = 0;
    let ay_drag = 0;
    let az_drag = 0;
    const speed = this.velocity.length();

    if (speed > 0.01) {
      // Avoid division by zero and apply drag only if moving
      // Drag force magnitude = k * speed^2 (simplified from |v|*v)
      // Drag acceleration = F_drag / mass = (k * speed^2) / mass
      // Direction is opposite velocity, so multiply by (-vx/speed), (-vy/speed), (-vz/speed)
      const dragAccelMagnitude =
        (this.dragFactor * speed * speed) / BULLET_MASS_KG;

      ax_drag = -dragAccelMagnitude * (this.velocity.x / speed);
      ay_drag = -dragAccelMagnitude * (this.velocity.y / speed);
      az_drag = -dragAccelMagnitude * (this.velocity.z / speed);
    }

    // --- Calculate Total Acceleration ---
    // XY acceleration is just drag
    const ax_total = ax_drag;
    const ay_total = ay_drag;
    // Z acceleration includes drag AND gravity
    const az_total = az_drag - GRAVITY; // Subtract gravity

    this.velocity.x += ax_total * SECONDS;
    this.velocity.y += ay_total * SECONDS;
    this.velocity.z += az_total * SECONDS;

    // Update world position based on velocity
    this.world.x += this.velocity.x * SECONDS;
    this.world.y += this.velocity.y * SECONDS;
    this.world.z += this.velocity.z * SECONDS;

    const surfaceZ =
      this.gameScene.getSurfaceZFromWorldPosition(this.world) ?? 0; // null means the ground is behind a building, let's assume 0 for now
    // Stop if slow and at ground
    if (speed < 10 && this.world.z <= surfaceZ) {
      this.destroy();
      return;
    }

    if (this.world.z <= surfaceZ && this.velocity.z < 0) {
      // Moving down and at/below ground
      // Correct position
      this.world.z = surfaceZ;

      // Bounce: Reverse and dampen vertical velocity
      this.velocity.z *= -BOUNCE_FACTOR;

      // Friction: Dampen horizontal velocity
      this.velocity.x *= GROUND_FACTOR;
      this.velocity.y *= GROUND_FACTOR;
    }

    const screen = this.gameScene.getScreenPosition(this.world, this._screen);
    this.setPosition(screen.x, screen.y)
      .setScale(1 + this.world.z * 0.003)
      .setDepth(screen.y);

    const shadowScreen = this.getShadowScreen();
    if (shadowScreen === null) {
      this.shadowSprite.setAlpha(0);
    } else
      this.shadowSprite
        .setPosition(shadowScreen.x, shadowScreen.y)
        .setScale(1 + this.world.z * 0.005)
        .setAlpha(Math.max(0.1, 0.5 - this.world.z * 0.003))
        .setDepth(Math.round(screen.y) - 1);
  }

  destroy(): void {
    this.shadowSprite.destroy();
    super.destroy();
  }
}
