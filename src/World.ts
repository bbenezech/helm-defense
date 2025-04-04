import { Bullet } from "./Bullet";
import { Cannon } from "./Cannon";
import { PIXELS_PER_METER } from "./constants";
import { createEnemyContainer } from "./enemies";
import { ENEMY_HEIGHT_METERS } from "./Enemy";
const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 14; // pixels per frame

export class World extends Phaser.Scene {
  controls!: Phaser.Cameras.Controls.SmoothedKeyControl;
  enemies!: Phaser.GameObjects.Container; // Change to Container
  cannon!: Cannon;
  bullets: Bullet[] = [];
  enemiesGroup!: Phaser.Physics.Arcade.Group; // New enemy physics group
  bulletGroup!: Phaser.Physics.Arcade.Group; // New bullet physics group

  getGroundHeight(x: number, y: number): number {
    return 0; // Assume flat ground at Z = 0
  }

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

    const createTexture = (
      key: string,
      color: number,
      size: number,
      type: "rect" | "circle"
    ) => {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(color, 1);
      if (type === "rect") {
        graphics.fillRect(0, 0, size, size * 1.5); // Cannon shape
      } else {
        graphics.fillCircle(size / 2, size / 2, size / 2);
      }
      graphics.generateTexture(key, size, type === "rect" ? size * 1.5 : size);
      graphics.destroy();
    };

    createTexture("cannon", 0xaaaaaa, 30, "rect");
    createTexture("bullet", 0xff0000, 10, "circle");
    createTexture("shadow", 0x000000, 10, "circle");
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

    this.enemies = createEnemyContainer(this, 200, -50, map.height);
    this.enemiesGroup = this.physics.add.group(this.enemies.list);

    // Cannons
    const { width, height } = this.scale;
    this.cannon = new Cannon(this, width / 2, height - 50);
    this.bulletGroup = this.physics.add.group();

    // Shoot on mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const bullet = this.cannon.shoot(pointer.worldX, pointer.worldY);
      this.bulletGroup.add(bullet);
      this.bullets.push(bullet);
    });

    this.physics.add.overlap(
      this.bulletGroup,
      this.enemiesGroup,
      (bullet, enemy) => {
        // Check if the bullet is within the Z-range of the enemy
        // Bullet too high to hit
        if (
          (bullet as Bullet).elevation() / PIXELS_PER_METER >
          ENEMY_HEIGHT_METERS
        )
          return;

        // Handle hit
        enemy.destroy();
      },
      undefined,
      this
    );

    // Add instruction text
    this.add
      .text(10, 10, "Click to shoot!", { fontSize: "16px", color: "#ffffff" })
      .setDepth(100000); // Ensure text is on top
  }

  update(time: number, delta: number) {
    this.controls.update(delta);

    // Get mouse position relative to the game canvas
    const mouseX = this.input.x;
    const mouseY = this.input.y;

    // Get current camera scroll position
    const cam = this.cameras.main;

    // Check mouse position and scroll accordingly
    if (mouseX < SCROLL_BOUNDARY) {
      cam.scrollX -= SCROLL_SPEED;
    } else if (mouseX > this.game.canvas.width - SCROLL_BOUNDARY) {
      cam.scrollX += SCROLL_SPEED;
    }

    if (mouseY < SCROLL_BOUNDARY) {
      cam.scrollY -= SCROLL_SPEED;
    } else if (mouseY > this.game.canvas.height - SCROLL_BOUNDARY) {
      cam.scrollY += SCROLL_SPEED;
    }

    // Update bullets and remove dead ones
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      if (!bullet.update(time, delta)) {
        bullet.destroy();
        this.bullets.splice(i, 1); // Remove from array
      }
    }
  }
}
