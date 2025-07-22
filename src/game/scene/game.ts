import { Cannon } from "../actors/Cannon.js";
import { Cube } from "../actors/Cube.js";
import {
  BULLET_SPRITE,
  CANNON_SPRITE,
  ENEMY_SPRITE,
  PARTICLE_SPRITE,
  CANNON_WHEELS_SPRITE,
  FLARES,
  BULLET,
  PERSPECTIVE_INDEX,
  PERSPECTIVES,
  GRAVITY_WORLD,
} from "../constants.js";
import { createCannonTexture } from "../texture/cannon.js";
import { createCircleTexture } from "../texture/circle.js";
import { createParticleTexture } from "../texture/particle.js";
import { randomNormal } from "../lib/random.js";
import { SURFACE_HARDNESS } from "../world/surface.js";
import { Sound } from "../lib/sound.js";
import fpsBus from "../../store/fps.js";
import timeScaleStore from "../../store/time-scale.js";
import { createPointer } from "../lib/pointer.js";
import { Coordinates } from "../lib/coordinates.js";
import { terrainToMetadata, TILE_ELEVATION_RATIO, tileableHeightmapToTerrain, type Terrain } from "../lib/terrain.js";
import { LightingFilterController } from "./LightningFilter.js";

const GRASS = `Grass_23-512x512`;

// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-town/Tilemap/tilemap.png" --margin 0 --spacing 1
// npx tile-extruder --tileWidth 16 --tileHeight 16 --input "assets/kenney_tiny-dungeon/Tilemap/tilemap.png" --margin 0 --spacing 1
// tileset goes from 0 margin/1 spacing to 1 margin/3 spacing => update the map.json file

export class GameScene extends Phaser.Scene {
  private _tmpVector2: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private _tmpVector3: Phaser.Math.Vector3 = new Phaser.Math.Vector3();
  private X_FACTOR!: number;
  private Y_FACTOR!: number;
  private Z_FACTOR!: number;
  private X_FACTOR_INV!: number;
  private Y_FACTOR_INV!: number;
  private Z_FACTOR_INV!: number;
  private halfTileWidthInv!: number;
  private halfTileHeightInv!: number;
  private controls!: Phaser.Cameras.Controls.SmoothedKeyControl;
  private cannon!: Cannon;
  private cube!: Cube;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private zooms!: number[];
  private coverZoom!: number;
  private axonometric: boolean;
  private perspective: (typeof PERSPECTIVES)[number];
  private updatePointer!: (this: GameScene, time: number, delta: number) => void;
  private destroyPointer!: (this: GameScene) => void;
  private mapType!: "isometric" | "orthogonal";
  private reversedLayers!: Phaser.Tilemaps.TilemapLayer[];
  private tileableHeightmap!: number[][];
  private terrain!: Terrain;
  private metadataPixelsPerTile = 8;
  private heightmap!: number[][];
  private normalmap!: [number, number, number][][];
  private lightingFilterController!: LightingFilterController;

  map!: Phaser.Tilemaps.Tilemap;
  zoom!: number;
  screenToWorldRatioHorizontal!: Phaser.Math.Vector3;
  screenToWorldRatioVertical!: Phaser.Math.Vector3;
  worldToScreenRatio!: Phaser.Math.Vector3;
  selectionGraphics!: Phaser.GameObjects.Graphics;
  dirty = true;
  cannonBlast!: Sound;
  gravity!: Coordinates;
  bounds!: Phaser.Geom.Rectangle;

  constructor() {
    super({ key: "GameScene" });
    this.perspective = "pixelArtIsometric";
    this.axonometric = true;
  }

