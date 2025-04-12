import { Bullet } from "./Bullet";
import { Cannon } from "./Cannon";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  CANNON_SHADOW_SPRITE,
  BULLET_SHADOW_SPRITE,
  TILE_HEIGHT_PX,
  PARTICLE_SPRITE,
  PIXEL_CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
} from "./constants";
import { createEnemyContainer, Enemy } from "./Enemy";
import { createCannonTexture } from "./lib/createCannonTexture";
import { createCircleTexture } from "./lib/createCircleTexture";
import { createParticleTexture } from "./lib/createParticleTexture";
import {
  createPixelCannonTexture,
  PixelCannonColors,
} from "./lib/createPixelCannonTexture";

const SCROLL_BOUNDARY = 100; // pixels from edge to start scrolling
const SCROLL_SPEED = 14; // pixels per frame
const TOWN_SPRITE = "kenney-tiny-town";
const DUNGEON_SPRITE = "kenney-tiny-dungeon";
const TILE_MAP = "map";
const TILT_FACTOR = 1;

// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-town/Tilemap/tilemap.png" --margin 0 --spacing 1
// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-dungeon/Tilemap/tilemap.png" --margin 0 --spacing 1
// tileset goes from 0 margin/1 spacing to 1 margin/3 spacing => update the map.json file

export class GameScene extends Phaser.Scene {
  controls!: Phaser.Cameras.Controls.SmoothedKeyControl;
  map!: Phaser.Tilemaps.Tilemap;
  cannon!: Cannon;
  debugGraphics!: Phaser.GameObjects.Graphics;
  score = 0;

  constructor() {
    super({ key: "GameScene" });
  }

  tileToWorld(tileX: number, tileY: number) {
    const world = new Phaser.Math.Vector3();
    world.x = this.map.tileToWorldX(tileX)!;
    world.y = this.map.tileToWorldY(tileY)!;

    if (world.x === null || world.y === null)
      throw new Error(`Invalid tile coordinates: (${tileX}, ${tileY})`);
    world.z = this.getGroundZ(world);

    return world;
  }

  getBuildingTile(coordinates: Phaser.Types.Math.Vector2Like) {
    return this.map.getTileAtWorldXY(
      coordinates.x,
      coordinates.y,
      false,
      undefined,
      1
    );
  }

  getGroundZ(coordinates: Phaser.Types.Math.Vector2Like): number {
    const buildingTile = this.getBuildingTile(coordinates);
    return buildingTile ? 2 * TILE_HEIGHT_PX : 0; // top of building is 2 tiles high
  }

  getTiltedY(x: number, y: number, z: number) {
    return y - z * TILT_FACTOR;
  }

  getScreen(world: Phaser.Math.Vector3, output: Phaser.Math.Vector2) {
    output.x = world.x;
    output.y = world.y - world.z * TILT_FACTOR;
    return output;
  }

  getWorldAtGround(
    screen: Phaser.Types.Math.Vector2Like,
    output: Phaser.Math.Vector3
  ) {
    const groundZ = this.getGroundZ(screen);
    output.x = screen.x;
    output.y = screen.y + groundZ * TILT_FACTOR;
    output.z = groundZ;
    return output;
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
    this.load.image(
      CANNON_WHEELS_SPRITE,
      "assets/kenney_tiny-dungeon/Tiles/tile_0073.png"
    );
    this.load.atlas(FLARES, "assets/flares.png", "assets/flares.json");

    this.load.audio("cannon_blast_1", "assets/cannon_blast_1.mp3");
    this.load.audio("cannon_blast_2", "assets/cannon_blast_2.mp3");
    this.load.audio("cannon_blast_3", "assets/cannon_blast_3.mp3");
    this.load.audio("cannon_blast_4", "assets/cannon_blast_4.mp3");
    this.load.audio("cannon_blast_5", "assets/cannon_blast_5.mp3");

    const cannonColors: PixelCannonColors = {
      base: 0x444444, // Medium Grey
      shadow: 0x444444, // Dark Grey
      highlight: 0xcccccc, // Light Grey
    };

    createParticleTexture(this, PARTICLE_SPRITE);
    createPixelCannonTexture(this, PIXEL_CANNON_SPRITE, cannonColors, 30, 10);
    createCannonTexture(this, CANNON_SPRITE, 0x444444, 30, 10);
    createCannonTexture(this, CANNON_SHADOW_SPRITE, 0x000000, 30, 10);
    createCircleTexture(this, BULLET_SPRITE, 0xff0000, 10);
    createCircleTexture(this, BULLET_SHADOW_SPRITE, 0x000000, 8);
  }

  create() {
    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(100000000000);

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
    const camera = this.cameras.main;
    this.adjustMainCamera();
    // Set camera bounds to map dimensions
    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
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
    this.cannon = new Cannon(this, this.tileToWorld(34, 75));
    const bulletGroup = this.physics.add.group();
    const enemyGroup = this.physics.add.group(enemies.list);

    // Shoot on mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const targetScreen = new Phaser.Math.Vector2(
        pointer.worldX,
        pointer.worldY
      );
      const bullet = this.cannon.shoot(targetScreen);
      if (bullet) bulletGroup.add(bullet);
    });

    this.physics.add.overlap(
      bulletGroup,
      enemyGroup,
      (bullet, enemy) => {
        if (
          (bullet as Bullet).groundElevation() > (enemy as Enemy).displayHeight
        )
          return;

        this.score += 1;
        this.game.events.emit("updateScore", this.score);
        enemy.destroy();
      },
      undefined,
      this
    );
  }

  adjustMainCamera() {
    const camera = this.cameras.main;
    camera.setZoom(camera.width / this.map.widthInPixels);
    camera.scrollX = 0; // Start at the left
    camera.scrollY = this.map.heightInPixels - camera.height; // Start at the bottom
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
    const mouseX = this.input.x;
    const mouseY = this.input.y;

    if (this.input.isOver) {
      const cam = this.cameras.main;

      if (mouseX < SCROLL_BOUNDARY && mouseX > 0 && this.input.isOver) {
        cam.scrollX -= SCROLL_SPEED;
      } else if (
        mouseX > this.game.canvas.width - SCROLL_BOUNDARY &&
        mouseX < this.game.canvas.width
      ) {
        cam.scrollX += SCROLL_SPEED;
      }

      if (mouseY < SCROLL_BOUNDARY && mouseY > 0 && this.input.isOver) {
        cam.scrollY -= SCROLL_SPEED;
      } else if (
        mouseY > this.game.canvas.height - SCROLL_BOUNDARY &&
        mouseY < this.game.canvas.height
      ) {
        cam.scrollY += SCROLL_SPEED;
      }
    }
  }
}
