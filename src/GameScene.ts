import { Bullet } from "./Bullet";
import { Cannon } from "./Cannon";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  CANNON_SHADOW_SPRITE,
  TILE_HEIGHT_PX,
  PARTICLE_SPRITE,
  PIXEL_CANNON_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  PERSPECTIVE,
  AXONOMETRIC,
  BULLET_RADIUS_METERS,
  WORLD_UNIT_PER_METER,
  SMALL_WORLD_FACTOR,
  BIG_WORLD_FACTOR,
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
const GROUND_NORMAL = new Phaser.Math.Vector3(0, 0, 1);

// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-town/Tilemap/tilemap.png" --margin 0 --spacing 1
// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-dungeon/Tilemap/tilemap.png" --margin 0 --spacing 1
// tileset goes from 0 margin/1 spacing to 1 margin/3 spacing => update the map.json file

export class GameScene extends Phaser.Scene {
  private _pointerScreen: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _projectedSurfaceZ: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  controls!: Phaser.Cameras.Controls.SmoothedKeyControl;
  map!: Phaser.Tilemaps.Tilemap;
  cannon!: Cannon;
  debugGraphics!: Phaser.GameObjects.Graphics;
  bullets!: Phaser.Physics.Arcade.Group;
  enemies!: Phaser.Physics.Arcade.Group;
  score = 0;
  X_FACTOR = 1;
  Y_FACTOR: number;
  Z_FACTOR: number;
  screenToWorldHorizontal: Phaser.Math.Vector3;
  screenToWorldVertical: Phaser.Math.Vector3;
  worldToScreen: Phaser.Math.Vector3;

  constructor() {
    super({ key: "GameScene" });

    const verticalCamAngle = PERSPECTIVE;
    const axonometric = AXONOMETRIC;
    const camRotation = Phaser.Math.DegToRad(verticalCamAngle);

    const cosCam = Math.cos(camRotation);
    const sinCam = Math.sin(camRotation);
    const cotCam = cosCam / sinCam;

    if (axonometric) {
      this.X_FACTOR = 1;
      this.Y_FACTOR = sinCam;
      this.Z_FACTOR = cosCam;
    } else {
      // oblique projection
      this.X_FACTOR = 1;
      this.Y_FACTOR = 1;
      this.Z_FACTOR = cotCam;
    }

    this.screenToWorldHorizontal = new Phaser.Math.Vector3(
      1,
      1 / this.Y_FACTOR,
      0
    ); // if Z is constant
    // if Y is constant
    this.screenToWorldVertical = new Phaser.Math.Vector3(
      1,
      0,
      1 / this.Z_FACTOR
    );

    // convert a world unit to screen pixels on all 3 axes
    this.worldToScreen = new Phaser.Math.Vector3(
      1,
      this.Y_FACTOR,
      this.Z_FACTOR
    );
  }

  // Convert tile coordinates to world position
  tileToWorldPosition(tileX: number, tileY: number) {
    const screen = new Phaser.Math.Vector2();
    screen.x = this.map.tileToWorldX(tileX)!;
    screen.y = this.map.tileToWorldY(tileY)!;

    // this.debugGraphics.clear();
    // this.debugGraphics.fillStyle(0x00ff00, 1);
    // this.debugGraphics.fillRect(screen.x - 4, screen.y - 4, 8, 8);

    const world = this.getSurfaceWorldPosition(
      screen,
      new Phaser.Math.Vector3()
    );

    if (screen.x === null || screen.y === null)
      throw new Error(`Invalid tile coordinates: (${tileX}, ${tileY})`);

    return world;
  }

  // Get the building tile at the given screen position
  getBuildingTileFromScreenPosition(screen: Phaser.Types.Math.Vector2Like) {
    // Caution, Phaser uses "worldXY" for the screen position in our naming convention
    return this.map.getTileAtWorldXY(screen.x, screen.y, false, undefined, 1);
  }

  // 0 => mud
  // 1 => iron
  getSurfaceHardnessFromWorldPosition(world: Phaser.Math.Vector3): number {
    const screen = this.getScreenPosition(world, this._projectedSurfaceZ);

    return 0.5;
  }

  getSurfaceNormalFromWorldPosition(
    world: Phaser.Math.Vector3
  ): Phaser.Math.Vector3 {
    return GROUND_NORMAL;
  }

  // Get the building tile at the given world position
  // This one is not simple
  // We need to check for occlusion by buildings (this is a naive approach)
  // We get 2 heights:
  // - the surface height of the tile at the world position of the ground (surfaceZ)
  // - the surface height at the projected screen position of the ground surfaceZ (projectedSurfaceZ)
  // If they are the same, surface is on a building
  // If they are different, surface is occluded by a building, return null
  // null really means world(x,y) is visually behind a building, caller can assume 0 if it makes sense
  getSurfaceZFromWorldPosition(world: Phaser.Math.Vector3): number | null {
    const oldWorldZ = world.z; // save the original world z, we are going to mutate it for perf
    world.z = 0; // set z to 0 to get the screen position at ground level
    const groundScreen = this.getScreenPosition(world, this._projectedSurfaceZ);
    const surfaceZ = this.getSurfaceZFromScreenPosition(groundScreen);
    if (surfaceZ === 0) {
      world.z = oldWorldZ;
      return surfaceZ; // nothing can occlude a ground surface at minimum z in a top down view, early return
    }

    world.z = surfaceZ; // set z to the surface height to get the screen position of the world at surface level
    const projectedSurfaceZ = this.getSurfaceZFromScreenPosition(
      this.getScreenPosition(world, this._projectedSurfaceZ)
    );

    world.z = oldWorldZ;
    return projectedSurfaceZ === surfaceZ ? surfaceZ : null;
  }

