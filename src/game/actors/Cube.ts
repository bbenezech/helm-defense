import { WORLD_UNIT_PER_METER } from "../constants.js";
import type { GameScene } from "../scene/game.js";

// Colors for the two squares
const TOP_COLOR = {
  fill: 0xff_00_00, // Red
  stroke: 0xff_ff_ff, // White
  alpha: 0.5,
};
const BOTTOM_COLOR = {
  fill: 0xff_ff_00, // Yellow
  stroke: 0x00_00_00, // Black
  alpha: 0.5,
};

/**
 * Represents a cuboid defined by two parallel squares (top and bottom faces)
 * in world space for debugging projections.
 * World-space calculations are done first.
 * Screen projection and rendering happen *only* within updateVisuals,
 * positioning a container and setting relative polygon points within it.
 * Uses GameScene projection and depth sorting via the container.
 */
export class Cube extends Phaser.GameObjects.Container {
  gameScene: GameScene;
  world: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  halfSizeX: number; // Half size in world units for X
  halfSizeY: number; // Half size in world units for Y
  sizeZ: number; // Size in world units for Z (height)
  worldRotationZ: number = 0; // Rotation angle in radians around the Z-axis

  // --- Geometry (World Space) ---
  worldVertices: Phaser.Math.Vector3[];

  // --- Rendering (Screen Space - Populated ONLY in updateVisuals) ---
  screenVertices: Phaser.Math.Vector2[];
  topPolygon: Phaser.GameObjects.Polygon;
  bottomPolygon: Phaser.GameObjects.Polygon;
  // Cache for screen center projection (used for container position and depth)
  screen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  dirty: boolean = true;

  constructor(
    gameScene: GameScene,
    sizeXMeters: number,
    sizeYMeters: number,
    sizeZMeters: number,
    worldRotationZ: number,
  ) {
    super(gameScene, 0, 0);
    this.gameScene = gameScene;
    this.worldRotationZ = worldRotationZ; // Default rotation

    // Calculate sizes in world units
    const sizeX = sizeXMeters * WORLD_UNIT_PER_METER;
    const sizeY = sizeYMeters * WORLD_UNIT_PER_METER;
    this.sizeZ = sizeZMeters * WORLD_UNIT_PER_METER;
    this.halfSizeX = sizeX / 2;
    this.halfSizeY = sizeY / 2;

    // Initialize world vertices array
    this.worldVertices = Array.from({ length: 8 }, () => new Phaser.Math.Vector3());
    // Initialize screen vertices array (will be populated in updateVisuals)
    this.screenVertices = Array.from({ length: 8 }, () => new Phaser.Math.Vector2());

    // --- Create Container ---
    // Initial position will be set in the first updateVisuals call
    this.gameScene.add.existing(this);
    // --- Create Polygons (relative to container) ---
    // Add them to the container, not the scene directly.
    // Their positions within the container will be (0,0) initially,
    // but their shapes will be defined by points relative to the container's origin.
    this.bottomPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      BOTTOM_COLOR.fill,
      BOTTOM_COLOR.alpha,
    );
    this.bottomPolygon.setOrigin(0, 0); // Keep origin at top-left for polygon points
    this.bottomPolygon.isFilled = true;
    this.bottomPolygon.isStroked = true;
    this.bottomPolygon.strokeColor = BOTTOM_COLOR.stroke;
    this.bottomPolygon.lineWidth = 1;
    this.bottomPolygon.closePath = true;
    this.add(this.bottomPolygon); // Add to container

    this.topPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      TOP_COLOR.fill,
      TOP_COLOR.alpha,
    );
    this.topPolygon.setOrigin(0, 0); // Keep origin at top-left for polygon points
    this.topPolygon.isFilled = true;
    this.topPolygon.isStroked = true;
    this.topPolygon.strokeColor = TOP_COLOR.stroke;
    this.topPolygon.lineWidth = 1;
    this.topPolygon.closePath = true;
    this.add(this.topPolygon); // Add to container

    // Initial calculation of world state and rendering
    this.calculateWorldVertices();
  }

  /** Calculates ONLY world vertex positions based on the current worldCenter. */
  private calculateWorldVertices() {
    const hsX = this.halfSizeX;
    const hsY = this.halfSizeY;
    const bottomZ = 0; // Relative Z for bottom face
    const topZ = this.sizeZ; // Relative Z for top face

    // 1. Define vertices relative to local origin (0, 0, 0)
    const localVertices = [
      // Bottom face
      new Phaser.Math.Vector3(-hsX, +hsY, bottomZ),
      new Phaser.Math.Vector3(+hsX, +hsY, bottomZ),
      new Phaser.Math.Vector3(+hsX, -hsY, bottomZ),
      new Phaser.Math.Vector3(-hsX, -hsY, bottomZ),
      // Top face
      new Phaser.Math.Vector3(-hsX, +hsY, topZ),
      new Phaser.Math.Vector3(+hsX, +hsY, topZ),
      new Phaser.Math.Vector3(+hsX, -hsY, topZ),
      new Phaser.Math.Vector3(-hsX, -hsY, topZ),
    ];

    // 2. Apply rotation around Z-axis (using a temporary matrix or quaternion)
    // For simplicity, let's use direct rotation calculation here
    const cosR = Math.cos(this.worldRotationZ);
    const sinR = Math.sin(this.worldRotationZ);

    // 3. Rotate and translate to final world positions
    for (const [index, local] of localVertices.entries()) {
      const rotatedX = local.x * cosR - local.y * sinR;
      const rotatedY = local.x * sinR + local.y * cosR;
      this.worldVertices[index].set(
        this.world.x + rotatedX,
        this.world.y + rotatedY,
        this.world.z + local.z, // Add world center Z offset
      );
    }
  }

  setWorld(world: Phaser.Math.Vector3) {
    this.world.copy(world);
    this.screen = this.gameScene.worldToScreen(this.world, this.screen);
    this.calculateWorldVertices();

    this.dirty = true;
  }

  /**
   * Projects world positions to screen space, updates the container's position
   * and depth, and updates the polygons' shapes relative to the container.
   * This is the ONLY place screen calculations should occur for this class.
   */
  updateVisuals() {
    this.setPosition(this.screen.x, this.screen.y);
    this.setRotation(0);

    // --- Project Center and Set Container Position/Depth ---
    this.setDepth(this.y); // Use screen Y for depth sorting

    // --- Project World Vertices to Screen Space ---
    for (let index = 0; index < this.worldVertices.length; index++) {
      this.gameScene.worldToScreen(
        this.worldVertices[index],
        this.screenVertices[index], // Update the screen vertices array
      );
    }

    // --- Update Polygon Shapes (Relative to Container) ---
    // Calculate points relative to the container's origin (screenCenter)
    const bottomPointsRelative: number[] = [];
    for (let index = 0; index <= 3; index++) {
      bottomPointsRelative.push(this.screenVertices[index].x - this.x, this.screenVertices[index].y - this.y);
    }
    this.bottomPolygon.setTo(bottomPointsRelative);

    const topPointsRelative: number[] = [];
    for (let index = 4; index <= 7; index++) {
      topPointsRelative.push(this.screenVertices[index].x - this.x, this.screenVertices[index].y - this.y);
    }
    this.topPolygon.setTo(topPointsRelative);
  }

  preUpdate(_time: number, _delta: number) {
    if (this.dirty || this.gameScene.dirty) {
      this.dirty = false;
      this.updateVisuals();
    }
  }

  override destroy(): void {
    this.bottomPolygon.destroy();
    this.topPolygon.destroy();
    super.destroy();
  }
}
