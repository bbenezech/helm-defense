import { Bullet } from "./Bullet";
import { Cannon } from "./Cannon";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  SHADOW_SPRITE,
  TILE_HEIGHT_PX,
  TILT_FACTOR,
} from "./constants";
import { createEnemyContainer, Enemy } from "./Enemy";

const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 14; // pixels per frame
const TOWN_SPRITE = "kenney-tiny-town";
const DUNGEON_SPRITE = "kenney-tiny-dungeon";
const TILE_MAP = "map";

// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-town/Tilemap/tilemap.png" --margin 0 --spacing 1
// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-dungeon/Tilemap/tilemap.png" --margin 0 --spacing 1
// tileset goes from 0 margin/1 spacing to 1 margin/3 spacing => update the map.json file

export class GameScene extends Phaser.Scene {
  controls!: Phaser.Cameras.Controls.SmoothedKeyControl;
  map!: Phaser.Tilemaps.Tilemap;
  score: number;
  cannon!: Cannon;

  constructor() {
    super({ key: "GameScene" });

    this.score = 0;
  }

  getGroundZ(x: number, y: number): number {
    const buildingTile = this.map.getTileAtWorldXY(x, y, false, undefined, 1);
    return buildingTile ? 2 * TILE_HEIGHT_PX : 0; // top of building is 2 tiles high
  }

  // get the real 2d y coordinate of a position, higher Z are actually lower than they look on screen
  getUntiltedY(x: number, y: number) {
    return y + this.getGroundZ(x, y) * TILT_FACTOR;
  }

  // get the y position of a 3d coordinate, higher Z moves up screen visually
  getTiltedY(x: number, y: number, z: number) {
    return y - z * TILT_FACTOR;
  }

  preload() {
    this.load.tilemapTiledJSON(TILE_MAP, "assets/map.json");
    this.load.image(
      TOWN_SPRITE,
      "assets/kenney_tiny-town/Tilemap/tilemap_extruded.png"
    );
    this.load.image(
      DUNGEON_SPRITE,
      "assets/kenney_tiny-dungeon/Tilemap/tilemap_extruded.png"
    );
    this.load.image(
      ENEMY_SPRITE,
      "assets/kenney_tiny-dungeon/Tiles/tile_0100.png"
    );

    const createTexture = (
      key: string,
      color: number,
      size: number,
      type: "rect" | "circle"
    ) => {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(color, 1);
      if (type === "rect") {
        // Center the rectangle within the texture area
        const textureWidth = size;
        const textureHeight = size * 1;
        const rectWidth = size / 2;
        const rectHeight = size;
        const x = (textureWidth - rectWidth) / 2;
        const y = (textureHeight - rectHeight) / 2;
        graphics.fillRect(x, y, rectWidth, rectHeight); // Centered Cannon shape
      } else {
        graphics.fillCircle(size / 2, size / 2, size / 2);
      }
      graphics.generateTexture(key, size, type === "rect" ? size * 1.5 : size);
      graphics.destroy();
    };

    createTexture(CANNON_SPRITE, 0xaaaaaa, 30, "rect");
    createTexture(BULLET_SPRITE, 0xff0000, 10, "circle");
    createTexture(SHADOW_SPRITE, 0x000000, 10, "circle");
  }

  tileToWorld(tileX: number, tileY: number) {
    const worldX = this.map.tileToWorldX(tileX);
    const worldY = this.map.tileToWorldY(tileY);

    if (worldX === null || worldY === null)
      throw new Error(`Invalid tile coordinates: (${tileX}, ${tileY})`);

    return [worldX, worldY] as const;
  }

  create() {
    // Create the tilemap
    this.map = this.make.tilemap({ key: TILE_MAP });
    const townTileset = this.map.addTilesetImage(TOWN_SPRITE, TOWN_SPRITE);
    const dungeonTileset = this.map.addTilesetImage(
      DUNGEON_SPRITE,
      DUNGEON_SPRITE
    );

    if (!townTileset || !dungeonTileset) throw new Error("Missing asset");

    this.map.createLayer(0, [townTileset, dungeonTileset], 0, 0); // terrain
    this.map.createLayer(1, [townTileset, dungeonTileset], 0, 0); // buildings
    this.map.createLayer(2, [townTileset, dungeonTileset], 0, 0); // trees
    this.map.createLayer(3, [townTileset, dungeonTileset], 0, 0); // objects
    const mapWidthPixels = this.map.widthInPixels;
    const mapHeightPixels = this.map.heightInPixels;
    const camera = this.cameras.main;
    this.adjustMainCamera();
    // Set camera bounds to map dimensions
    camera.setBounds(0, 0, mapWidthPixels, mapHeightPixels);
    camera.setRoundPixels(true);

    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.scale.off("resize", this.handleResize, this);
    });

    // This starts the UIScene running concurrently and renders it on top
    this.scene.launch("UIScene");

    const keyboard = this.input.keyboard!;
    const cursors = keyboard.createCursorKeys();

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
      camera,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      // acceleration: 0.04,
      // drag: 0.0005,
      zoomIn: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      zoomOut: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      zoomSpeed: 0.1,
      acceleration: 1,
      drag: 1,
      // acceleration: 0.04,
      // drag: 0.0005,
      maxSpeed: 1,
      maxZoom: 4,
    });

    const enemies = createEnemyContainer(this, 200, -50, this.map.height);

    // Cannons
    this.cannon = new Cannon(this, ...this.tileToWorld(34, 75));
    const bulletGroup = this.physics.add.group();
    const enemyGroup = this.physics.add.group(enemies.list);

    // Shoot on mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const bullet = this.cannon.shoot(pointer);
      bulletGroup.add(bullet);
    });

    this.physics.add.overlap(
      bulletGroup,
      enemyGroup,
      (bullet, enemy) => {
        if ((bullet as Bullet).elevation() > (enemy as Enemy).displayHeight)
          return;

        this.score += 1; // Increment score
        this.game.events.emit("updateScore", this.score); // Emit event to update score
        // Handle hit
        enemy.destroy();
      },
      undefined,
      this
    );
  }

  adjustMainCamera() {
    const camera = this.cameras.main;
    const mapWidthPixels = this.map.widthInPixels;

    // Get the current viewport width
    const viewportWidth = camera.width; // Or this.scale.width if camera fills game

    // Calculate the zoom required to fit the map width perfectly
    const targetZoom = viewportWidth / mapWidthPixels;

    // Apply the zoom
    camera.setZoom(targetZoom);

    // Ensure horizontal scroll is 0 (since width fits exactly)
    // This might be handled by setBounds + follow, but good to be explicit
    camera.scrollX = 0;

    // Note: Vertical scroll will be handled by setBounds and camera follow (if enabled)
    // or you could manually set camera.scrollY if needed initially.
    // camera.scrollY = 0; // Start at the top
  }

  // Handle game resize event
  handleResize(gameSize: Phaser.Structs.Size) {
    // Optional: Ensure the camera viewport itself resizes if necessary
    // this.cameras.main.setSize(gameSize.width, gameSize.height);

    this.adjustMainCamera();

    // Re-apply bounds (usually not strictly necessary if map size doesn't change, but safe)
    // this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
  }

  update(time: number, delta: number) {
    this.controls.update(delta);

    // Update the cannon (handles its own rotation)
    this.cannon.update();

    // Get mouse position relative to the game canvas
    const mouseX = this.input.x;
    const mouseY = this.input.y;

    // Get current camera scroll position
    const cam = this.cameras.main;

    cam.setRoundPixels(true); // Ensure pixel-perfect rendering
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
  }
}