  preload() {
    this.load.image(GRASS, `${GRASS}/tileset.png`);
    this.load.tilemapTiledJSON("map", `${GRASS}/random.map.json`);
    this.load.json("tileableHeightmap", `${GRASS}/random.tileableHeightmap.json`);
    this.load.image(ENEMY_SPRITE, "enemy.png");
    this.load.image(CANNON_WHEELS_SPRITE, "wheels.png");
    this.load.atlas(FLARES, "flares.png", "flares.json");

    const bulletRadius = BULLET.radius;
    const cannonRadius = bulletRadius * 1.2;
    const cannonLength = cannonRadius * 8;

    createParticleTexture(this, PARTICLE_SPRITE);
    createCannonTexture(this, CANNON_SPRITE, 0x44_44_44, cannonLength, cannonRadius * 2);
    createCircleTexture(this, BULLET_SPRITE, 0x00_00_00, bulletRadius * 2);

    this.load.audio("cannon_blast_1", "cannon_blast_1.mp3");
    this.load.audio("cannon_blast_2", "cannon_blast_2.mp3");
    this.load.audio("cannon_blast_3", "cannon_blast_3.mp3");
    this.load.audio("cannon_blast_4", "cannon_blast_4.mp3");
    this.load.audio("cannon_blast_5", "cannon_blast_5.mp3");
    this.load.image("checker", `${GRASS}/random.normalmap.png`);
  }

