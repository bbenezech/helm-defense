import { Cannon } from "../actors/Cannon";
import { Cube } from "../actors/Cube";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  TILE_HEIGHT_PX,
  PARTICLE_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  BULLET,
  PERSPECTIVE_INDEX,
  PERSPECTIVES,
} from "../constants";
import { createCannonTexture } from "../texture/cannon";
import { createCircleTexture } from "../texture/circle";
import { createParticleTexture } from "../texture/particle";
import { randomNormal } from "../lib/random";
import { SURFACE_HARDNESS } from "../world/surface";
import { Sound } from "../lib/sound";
import { log } from "../lib/log";
import { createPointer } from "../lib/pointer";
import { UIScene } from "./ui";

const TOWN_SPRITE = "town";
const DUNGEON_SPRITE = "dungeon";
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
  cube!: Cube;
  debugGraphics!: Phaser.GameObjects.Graphics;
  score = 0;
  X_FACTOR!: number;
  Y_FACTOR!: number;
  Z_FACTOR!: number;
  screenToWorldHorizontal!: Phaser.Math.Vector3;
  screenToWorldVertical!: Phaser.Math.Vector3;
  worldToScreen!: Phaser.Math.Vector3;
  zoom!: number;
  zooms!: number[];
  cannonBlast!: Sound;
  coverZoom!: number;
  axonometric: boolean;
  perspective: (typeof PERSPECTIVES)[number];
  updatePointer!: (this: GameScene, time: number, delta: number) => void;
  destroyPointer!: (this: GameScene) => void;
  selectionGraphics!: Phaser.GameObjects.Graphics;
  // Used to track if the perspective has changed and objects need to update their visuals
  dirty = true;

  constructor() {
    super({ key: "GameScene" });
    this.perspective = "oblique";
    this.axonometric = true;
  }

  setupPerspective() {
    this.dirty = true; // inform objects to update their visuals, because perspective has changed

    const camRotation = Phaser.Math.DegToRad(PERSPECTIVE_INDEX[this.perspective]);

    const cosCam = Math.cos(camRotation);
    const sinCam = Math.sin(camRotation);
    const cotCam = cosCam / sinCam;

    if (this.axonometric) {
      this.X_FACTOR = 1;
      this.Y_FACTOR = sinCam;
      this.Z_FACTOR = cosCam;
    } else {
      // oblique projection
      this.X_FACTOR = 1;
      this.Y_FACTOR = 1;
      this.Z_FACTOR = cotCam;
    }

    // if Z is constant
    this.screenToWorldHorizontal = new Phaser.Math.Vector3(1, 1 / this.Y_FACTOR, 0);

    // if Y is constant
    this.screenToWorldVertical = new Phaser.Math.Vector3(1, 0, 1 / this.Z_FACTOR);

    // convert a world unit to screen pixels on all 3 axes
    this.worldToScreen = new Phaser.Math.Vector3(1, this.Y_FACTOR, this.Z_FACTOR);

    // objects are created at world position (0, 0, 0) and moved to their position relative to the projection
    // if projection changes, we need to update their position
    this.cannon.setWorld(this.tileToWorldPosition(34, 75));
    this.cube.setWorld(this.tileToWorldPosition(70, 77));
  }

  // Convert tile coordinates to world position
  tileToWorldPosition(tileX: number, tileY: number) {
    const screen = new Phaser.Math.Vector2();
    screen.x = this.map.tileToWorldX(tileX)!;
    screen.y = this.map.tileToWorldY(tileY)!;

    const world = this.getSurfaceWorldPosition(screen, new Phaser.Math.Vector3());

    if (screen.x === null || screen.y === null) throw new Error(`Invalid tile coordinates: (${tileX}, ${tileY})`);

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

  getSurfaceNormalFromWorldPosition(world: Phaser.Math.Vector3): Phaser.Math.Vector3 {
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
      this.getScreenPosition(world, this._projectedSurfaceZ),
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
    output.x = world.x * this.X_FACTOR;
    output.y = world.y * this.Y_FACTOR - world.z * this.Z_FACTOR;
    return output;
  }

  // Get the world position of the given screen position
  getSurfaceWorldPosition(screen: Phaser.Types.Math.Vector2Like, output: Phaser.Math.Vector3) {
    const surfaceZ = this.getSurfaceZFromScreenPosition(screen);

    output.x = screen.x / this.X_FACTOR;
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

    const bulletRadius = BULLET.radius;
    const cannonRadius = bulletRadius * 1.2;
    const cannonLength = cannonRadius * 8;

    createParticleTexture(this, PARTICLE_SPRITE);
    createCannonTexture(this, CANNON_SPRITE, 0x444444, cannonLength, cannonRadius * 2);
    createCircleTexture(this, BULLET_SPRITE, 0x000000, bulletRadius * 2);

    this.load.audio("cannon_blast_1", "cannon_blast_1.mp3");
    this.load.audio("cannon_blast_2", "cannon_blast_2.mp3");
    this.load.audio("cannon_blast_3", "cannon_blast_3.mp3");
    this.load.audio("cannon_blast_4", "cannon_blast_4.mp3");
    this.load.audio("cannon_blast_5", "cannon_blast_5.mp3");
  }

  create() {
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(100000000000);

    // Create the tilemap
    this.map = this.make.tilemap({ key: TILE_MAP });
    const townTilesetImage = this.map.addTilesetImage(TOWN_SPRITE, TOWN_SPRITE, 16, 16, 0, 0);
    const dungeonTilesetImage = this.map.addTilesetImage(DUNGEON_SPRITE, DUNGEON_SPRITE, 16, 16, 0, 0);

    if (!townTilesetImage || !dungeonTilesetImage) throw new Error("Missing asset");

    this.map.createLayer(0, townTilesetImage, 0, 0, true)!;
    this.map.createLayer(1, [townTilesetImage, dungeonTilesetImage], 0, 0)!;
    this.map.createLayer(2, [townTilesetImage, dungeonTilesetImage], 0, 0)!;
    this.map.createLayer(3, [townTilesetImage, dungeonTilesetImage], 0, 0)!;

    this.setupCamera();

    this.scene.launch("UIScene");
    this.selectionGraphics = this.add.graphics();

    const keyboard = this.input.keyboard!;
    const cursors = keyboard.createCursorKeys();

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
      camera: this.cameras.main,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      acceleration: 0.1,
      drag: 0.002,
      maxSpeed: 2,
    });

    // Cannons
    this.cannonBlast = new Sound(this, [
      "cannon_blast_1",
      "cannon_blast_2",
      "cannon_blast_3",
      "cannon_blast_4",
      "cannon_blast_5",
    ]);

    const { updatePointer, destroyPointer } = createPointer(this);
    this.destroyPointer = destroyPointer;
    this.updatePointer = updatePointer;

    this.input.manager.events.on("click", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // left click
      this._pointerScreen.set(pointer.worldX, pointer.worldY);

      // this.debugGraphics.clear();
      // this.debugGraphics.fillStyle(0x00ff00, 1);
      // this.debugGraphics.fillRect(this._pointerScreen.x - 2, this._pointerScreen.y - 2, 4, 4);

      this.cannon.requestShoot(this._pointerScreen);
    });

    this.input.on("wheel", (e: WheelEvent) => {
      this.changeZoomContinuous(e.deltaY);
    });

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      switch (e.keyCode) {
        case Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET:
          this.perspective = PERSPECTIVES[(PERSPECTIVES.indexOf(this.perspective) + 1) % PERSPECTIVES.length];

          this.setupPerspective();
          log(`Perspective changed to ${this.perspective} (${PERSPECTIVE_INDEX[this.perspective]}°)`);
          break;
        case Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET:
          this.perspective =
            PERSPECTIVES[(PERSPECTIVES.indexOf(this.perspective) - 1 + PERSPECTIVES.length) % PERSPECTIVES.length];
          this.setupPerspective();
          log(`Perspective changed to ${this.perspective} (${PERSPECTIVE_INDEX[this.perspective]}°)`);

          break;
        case Phaser.Input.Keyboard.KeyCodes.SPACE:
          this.game.isPaused ? this.game.resume() : this.game.pause();
          break;
        case Phaser.Input.Keyboard.KeyCodes.MINUS:
          this.changeZoomDiscrete(-1);
          break;
        case Phaser.Input.Keyboard.KeyCodes.PLUS:
          this.changeZoomDiscrete(1);
          break;
        case Phaser.Input.Keyboard.KeyCodes.F:
          this.scale.toggleFullscreen();
          break;
      }
    });

    // Game
    this.cannon = new Cannon(this, 270);
    this.cube = new Cube(this, 5, 5, 5, Math.PI / 4);
    this.setupPerspective();
  }

  setupCamera() {
    const mapPixelWidth = this.map.widthInPixels;
    const mapPixelHeight = this.map.heightInPixels;
    const camera = this.cameras.main;
    camera.scrollX = 0; // Start at the left
    camera.scrollY = mapPixelHeight - camera.height; // Start at the bottom
    camera.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    camera.setRoundPixels(true);
    this.scale.on("resize", this.handleResize, this);
    this.handleResize(this.game.scale.gameSize);
  }

  changeZoomDiscrete(direction: 1 | -1) {
    const previousZoom = this.zoom;
    let requestedZoomIndex = -1;

    if (direction > 0) {
      const index = this.zooms.findIndex((z) => z > previousZoom);
      requestedZoomIndex = index === -1 ? this.zooms.length - 1 : index;
    } else {
      const indexInReversed = [...this.zooms].reverse().findIndex((z) => z < previousZoom);
      requestedZoomIndex = indexInReversed === -1 ? 0 : this.zooms.length - 1 - indexInReversed;
    }

    const newZoom = this.zooms[requestedZoomIndex];

    if (previousZoom !== newZoom) {
      this.zoom = newZoom;
      this.cameras.main.zoomTo(this.zoom, 100, Phaser.Math.Easing.Quadratic.InOut);
    } else {
      this.cameras.main.shake(200, (1 / this.zoom) * 0.003);
    }
  }

  changeZoomContinuous(delta: number) {
    const previousZoom = this.zoom;
    const zoomFactor = 0.002;
    const zoomDelta = -delta * zoomFactor;
    const newZoom = Phaser.Math.Clamp(previousZoom + zoomDelta, this.zooms[0], this.zooms[this.zooms.length - 1]);
    if (newZoom !== previousZoom) {
      this.zoom = newZoom;
      this.cameras.main.setZoom(this.zoom);
    }
  }

  handleResize({ width, height }: { width: number; height: number }) {
    const mapPixelWidth = this.map.widthInPixels;
    const mapPixelHeight = this.map.heightInPixels;
    // Zoom level if we were to make the map's width exactly fit the canvas width
    const scaleToFitWidth = width / mapPixelWidth;
    // Zoom level if we were to make the map's height exactly fit the canvas height
    const scaleToFitHeight = height / mapPixelHeight;
    this.coverZoom = Math.max(scaleToFitWidth, scaleToFitHeight);
    this.cameras.main.setSize(width, height);
    this.zooms = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2].filter((zoom) => zoom > this.coverZoom + 0.1);
    this.zooms.unshift(this.coverZoom);
    if (!this.zooms.includes(this.zoom)) {
      if (this.zoom === undefined) this.zoom = this.zooms[0];
      else {
        this.zoom = [...this.zooms].reverse().find((z) => z <= this.zoom) ?? this.zooms[0];
      }
    }
    this.cameras.main.setZoom(this.zoom);
  }

  inViewport(screen: { x: number; y: number }): boolean {
    const bounds = this.cameras.main.worldView;
    return (
      screen.x >= bounds.x - 200 &&
      screen.x <= bounds.right + 200 &&
      screen.y >= bounds.y - 200 &&
      screen.y <= bounds.bottom + 200
    );
  }

  update(time: number, delta: number) {
    this.dirty = false;
    this.controls.update(delta);
    this.updatePointer(time, delta);
  }

  shutdown() {
    this.destroyPointer();
  }
}
