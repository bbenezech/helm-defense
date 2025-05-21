import { Cannon } from "./actors/Cannon";
import { Cube } from "./actors/Cube";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  TILE_HEIGHT_PX,
  PARTICLE_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  PERSPECTIVE,
  AXONOMETRIC,
  BULLET,
} from "./constants";
import { createCannonTexture } from "./texture/cannon";
import { createCircleTexture } from "./texture/circle";
import { createParticleTexture } from "./texture/particle";
import { randomNormal } from "./lib/random";
import { SURFACE_HARDNESS } from "./world/surface";

const SCROLL_BOUNDARY = 300; // pixels from edge to start scrolling
const SCROLL_SPEED = 14; // pixels per frame
const TOWN_SPRITE = "town";
const DUNGEON_SPRITE = "dungeon";
const TILE_MAP = "map";
const GROUND_NORMAL = new Phaser.Math.Vector3(0, 0, 1);
const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4];

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
  score = 0;
  X_FACTOR = 1;
  Y_FACTOR: number;
  Z_FACTOR: number;
  screenToWorldHorizontal: Phaser.Math.Vector3;
  screenToWorldVertical: Phaser.Math.Vector3;
  worldToScreen: Phaser.Math.Vector3;
  zoomLevel = ZOOM_LEVELS.indexOf(1);

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
    return Phaser.Math.Clamp(randomNormal(SURFACE_HARDNESS.grass, 0.1), 0, 1);
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
    this.load.image(TOWN_SPRITE, "town.png");
    this.load.image(DUNGEON_SPRITE, "dungeon.png");

    this.load.image(ENEMY_SPRITE, "enemy.png");
    this.load.image(CANNON_WHEELS_SPRITE, "wheels.png");
    this.load.atlas(FLARES, "flares.png", "flares.json");

    this.load.audio("cannon_blast_1", "cannon_blast_1.mp3");
    this.load.audio("cannon_blast_2", "cannon_blast_2.mp3");
    this.load.audio("cannon_blast_3", "cannon_blast_3.mp3");
    this.load.audio("cannon_blast_4", "cannon_blast_4.mp3");
    this.load.audio("cannon_blast_5", "cannon_blast_5.mp3");

    const bulletRadius = BULLET.radius * this.worldToScreen.x;
    const cannonRadius = bulletRadius * 1.2;
    const cannonLength = cannonRadius * 8;

    createParticleTexture(this, PARTICLE_SPRITE);
    createCannonTexture(
      this,
      CANNON_SPRITE,
      0x444444,
      cannonLength,
      cannonRadius * 2
    );
    createCircleTexture(this, BULLET_SPRITE, 0x000000, bulletRadius * 2);
  }

  create() {
    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(100000000000);

    // Create the tilemap
    this.map = this.make.tilemap({ key: TILE_MAP });
    const townTilesetImage = this.map.addTilesetImage(
      TOWN_SPRITE,
      TOWN_SPRITE,
      16,
      16,
      0,
      0
    );
    const dungeonTilesetImage = this.map.addTilesetImage(
      DUNGEON_SPRITE,
      DUNGEON_SPRITE,
      16,
      16,
      0,
      0
    );

    if (!townTilesetImage || !dungeonTilesetImage)
      throw new Error("Missing asset");

    this.map.createLayer(0, townTilesetImage, 0, 0, true)!;
    this.map.createLayer(1, [townTilesetImage, dungeonTilesetImage], 0, 0)!;
    this.map.createLayer(2, [townTilesetImage, dungeonTilesetImage], 0, 0)!;
    this.map.createLayer(3, [townTilesetImage, dungeonTilesetImage], 0, 0)!;

    const camera = this.cameras.main;

    this.resetMainCameraPosition();
    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    camera.setZoom(ZOOM_LEVELS[this.zoomLevel]);
    camera.setRoundPixels(true);

    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.scale.off("resize", this.handleResize, this);
    });

    this.scene.launch("UIScene");

    const keyboard = this.input.keyboard!;
    const cursors = keyboard.createCursorKeys();

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
      camera,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      acceleration: 1,
      drag: 1,
      maxSpeed: 1,
    });

    // Cannons
    const cannonWorld = this.tileToWorldPosition(34, 75);
    this.cannon = new Cannon(this, cannonWorld, 270);

    const cubeWorld = this.tileToWorldPosition(70, 77);
    new Cube(this, cubeWorld, 5, 5, 5, Math.PI / 4);

    // Shoot on mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this._pointerScreen.set(pointer.worldX, pointer.worldY);
      this.cannon.requestShoot(this._pointerScreen);
    });

    this.input.on("wheel", (e: WheelEvent) => {
      if (e.deltaY > 0) {
        this.changeZoom(1);
      } else if (e.deltaY < 0) {
        this.changeZoom(-1);
      }
    });

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      switch (e.keyCode) {
        case Phaser.Input.Keyboard.KeyCodes.SPACE:
          this.cannon.requestShoot(this._pointerScreen);
          break;
        case Phaser.Input.Keyboard.KeyCodes.MINUS:
          this.changeZoom(-1);
          break;
        case Phaser.Input.Keyboard.KeyCodes.PLUS:
          this.changeZoom(1);
          break;
        case Phaser.Input.Keyboard.KeyCodes.F:
          this.scale.toggleFullscreen({});
          break;
      }
    });
  }

  resetMainCameraPosition() {
    const camera = this.cameras.main;
    camera.scrollX = 0; // Start at the left
    camera.scrollY = this.map.heightInPixels - camera.height; // Start at the bottom
  }

  changeZoom(direction: 1 | -1) {
    const previousZoomIndex = this.zoomLevel;
    this.zoomLevel += direction;

    this.zoomLevel = Phaser.Math.Clamp(
      this.zoomLevel,
      0,
      ZOOM_LEVELS.length - 1
    );

    if (this.zoomLevel !== previousZoomIndex) {
      const newZoom = ZOOM_LEVELS[this.zoomLevel];
      this.cameras.main.zoomTo(newZoom, 0);
    }
  }

  handleResize(gameSize: Phaser.Structs.Size) {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
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
        const ratio = (SCROLL_BOUNDARY - mouseX) / SCROLL_BOUNDARY;
        cam.scrollX -= SCROLL_SPEED * ratio * ratio;
      } else if (mouseX > this.game.canvas.width - SCROLL_BOUNDARY) {
        const ratio =
          (mouseX - (this.game.canvas.width - SCROLL_BOUNDARY)) /
          SCROLL_BOUNDARY;
        cam.scrollX += SCROLL_SPEED * ratio * ratio;
      }
      if (mouseY < SCROLL_BOUNDARY) {
        const ratio = (SCROLL_BOUNDARY - mouseY) / SCROLL_BOUNDARY;
        cam.scrollY -= SCROLL_SPEED * ratio * ratio;
      } else if (mouseY > this.game.canvas.height - SCROLL_BOUNDARY) {
        const ratio =
          (mouseY - (this.game.canvas.height - SCROLL_BOUNDARY)) /
          SCROLL_BOUNDARY;
        cam.scrollY += SCROLL_SPEED * ratio * ratio;
      }
    }
  }
}
