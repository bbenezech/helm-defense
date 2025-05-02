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
 * All world-space calculations are done first.
 * Screen projection and rendering happen *only* within updateVisuals.
 * Uses GameScene projection and depth sorting.
 */
export class Cube {
  private gameScene: GameScene;
  worldCenter: Phaser.Math.Vector3; // Center of the bottom face in world units
  private halfSizeX: number; // Half size in world units for X
  private halfSizeY: number; // Half size in world units for Y
  private sizeZ: number; // Size in world units for Z (height)

  // --- Geometry (World Space) ---
  // 8 Vertices: 4 for bottom square, 4 for top square
  private worldVertices: Phaser.Math.Vector3[];

  // --- Rendering (Screen Space - Populated ONLY in updateVisuals) ---
  private screenVertices: Phaser.Math.Vector2[];
  private topPolygon: Phaser.GameObjects.Polygon;
  private bottomPolygon: Phaser.GameObjects.Polygon;
  // Cache for screen center projection (used for depth)
  private _screenCenter: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

  // Optional: Container if rotation is needed later
  // private container: Phaser.GameObjects.Container;

  constructor(
    gameScene: GameScene,
    worldCenter: Phaser.Math.Vector3,
    sizeXMeters: number, // Default to 1 meter
    sizeYMeters: number,
    sizeZMeters: number // Default to 1 meter
  ) {
    this.gameScene = gameScene;
    this.worldCenter = worldCenter.clone();

    // Calculate sizes in world units
    const sizeX = sizeXMeters * WORLD_UNIT_PER_METER;
    const sizeY = sizeYMeters * WORLD_UNIT_PER_METER;
    this.sizeZ = sizeZMeters * WORLD_UNIT_PER_METER;
    // Calculate half size for vertex offsets
    this.halfSizeX = sizeX / 2;
    this.halfSizeY = sizeY / 2;
    // Initialize world vertices array (will be calculated in updateVertices)
    this.worldVertices = Array.from(
      { length: 8 },
      () => new Phaser.Math.Vector3()
    );
    // Initialize screen vertices array
    this.screenVertices = Array.from(
      { length: 8 },
      () => new Phaser.Math.Vector2()
    );

    // Create Polygon objects (initially empty or with placeholder points)
    // Their positions and shapes will be set in the first updateVisuals call
    this.bottomPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      BOTTOM_COLOR.fill,
      BOTTOM_COLOR.alpha
    );
    this.bottomPolygon.setOrigin(0, 0); // Vertices will be absolute screen coords
    this.bottomPolygon.isFilled = true;
    this.bottomPolygon.isStroked = true;
    this.bottomPolygon.strokeColor = BOTTOM_COLOR.stroke;
    this.bottomPolygon.lineWidth = 1;
    this.bottomPolygon.closePath = true;

    this.topPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1], // Placeholder points
      TOP_COLOR.fill,
      TOP_COLOR.alpha
    );
    this.topPolygon.setOrigin(0, 0); // Vertices will be absolute screen coords
    this.topPolygon.isFilled = true;
    this.topPolygon.isStroked = true;
    this.topPolygon.strokeColor = TOP_COLOR.stroke;
    this.topPolygon.lineWidth = 1;
    this.topPolygon.closePath = true;

    // Initial calculation of world state and rendering
    this.calculateWorldVertices();
    this.updateVisuals(); // First projection and draw
  }

  /** Calculates ONLY world vertex positions based on the current worldCenter. */
  private calculateWorldVertices() {
    const center = this.worldCenter;
    const hsX = this.halfSizeX;
    const hsY = this.halfSizeY;
    const bottomZ = center.z; // Bottom face at the Z level of the center point
    const topZ = center.z + this.sizeZ; // Top face 'sizeZ' world units above the center point Z

    // Define 8 world vertices relative to the potentially updated worldCenter
    // Bottom Square Vertices (Z = bottomZ) - Indices 0-3 (CCW from above)
    this.worldVertices[0].set(center.x - hsX, center.y + hsY, bottomZ); // 0: Bottom-Back-Left   (X-, Y+, Z=bottomZ)
    this.worldVertices[1].set(center.x + hsX, center.y + hsY, bottomZ); // 1: Bottom-Back-Right  (X+, Y+, Z=bottomZ)
    this.worldVertices[2].set(center.x + hsX, center.y - hsY, bottomZ); // 2: Bottom-Front-Right (X+, Y-, Z=bottomZ)
    this.worldVertices[3].set(center.x - hsX, center.y - hsY, bottomZ); // 3: Bottom-Front-Left  (X-, Y-, Z=bottomZ)
    // Top Square Vertices (Z = topZ) - Indices 4-7 (CCW from above)
    this.worldVertices[4].set(center.x - hsX, center.y + hsY, topZ); // 4: Top-Back-Left    (X-, Y+, Z=topZ)
    this.worldVertices[5].set(center.x + hsX, center.y + hsY, topZ); // 5: Top-Back-Right   (X+, Y+, Z=topZ)
    this.worldVertices[6].set(center.x + hsX, center.y - hsY, topZ); // 6: Top-Front-Right  (X+, Y-, Z=topZ)
    this.worldVertices[7].set(center.x - hsX, center.y - hsY, topZ); // 7: Top-Front-Left
  }

  /**
   * Projects world vertices to screen space using GameScene.getScreenPosition
   * and updates Phaser Polygon GameObjects (shape and depth).
   * This is the ONLY place screen calculations should occur for this class.
   */
  updateVisuals() {
    // --- Screen Projection ---
    // Project world vertices to screen space
    for (let i = 0; i < this.worldVertices.length; i++) {
      this.gameScene.getScreenPosition(
        this.worldVertices[i],
        this.screenVertices[i] // Update the screen vertices array
      );
    }

    // --- Update Bottom Polygon Shape ---
    // Use vertices 0, 1, 2, 3
    const bottomPoints: number[] = [];
    for (let i = 0; i <= 3; i++) {
      bottomPoints.push(this.screenVertices[i].x, this.screenVertices[i].y);
    }
    this.bottomPolygon.setTo(bottomPoints); // Update the polygon's points

    // --- Update Top Polygon Shape ---
    // Use vertices 4, 5, 6, 7
    const topPoints: number[] = [];
    for (let i = 4; i <= 7; i++) {
      topPoints.push(this.screenVertices[i].x, this.screenVertices[i].y);
    }
    this.topPolygon.setTo(topPoints); // Update the polygon's points

    // --- Update Depth ---
    // Project the world center to screen space to get a Y value for depth sorting.
    const screenCenter = this.gameScene.getScreenPosition(
      this.worldCenter,
      this._screenCenter
    );
    // Add small offsets to ensure top is visually above bottom if they overlap perfectly
    // Objects with higher Y appear further away (lower depth value in Phaser 3 default)
    // but here we use Y directly, so higher Y means 'further back' / 'higher up' on screen.
    // We want the top face visually 'on top', so it needs a higher depth value.
    this.bottomPolygon.setDepth(screenCenter.y - 0.1); // Slightly lower depth
    this.topPolygon.setDepth(screenCenter.y + 0.1); // Slightly higher depth
  }

  /**
   * Recalculates world vertices based on the current worldCenter
   * and then updates the visuals (projection, polygon shapes, depth).
   * Call this if worldCenter changes or a visual refresh is needed.
   */
  update() {
    this.calculateWorldVertices(); // Update world state first
    this.updateVisuals(); // Then update screen representation
  }

  /** Cleans up resources and event listeners. */
  destroy() {
    this.bottomPolygon.destroy();
    this.topPolygon.destroy();
  }
}