  // Get the surface height at the given screen position
  getSurfaceZFromScreenPosition(screen: Phaser.Types.Math.Vector2Like): number {
    if (this.Z_FACTOR === 0) return 0; // no perspective, no visible height on map
    const buildingTile = this.getBuildingTileFromScreenPosition(screen);

    // top of building is 2 tiles high
    return buildingTile ? (2 * TILE_HEIGHT_PX) / this.Z_FACTOR : 0;
  }

  // Get the screen position of the given world position
  getScreenPosition(world: Phaser.Math.Vector3, output: Phaser.Math.Vector2) {
    output.x = world.x;
    output.y = world.y * this.Y_FACTOR - world.z * this.Z_FACTOR;
    return output;
  }

  // Get the world position of the given screen position
  getSurfaceWorldPosition(
    screen: Phaser.Types.Math.Vector2Like,
    output: Phaser.Math.Vector3
  ) {
    const surfaceZ = this.getSurfaceZFromScreenPosition(screen);
    output.x = screen.x;
    output.y = (screen.y + surfaceZ * this.Z_FACTOR) / this.Y_FACTOR;
    output.z = surfaceZ;
    return output;
  }

  preload() {
    this.load.tilemapTiledJSON(TILE_MAP, "map.json");
    this.load.image(
      TOWN_SPRITE,
      "kenney_tiny-town/Tilemap/tilemap_extruded.png"
    );
    this.load.image(
      DUNGEON_SPRITE,
      "kenney_tiny-dungeon/Tilemap/tilemap_extruded.png"
    );
    this.load.image(ENEMY_SPRITE, "kenney_tiny-dungeon/Tiles/tile_0100.png");
    this.load.image(
      CANNON_WHEELS_SPRITE,
      "kenney_tiny-dungeon/Tiles/tile_0073.png"
    );
    this.load.atlas(FLARES, "flares.png", "flares.json");

    this.load.audio("cannon_blast_1", "cannon_blast_1.mp3");
    this.load.audio("cannon_blast_2", "cannon_blast_2.mp3");
    this.load.audio("cannon_blast_3", "cannon_blast_3.mp3");
    this.load.audio("cannon_blast_4", "cannon_blast_4.mp3");
    this.load.audio("cannon_blast_5", "cannon_blast_5.mp3");

    const cannonColors: PixelCannonColors = {
      base: 0x444444, // Medium Grey
      shadow: 0x444444, // Dark Grey
      highlight: 0xcccccc, // Light Grey
    };

    const bulletRadius = Math.ceil(
      BULLET_RADIUS_METERS *
        WORLD_UNIT_PER_METER *
        this.worldToScreen.x *
        BIG_WORLD_FACTOR
    );

    const bulletDiameter = bulletRadius * 2;
    const cannonDiameter = bulletDiameter + 2;
    const cannonLength = bulletDiameter * 5;

    createParticleTexture(this, PARTICLE_SPRITE);
    createPixelCannonTexture(
      this,
      CANNON_SPRITE,
      cannonColors,
      cannonLength,
      cannonDiameter
    );
    createCannonTexture(
      this,
      CANNON_SPRITE,
      0x444444,
      cannonLength,
      cannonDiameter
    );
    createCannonTexture(
      this,
      CANNON_SHADOW_SPRITE,
      0x000000,
      cannonLength,
      cannonDiameter
    );
    createCircleTexture(this, BULLET_SPRITE, 0x000000, bulletDiameter);
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
    const cannonWorld = this.tileToWorldPosition(34, 75);
    this.cannon = new Cannon(this, cannonWorld, 270);
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group(enemies.list);

    // Shoot on mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this._pointerScreen.set(pointer.worldX, pointer.worldY);
      this.cannon.requestShoot(this._pointerScreen);
    });

    this.physics.add.overlap(
      this.bullets,
      this.enemies,
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

  inViewport(object: Phaser.GameObjects.Image): boolean {
    const bounds = this.cameras.main.worldView;
    return (
      object.x >= bounds.x - 200 &&
      object.x <= bounds.right + 200 &&
      object.y >= bounds.y - 200 &&
      object.y <= bounds.bottom + 200
    );
  }

  update(time: number, delta: number) {
    this.controls.update(delta);
    const mouseX = this.input.x;
    const mouseY = this.input.y;

    if (this.input.isOver && mouseX && mouseY) {
      const cam = this.cameras.main;
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
}
