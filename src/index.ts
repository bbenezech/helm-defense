import Phaser from "phaser";
import {
  createEnemyContainer,
  createEnemyFormation,
  createMovementAnimation,
} from "./enemies";

class World extends Phaser.Scene {
  controls?: Phaser.Cameras.Controls.SmoothedKeyControl;
  private readonly SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
  private readonly SCROLL_SPEED = 14; // pixels per frame
  private enemies?: Phaser.GameObjects.Container; // Change to Container

  preload() {
    // Load the tilemap
    this.load.tilemapTiledJSON("map", "assets/map.json");

    // Load the tilesets
    this.load.image(
      "kenney-tiny-town",
      "assets/kenney_tiny-town/Tilemap/tilemap.png"
    );
    this.load.image(
      "kenney-tiny-dungeon",
      "assets/kenney_tiny-dungeon/Tilemap/tilemap.png"
    );

    // Add enemy sprite loading
    this.load.image("enemy", "assets/kenney_tiny-dungeon/Tiles/tile_0100.png");
  }

  create() {
    // Create the tilemap
    const map = this.make.tilemap({ key: "map" });
    const townTileset = map.addTilesetImage(
      "kenney-tiny-town",
      "kenney-tiny-town"
    );
    const dungeonTileset = map.addTilesetImage(
      "kenney-tiny-dungeon",
      "kenney-tiny-dungeon"
    );

    if (!townTileset || !dungeonTileset) throw new Error("Missing asset");

    map.createLayer(0, [townTileset, dungeonTileset], 0, 0); // terrain
    map.createLayer(1, [townTileset, dungeonTileset], 0, 0); // buildings
    map.createLayer(2, [townTileset, dungeonTileset], 0, 0); // trees
    map.createLayer(3, [townTileset, dungeonTileset], 0, 0); // objects

    // Set camera bounds to map dimensions
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setZoom(1);
    this.cameras.main.centerToBounds();

    const keyboard = this.input.keyboard!;
    const cursors = keyboard.createCursorKeys();

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
      camera: this.cameras.main,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      zoomIn: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      zoomOut: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      zoomSpeed: 0.1,
      acceleration: 1,
      drag: 1,
      // acceleration: 0.04,
      // drag: 0.0005,
      maxSpeed: 1,
      maxZoom: 4,
      minZoom: 0.8,
    });

    // Create enemy group
    this.enemies = createEnemyContainer(this);

    // Create enemy formation
    createEnemyFormation(this, this.enemies);

    // Add movement animation
    createMovementAnimation(this, this.enemies, map.height);
  }

  update(time: number, delta: number) {
    this.controls?.update(delta);

    // Get mouse position relative to the game canvas
    const mouseX = this.input.x;
    const mouseY = this.input.y;

    // Get current camera scroll position
    const cam = this.cameras.main;

    // Check mouse position and scroll accordingly
    if (mouseX < this.SCROLL_BOUNDARY) {
      cam.scrollX -= this.SCROLL_SPEED;
    } else if (mouseX > this.game.canvas.width - this.SCROLL_BOUNDARY) {
      cam.scrollX += this.SCROLL_SPEED;
    }

    if (mouseY < this.SCROLL_BOUNDARY) {
      cam.scrollY -= this.SCROLL_SPEED;
    } else if (mouseY > this.game.canvas.height - this.SCROLL_BOUNDARY) {
      cam.scrollY += this.SCROLL_SPEED;
    }
  }
}

new Phaser.Game({
  type: Phaser.CANVAS,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#2d2d2d",
  parent: "phaser",
  pixelArt: true,
  scene: World,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
