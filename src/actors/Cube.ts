import { GameScene } from "../GameScene";
import { WORLD_UNIT_PER_METER } from "../constants";

// Colors for the two squares
const TOP_COLOR = {
  fill: 0xff0000, // Red
  stroke: 0xffffff, // White
  alpha: 0.5,
};
const BOTTOM_COLOR = {
  fill: 0xffff00, // Yellow
  stroke: 0x000000, // Black
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
export class Cube {
  private gameScene: GameScene;
  worldCenter: Phaser.Math.Vector3; // Center of the bottom face in world units
  private halfSizeX: number; // Half size in world units for X
  private halfSizeY: number; // Half size in world units for Y
  private sizeZ: number; // Size in world units for Z (height)

  // --- Geometry (World Space) ---
  private worldVertices: Phaser.Math.Vector3[];

  // --- Rendering (Screen Space - Populated ONLY in updateVisuals) ---
  private container: Phaser.GameObjects.Container;
  private screenVertices: Phaser.Math.Vector2[];
  private topPolygon: Phaser.GameObjects.Polygon;
  private bottomPolygon: Phaser.GameObjects.Polygon;
  // Cache for screen center projection (used for container position and depth)
  private _screenCenter: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  constructor(
    gameScene: GameScene,
    worldCenter: Phaser.Math.Vector3,
    sizeXMeters: number,
    sizeYMeters: number,
    sizeZMeters: number
  ) {
    this.gameScene = gameScene;
    this.worldCenter = worldCenter.clone();

    // Calculate sizes in world units
    const sizeX = sizeXMeters * WORLD_UNIT_PER_METER;
    const sizeY = sizeYMeters * WORLD_UNIT_PER_METER;
    this.sizeZ = sizeZMeters * WORLD_UNIT_PER_METER;
    this.halfSizeX = sizeX / 2;
    this.halfSizeY = sizeY / 2;

    // Initialize world vertices array
    this.worldVertices = Array.from(
      { length: 8 },
      () => new Phaser.Math.Vector3()
    );
    // Initialize screen vertices array (will be populated in updateVisuals)
    this.screenVertices = Array.from(
      { length: 8 },
      () => new Phaser.Math.Vector2()
    );

    // --- Create Container ---
    // Initial position will be set in the first updateVisuals call
    this.container = this.gameScene.add.container(0, 0);
    // --- Create Polygons (relative to container) ---
    // Add them to the container, not the scene directly.
    // Their positions within the container will be (0,0) initially,
    // but their shapes will be defined by points relative to the container's origin.
    this.bottomPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      BOTTOM_COLOR.fill,
      BOTTOM_COLOR.alpha
    );
    this.bottomPolygon.setOrigin(0, 0); // Keep origin at top-left for polygon points
    this.bottomPolygon.isFilled = true;
    this.bottomPolygon.isStroked = true;
    this.bottomPolygon.strokeColor = BOTTOM_COLOR.stroke;
    this.bottomPolygon.lineWidth = 1;
    this.bottomPolygon.closePath = true;
    this.container.add(this.bottomPolygon); // Add to container

    this.topPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      TOP_COLOR.fill,
      TOP_COLOR.alpha
    );
    this.topPolygon.setOrigin(0, 0); // Keep origin at top-left for polygon points
    this.topPolygon.isFilled = true;
    this.topPolygon.isStroked = true;
    this.topPolygon.strokeColor = TOP_COLOR.stroke;
    this.topPolygon.lineWidth = 1;
    this.topPolygon.closePath = true;
    this.container.add(this.topPolygon); // Add to container

    // Initial calculation of world state and rendering
    this.calculateWorldVertices();
    this.updateVisuals(); // First projection and draw
  }

  /** Calculates ONLY world vertex positions based on the current worldCenter. */
  private calculateWorldVertices() {
    const center = this.worldCenter;
    const hsX = this.halfSizeX;
    const hsY = this.halfSizeY;
    const bottomZ = center.z;
    const topZ = center.z + this.sizeZ;

    // Bottom Square Vertices (Indices 0-3)
    this.worldVertices[0].set(center.x - hsX, center.y + hsY, bottomZ);
    this.worldVertices[1].set(center.x + hsX, center.y + hsY, bottomZ);
    this.worldVertices[2].set(center.x + hsX, center.y - hsY, bottomZ);
    this.worldVertices[3].set(center.x - hsX, center.y - hsY, bottomZ);
    // Top Square Vertices (Indices 4-7)
    this.worldVertices[4].set(center.x - hsX, center.y + hsY, topZ);
    this.worldVertices[5].set(center.x + hsX, center.y + hsY, topZ);
    this.worldVertices[6].set(center.x + hsX, center.y - hsY, topZ);
    this.worldVertices[7].set(center.x - hsX, center.y - hsY, topZ);
  }

  /**
   * Projects world positions to screen space, updates the container's position
   * and depth, and updates the polygons' shapes relative to the container.
   * This is the ONLY place screen calculations should occur for this class.
   */
  updateVisuals() {
    // --- Project Center and Set Container Position/Depth ---
    const screenCenter = this.gameScene.getScreenPosition(
      this.worldCenter,
      this._screenCenter // Use cached vector
    );
    this.container.setPosition(screenCenter.x, screenCenter.y);
    this.container.setDepth(screenCenter.y); // Use screen Y for depth sorting

    // --- Project World Vertices to Screen Space ---
    for (let i = 0; i < this.worldVertices.length; i++) {
      this.gameScene.getScreenPosition(
        this.worldVertices[i],
        this.screenVertices[i] // Update the screen vertices array
      );
    }

    // --- Update Polygon Shapes (Relative to Container) ---
    // Calculate points relative to the container's origin (screenCenter)
    const bottomPointsRelative: number[] = [];
    for (let i = 0; i <= 3; i++) {
      bottomPointsRelative.push(
        this.screenVertices[i].x - screenCenter.x,
        this.screenVertices[i].y - screenCenter.y
      );
    }
    this.bottomPolygon.setTo(bottomPointsRelative);

    const topPointsRelative: number[] = [];
    for (let i = 4; i <= 7; i++) {
      topPointsRelative.push(
        this.screenVertices[i].x - screenCenter.x,
        this.screenVertices[i].y - screenCenter.y
      );
    }
    this.topPolygon.setTo(topPointsRelative);

    // Note: Depth sorting within the container is handled by the order they were added.
    // If more complex layering is needed, you could setDepth on the polygons too,
    // e.g., this.bottomPolygon.setDepth(-0.1); this.topPolygon.setDepth(0.1);
  }

  /**
   * Recalculates world vertices and then updates the visuals (container position,
   * polygon shapes relative to container, depth).
   */
  update() {
    this.calculateWorldVertices();
    this.updateVisuals();
  }

  /** Cleans up the container and its children (polygons). */
  destroy() {
    this.container.destroy(); // Destroys container and children
  }
}
