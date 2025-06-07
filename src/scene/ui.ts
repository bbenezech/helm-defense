const USE_UI_CURSOR = false; // Use UI pointer even when pointer lock is false

const cursorIndex = {
  default: { filename: "cursor_none", origin: { x: 0.3, y: 0.15 } },
  pointer: { filename: "hand_point", origin: { x: 0.25, y: 0.15 } },
  grab: { filename: "hand_open" },
  crosshair: { filename: "target_b" },
} satisfies Record<string, { filename: string; origin?: { x: number; y: number } }>;

export type Cursor = keyof typeof cursorIndex;
const svgRasterSize = { width: 20, height: 20 };

export class UIScene extends Phaser.Scene {
  scoreText!: Phaser.GameObjects.Text;
  fpsText!: Phaser.GameObjects.Text;
  UIcursors: Partial<Record<Cursor, Phaser.GameObjects.Image>> = {};
  activeUICursor: Cursor | null = null;
  focused: boolean = true;
  mousehover: boolean = true;
  fpsUpdateTimer = 0;
  debugGraphics!: Phaser.GameObjects.Graphics;
  x = 0;
  y = 0;

  constructor() {
    super({ key: "UIScene" });
  }

  preload() {
    for (const name in cursorIndex)
      this.load.svg(name, `cursor/Vector/Outline/${cursorIndex[name as Cursor].filename}.svg`, svgRasterSize);
  }

  getUICursor(cursorName: Cursor): Phaser.GameObjects.Image {
    if (this.UIcursors[cursorName]) return this.UIcursors[cursorName];

    const cursor = cursorIndex[cursorName];
    this.UIcursors[cursorName] = this.add.image(0, 0, cursorName);
    if ("origin" in cursor) this.UIcursors[cursorName].setOrigin(cursor.origin.x, cursor.origin.y);
    return this.UIcursors[cursorName];
  }

  updateCursor(cursor: Cursor) {
    const pointer = this.input.activePointer;
    const useUIPointer = pointer.locked || (this.focused && this.mousehover && USE_UI_CURSOR);
    const previousUICursor = this.activeUICursor !== null ? this.getUICursor(this.activeUICursor) : null;
    if (previousUICursor) previousUICursor.setVisible(false);

    if (useUIPointer) {
      pointer.manager.setDefaultCursor("none");
      this.activeUICursor = cursor;
      this.getUICursor(cursor).setVisible(true);
    } else {
      this.activeUICursor = null;
      if (cursor !== pointer.manager.defaultCursor) pointer.manager.setDefaultCursor(cursor);
    }
  }

  moveCursor(x: number, y: number) {
    this.x = x;
    this.y = y;
    if (this.activeUICursor === null) return; // OS cursor is shown, nothing to move
    const cursor = this.getUICursor(this.activeUICursor);
    if (cursor.x === x && cursor.y === y) return;
    cursor.setPosition(x, y);
  }

  onMouseLeave() {
    this.mousehover = false;
    this.updateCursor("default");
  }
  onMouseEnter() {
    this.mousehover = true;
    this.updateCursor("default");
  }
  onFocus() {
    this.focused = true;
    this.updateCursor("default");
  }
  onBlur() {
    this.focused = false;
    this.updateCursor("default");
  }

  scoreUpdateListener(score: number) {
    this.scoreText.setText(`Score: ${score}`);
  }

  handleResize(gameSize: Phaser.Structs.Size) {
    this.scoreText.x = gameSize.width - 10;
  }

  create() {
    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(100000000000);

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.cameras.main.setBackgroundColor("rgba(0, 0, 0, 0)");
    this.fpsText = this.add.text(10, 10, "FPS: --", { font: "16px Courier", color: "#00ff00" });

    this.scoreText = this.add
      .text(this.cameras.main.width - 10, 10, "Score: 0", { font: "16px Arial", color: "#ffffff", align: "right" })
      .setOrigin(1, 0);

    this.input.on(Phaser.Input.Events.GAME_OVER, this.onMouseEnter, this);
    this.input.on(Phaser.Input.Events.GAME_OUT, this.onMouseLeave, this);
    this.sys.game.events.on(Phaser.Core.Events.FOCUS, this.onFocus, this);
    this.sys.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.on("updateScore", this.scoreUpdateListener, this);
    this.scale.on("resize", this.handleResize, this);
  }

  override update(_time: number, delta: number) {
    // this.debugGraphics.clear();
    // this.debugGraphics.fillStyle(0x00ff00, 1);
    // this.debugGraphics.fillRect(this.x - 2, this.y - 2, 4, 4);

    this.fpsUpdateTimer += delta;
    if (this.fpsUpdateTimer >= 100) {
      const fps = this.sys.game.loop.actualFps;
      this.fpsText.setText(`${fps.toFixed(0)} FPS`);
      this.fpsUpdateTimer = 0;
    }
  }

  shutdown() {
    this.input.off(Phaser.Input.Events.GAME_OVER, this.onMouseEnter, this);
    this.input.off(Phaser.Input.Events.GAME_OUT, this.onMouseLeave, this);
    this.sys.game.events.off(Phaser.Core.Events.FOCUS, this.onFocus, this);
    this.sys.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.off("updateScore", this.scoreUpdateListener, this);
    this.scale.off("resize", this.handleResize, this);
  }
}