  create() {
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(100_000_000_000);

    // TODO: create the terrain inline and create tilemap from the terrain and tileset
    this.map = this.make.tilemap({ key: "map" });
    this.tileableHeightmap = this.cache.json.get("tileableHeightmap") as number[][];

    this.terrain = tileableHeightmapToTerrain(this.tileableHeightmap);
    const { heightmap, normalmap } = terrainToMetadata(this.terrain, this.metadataPixelsPerTile);
    this.heightmap = heightmap;
    this.normalmap = normalmap;

    const tileset = this.map.addTilesetImage(GRASS, GRASS)!;
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 0, tileset, 0, 0));
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 1, tileset, 0, 0));
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 2, tileset, 0, 0));
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 3, tileset, 0, 0));
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 4, tileset, 0, 0));
    // this.add.existing(new IsometricTilemapGPULayer(this, this.map, 5, tileset, 0, 0));

    const layerContainer = this.add.container(0, 0);
    for (const layer of this.map.layers) layerContainer.add(this.map.createLayer(layer.name, tileset));

    this.lightingFilterController = new LightingFilterController(this, layerContainer);
    this.lightingFilterController.setMetadata(this.heightmap, this.normalmap);
    this.reversedLayers = this.map.layers.map((l) => l.tilemapLayer).reverse();
    this.halfTileWidthInv = 2 / this.map.tileWidth;
    this.halfTileHeightInv = 2 / this.map.tileHeight;

    const minOffsetY = Math.min(...this.map.layers.map((l) => l.y));
    const maxOffsetY = Math.max(...this.map.layers.map((l) => l.y));
    const minOffsetX = Math.min(...this.map.layers.map((l) => l.x));
    const maxOffsetX = Math.max(...this.map.layers.map((l) => l.x));
    const fullWidth = this.map.widthInPixels + (maxOffsetX - minOffsetX);
    const fullHeight = this.map.heightInPixels + (maxOffsetY - minOffsetY);

    this.mapType =
      String(this.map.orientation) === String(Phaser.Tilemaps.Orientation.ISOMETRIC) ? "isometric" : "orthogonal";
    if (this.mapType === "isometric") {
      this.bounds = new Phaser.Geom.Rectangle(
        -this.map.widthInPixels / 2 + this.map.tileWidth / 2 + minOffsetX,
        this.map.tileHeight / 2 + minOffsetY,
        fullWidth,
        fullHeight,
      );
    } else if (this.mapType === "orthogonal") {
      this.bounds = new Phaser.Geom.Rectangle(minOffsetX, minOffsetY, fullWidth, fullHeight);
    } else throw new Error(this.mapType satisfies never);

    this.selectionGraphics = this.add.graphics();

    this.setupCamera();
    this.setupPerspective();

    const keyboard = this.input.keyboard!;
    const cursors = keyboard.createCursorKeys();

    this.controls = new Phaser.Cameras.Controls.SmoothedKeyControl({
      camera: this.cameras.main,
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      acceleration: 0.1,
      drag: 0.003,
      maxSpeed: 2,
    });

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
      const screen = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      this.cannon.requestShoot(screen);
      const tile = this.screenToTile(screen);

      if (tile) {
        tile.tint = tile.tint === 16_777_215 ? 0x99_99_99 : 16_777_215; // debug

        // this.debugGraphics.clear();
        // this.debugGraphics.fillStyle(0x00ff00, 1);
        // this.debugGraphics.fillRect(tile.x - 4, tile.y - 4, 8, 8);
      }
    });

    this.input.keyboard?.on("keydown", async (event: KeyboardEvent) => {
      switch (event.keyCode) {
        case Phaser.Input.Keyboard.KeyCodes.W: {
          const perspective = PERSPECTIVES[PERSPECTIVES.indexOf(this.perspective) + 1];
          if (perspective === undefined) {
            this.nudge();
          } else this.changePerspective(perspective);
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.S: {
          const perspective = PERSPECTIVES[PERSPECTIVES.indexOf(this.perspective) - 1];
          if (perspective === undefined) {
            this.nudge();
          } else this.changePerspective(perspective);
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.SPACE: {
          timeScaleStore.togglePause();
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.A: {
          if (!timeScaleStore.slowDown()) this.nudge();
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.D: {
          if (!timeScaleStore.speedUp()) this.nudge();
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.MINUS: {
          if (!this.changeZoomDiscrete(-1)) this.nudge();
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.PLUS: {
          if (!this.changeZoomDiscrete(1)) this.nudge();
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.F: {
          if (window.electron) {
            window.electron.toggleFullScreen();
          } else {
            window.document.body.requestFullscreen({ navigationUI: "hide" });
          }
          break;
        }
        case Phaser.Input.Keyboard.KeyCodes.ESC: {
          if (window.electron) {
            if (await window.electron.isFullScreen()) {
              window.electron.toggleFullScreen();
            } else {
              window.electron.quitApp();
            }
          }
          break;
        }
      }
    });

    this.gravity = new Coordinates(this, GRAVITY_WORLD);
    this.cannon = new Cannon(this, 270);
    this.cannon.setWorld(this.tileCoordinatesToWorld(34, 75));
    this.cube = new Cube(this, 5, 5, 5, Math.PI / 4);
    this.cube.setWorld(this.tileCoordinatesToWorld(70, 77));
  }

  setupPerspective() {
    this.dirty = true;
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

    this.X_FACTOR_INV = 1 / this.X_FACTOR;
    this.Y_FACTOR_INV = 1 / this.Y_FACTOR;
    this.Z_FACTOR_INV = 1 / this.Z_FACTOR;

    // if Z is null
    this.screenToWorldRatioHorizontal = new Phaser.Math.Vector3(this.X_FACTOR_INV, this.Y_FACTOR_INV, 0);

    // if Y is null
    this.screenToWorldRatioVertical = new Phaser.Math.Vector3(this.X_FACTOR_INV, 0, this.Z_FACTOR_INV);

    // convert a world unit to screen pixels on all 3 axes
    this.worldToScreenRatio = new Phaser.Math.Vector3(this.X_FACTOR, this.Y_FACTOR, this.Z_FACTOR);
  }

  changePerspective(perspective: (typeof PERSPECTIVES)[number]) {
    if (this.perspective === perspective) return;
    this.perspective = perspective;
    this.setupPerspective();

    // if projection changes, we need to update their position
    this.cannon.setWorld(this.tileCoordinatesToWorld(34, 75));
    this.cube.setWorld(this.tileCoordinatesToWorld(70, 77));

    this.events.emit("perspective-change");
  }

  screenToTileCoordinates(
    screen: Phaser.Math.Vector2,
    layer: { x: number; y: number } | null,
    out = this._tmpVector2,
  ): Phaser.Math.Vector2 {
    const x = layer ? screen.x - layer.x : screen.x;
    const y = layer ? screen.y - layer.y : screen.y;
    if (this.mapType === "isometric") {
      out.x = (x * this.halfTileWidthInv + y * this.halfTileHeightInv) * 0.5 - 1;
      out.y = (y * this.halfTileHeightInv - x * this.halfTileWidthInv) * 0.5;
    } else if (this.mapType === "orthogonal") {
      out.x = x * 0.5 * this.halfTileWidthInv;
      out.y = y * 0.5 * this.halfTileHeightInv;
    } else throw new Error(this.mapType satisfies never);

    return out;
  }

  // TODO DOES NOT ALWAYS SEND BACK A TILE
  screenToTile(screen: Phaser.Math.Vector2) {
    for (const layer of this.reversedLayers) {
      const { x, y } = this.screenToTileCoordinates(screen, layer);
      const tile = this.map.getTileAt(Math.floor(x), Math.floor(y), false, layer);
      if (tile && tile.index !== -1) return tile;
    }
    return null;
  }

  worldToTile(world: Phaser.Math.Vector3) {
    const { x, y } = this.screenToTileCoordinates(this.worldFloorToScreen(world), null);
    for (const layer of this.reversedLayers) {
      const tile = this.map.getTileAt(Math.floor(x), Math.floor(y), false, layer);
      if (tile && tile.index !== -1) return tile;
    }
    return null;
  }

  tileToScreen(tile: Phaser.Tilemaps.Tile, out = this._tmpVector2): Phaser.Math.Vector2 {
    const halfWidth = this.map.tileWidth * 0.5;
    const halfHeight = this.map.tileHeight * 0.5;
    if (this.mapType === "isometric") {
      out.x = (tile.x + 1 - tile.y) * halfWidth + tile.layer.x;
      out.y = (tile.x + 1 + tile.y) * halfHeight + halfHeight + tile.layer.y;
      return out;
    } else if (this.mapType === "orthogonal") {
      out.x = tile.x * this.map.tileWidth + halfWidth + tile.layer.x;
      out.y = tile.y * this.map.tileHeight + halfHeight + tile.layer.y;
      return out;
    } else throw new Error(this.mapType satisfies never);
  }

  tileToWorld(tile: Phaser.Tilemaps.Tile, out = this._tmpVector3): Phaser.Math.Vector3 {
    return this.screenToWorld(this.tileToScreen(tile), this.tileWorldZ(tile), out);
  }

  screenToWorld(screen: Phaser.Math.Vector2, worldZ: number, out = this._tmpVector3) {
    out.x = screen.x * this.X_FACTOR_INV;
    out.y = (screen.y + worldZ * this.Z_FACTOR) * this.Y_FACTOR_INV;
    out.z = worldZ;
    return out;
  }

  screenGroundToWorld(screen: Phaser.Math.Vector2, out = this._tmpVector3) {
    const tile = this.screenToTile(screen);
    const worldZ = tile ? this.tileWorldZ(tile) : 0;
    return this.screenToWorld(screen, worldZ, out);
  }

  screenFloorToWorld(screen: Phaser.Math.Vector2, out = this._tmpVector3) {
    return this.screenToWorld(screen, 0, out);
  }

  worldToMetadata(world: Phaser.Math.Vector3, out = this._tmpVector2): Phaser.Math.Vector2 {
    const { x, y } = this.screenToTileCoordinates(this.worldFloorToScreen(world), null);
    out.x = x * this.metadataPixelsPerTile;
    out.y = y * this.metadataPixelsPerTile;
    return out;
  }

  // 0 => mud
  // 1 => iron
  groundHardness(_world: Phaser.Math.Vector3): number {
    // const tile = this.worldToTile(world);
    return Phaser.Math.Clamp(randomNormal(SURFACE_HARDNESS.grass, 0.1), 0, 1);
  }

  groundElevation(world: Phaser.Math.Vector3): number | null {
    const { x, y } = this.worldToMetadata(world, this._tmpVector2);
    const height = this.heightmap[Math.round(y)]?.[Math.round(x)];
    if (height === undefined) return null;

    return (height / this.metadataPixelsPerTile) * (this.map.tileWidth * this.X_FACTOR_INV);
  }

  groundNormal(world: Phaser.Math.Vector3, out = this._tmpVector3): Phaser.Math.Vector3 | null {
    const { x, y } = this.worldToMetadata(world);
    const normal = this.normalmap[Math.round(y)]?.[Math.round(x)];
    if (normal === undefined) return null;

    // inverse y and rotate 45 degrees
    out.x = (normal[0] + normal[1]) * Math.SQRT1_2;
    out.y = (normal[0] - normal[1]) * Math.SQRT1_2;
    out.z = normal[2];
    return out;
  }

  worldToScreen(world: Phaser.Math.Vector3, out = this._tmpVector2) {
    out.x = world.x * this.X_FACTOR;
    out.y = world.y * this.Y_FACTOR - world.z * this.Z_FACTOR;
    return out;
  }

  worldFloorToScreen(world: Phaser.Math.Vector3, out = this._tmpVector2) {
    out.x = world.x * this.X_FACTOR;
    out.y = world.y * this.Y_FACTOR;
    return out;
  }

  tileWorldZ(tile: Phaser.Tilemaps.Tile): number {
    const centerLevel = tile.properties["CENTER"] as undefined | number;
    if (centerLevel === undefined || typeof centerLevel !== "number")
      throw new Error(`Tile has no valid center property: ${JSON.stringify(tile, undefined, 2)}`);
    const levelP = tile.layer.properties.find((p: any) => p["name"] === "level") as undefined | { value: number };
    if (levelP === undefined || typeof levelP.value !== "number")
      throw new Error(`Tile layer has no valid level property: ${JSON.stringify(tile.layer, undefined, 2)}`);
    const layerLevel = levelP.value;
    const tileWidthWorld = this.map.tileWidth * this.X_FACTOR_INV;
    return (layerLevel + centerLevel) * TILE_ELEVATION_RATIO * tileWidthWorld;
  }

  tileCoordinatesToWorld(tileX: number, tileY: number, out = this._tmpVector3): Phaser.Math.Vector3 {
    let tile;
    for (const layer of this.reversedLayers) {
      const candidateTile = this.map.getTileAt(tileX, tileY, false, layer);
      if (candidateTile && candidateTile.index !== -1) {
        tile = candidateTile;
        break;
      }
    }

    if (!tile) throw new Error(`Tile at (${tileX}, ${tileY}) not found in any layer`);

    return this.tileToWorld(tile, out);
  }

  setupCamera() {
    const camera = this.cameras.main;
    camera.setBounds(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height, true);
    this.scale.on("resize", this.handleResize, this);
    this.handleResize(this.game.scale.gameSize);
  }

  nudge(ratio: number = 1) {
    this.cameras.main.shake(200, (1 / this.zoom) * 0.003 * ratio);
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

    if (newZoom === previousZoom) return false;

    this.zoom = newZoom;
    this.cameras.main.zoomTo(this.zoom, 100, Phaser.Math.Easing.Quadratic.InOut);

    return true;
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
    // Zoom level if we were to make the map's width exactly fit the canvas width
    const scaleToFitWidth = width / this.bounds.width;
    // Zoom level if we were to make the map's height exactly fit the canvas height
    const scaleToFitHeight = height / this.bounds.height;
    this.coverZoom = Math.max(scaleToFitWidth, scaleToFitHeight);
    this.cameras.main.setSize(width, height);
    this.zooms = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2].filter((zoom) => zoom > this.coverZoom * 1.25);
    this.zooms.unshift(this.coverZoom);
    if (!this.zooms.includes(this.zoom)) {
      this.zoom =
        this.zoom === undefined
          ? this.zooms[0]
          : ([...this.zooms].reverse().find((z) => z <= this.zoom) ?? this.zooms[0]);
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

  override update(time: number, delta: number) {
    this.dirty = false;
    this.controls.update(delta);
    this.updatePointer(time, delta);
    fpsBus.emitDebounced(this.sys.game.loop.actualFps);
    this.lightingFilterController.update(time, delta);
  }

  shutdown() {
    this.destroyPointer();
  }
}
