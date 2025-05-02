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
 * Represents two 1m x 1m squares in world space for debugging projections.
 * One square is at Z=0 (Bottom), the other at Z=1m (Top) relative to worldCenter.
 * Uses GameScene projection and depth sorting.
 */
export class Cube {
  // Renaming the class might be clearer, but keeping it for now
  private gameScene: GameScene;
  private worldCenter: Phaser.Math.Vector3;
  private halfSizeX: number; // Half size in world units for X
  private halfSizeY: number; // Half size in world units for Y
  private sizeX: number; // Size in world units for X
  private sizeZ: number; // Size in world units for Z (height)

  // --- Geometry ---
  // 8 Vertices: 4 for bottom square, 4 for top square
  private worldVertices: Phaser.Math.Vector3[];
  // Screen positions (calculated each frame)
  private screenVertices: Phaser.Math.Vector2[];

  // --- Rendering ---
  private topPolygon: Phaser.GameObjects.Polygon;
  private bottomPolygon: Phaser.GameObjects.Polygon;
  // Optional: Container if rotation is needed later
  // private container: Phaser.GameObjects.Container;

  constructor(
    gameScene: GameScene,
    worldCenter: Phaser.Math.Vector3,
    sizeXMeters: number, // Default to 1 meter
    sizeYMeters: number, // Default to 1 meter
    sizeZMeters: number // Default to 1 meter
  ) {
    this.gameScene = gameScene;
    this.worldCenter = worldCenter.clone();

    // Calculate sizes in world units
    this.sizeX = sizeXMeters * WORLD_UNIT_PER_METER;
    const sizeY = sizeYMeters * WORLD_UNIT_PER_METER; // Only needed for halfSizeY
    this.sizeZ = sizeZMeters * WORLD_UNIT_PER_METER;
    // Calculate half size for vertex offsets
    this.halfSizeX = this.sizeX / 2;
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

    // Create Graphics objects
    // Create Polygon objects
    this.bottomPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1],
      BOTTOM_COLOR.fill,
      BOTTOM_COLOR.alpha
    );
    this.bottomPolygon.setOrigin(0, 0); // Vertices are absolute screen coords
    this.bottomPolygon.isFilled = true;
    this.bottomPolygon.isStroked = true;
    this.bottomPolygon.strokeColor = BOTTOM_COLOR.stroke;
    this.bottomPolygon.lineWidth = 1;

    this.topPolygon = this.gameScene.add.polygon(
      0,
      0,
      [0, 0, 0, 1, 1, 1],
      TOP_COLOR.fill,
      TOP_COLOR.alpha
    );
    this.topPolygon.setOrigin(0, 0); // Vertices are absolute screen coords
    this.topPolygon.isFilled = true;
    this.topPolygon.isStroked = true;
    this.topPolygon.strokeColor = TOP_COLOR.stroke;
    this.topPolygon.lineWidth = 1;

    // Initial update
    this.update();
  }

  /** Calculates world and screen vertex positions. */
  private updateVertices() {
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
    this.worldVertices[7].set(center.x - hsX, center.y - hsY, topZ); // 7: Top-Front-Left   (X-, Y-, Z=topZ)

    // Project world vertices to screen space
    for (let i = 0; i < this.worldVertices.length; i++) {
      this.gameScene.getScreenPosition(
        this.worldVertices[i],
        this.screenVertices[i]
      );
    }
  }

  /** Updates polygon shapes and depth based on screen vertices. */
  private updatePolygons() {
    // --- Update Bottom Polygon ---
    // Use vertices 0, 1, 2, 3
    const bottomPoints: number[] = [];
    for (let i = 0; i <= 3; i++) {
      bottomPoints.push(this.screenVertices[i].x, this.screenVertices[i].y);
    }
    this.bottomPolygon.setTo(bottomPoints);
    this.bottomPolygon.closePath = true;
    this.bottomPolygon.setDepth(1); // Lower depth

    // --- Update Top Polygon ---
    // Use vertices 4, 5, 6, 7
    const topPoints: number[] = [];
    for (let i = 4; i <= 7; i++) {
      topPoints.push(this.screenVertices[i].x, this.screenVertices[i].y);
    }
    this.topPolygon.setTo(topPoints);
    this.topPolygon.closePath = true;
    this.topPolygon.setDepth(10); // Higher depth - drawn on top
  }
  update() {
    this.updateVertices();
    this.updatePolygons();
  }

  /** Cleans up resources and event listeners. */
  destroy() {
    this.bottomPolygon.destroy();
    this.topPolygon.destroy();
  }
}
