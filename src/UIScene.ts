// see https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
const cursors = {
  default: { filename: "cursor_none", origin: { x: 0.2, y: 0.1 } },
  pointer: { filename: "hand_point", origin: { x: 0.2, y: 0.1 } },
  grab: { filename: "hand_open" },
  crosshair: { filename: "target_b" },
} satisfies Record<string, { filename: string; origin?: { x: number; y: number } }>;

type Cursor = keyof typeof cursors;
const svgRasterSize = { width: 20, height: 20 };

export class UIScene extends Phaser.Scene {
  scoreText!: Phaser.GameObjects.Text;
  fpsText!: Phaser.GameObjects.Text;
  lockedCursors: Partial<Record<Cursor, Phaser.GameObjects.Image>> = {};
  activeCursor: Cursor | "none" = "default";

  constructor() {
    super({ key: "UIScene" });
  }

  preload() {
    for (const name in cursors)
      this.load.svg(name, `cursor/Vector/Outline/${cursors[name as Cursor].filename}.svg`, svgRasterSize);
  }

  getLockedCursor(name: Cursor) {
    if (this.lockedCursors[name]) return this.lockedCursors[name];

    const cursor = cursors[name];
    this.lockedCursors[name] = this.add.image(0, 0, name);
    if ("origin" in cursor) this.lockedCursors[name].setOrigin(cursor.origin.x, cursor.origin.y);
    return this.lockedCursors[name];
  }

  changeCursor(pointer: Phaser.Input.Pointer, name: Cursor | "none") {
    if (this.activeCursor !== "none") {
      const previousCursor = this.lockedCursors[this.activeCursor];
      if (previousCursor && previousCursor.visible) previousCursor.setVisible(false);
    }

    this.activeCursor = name;
    if (pointer.locked) {
      if (name !== "none") {
        const cursor = this.getLockedCursor(name);
        if (!cursor.visible) cursor.setVisible(true);
      }
    } else {
      pointer.manager.setDefaultCursor(name);
    }
  }

  moveLockedCursor(pointer: Phaser.Input.Pointer, x: number, y: number) {
    if (!pointer.locked) return;
    const name = this.activeCursor;
    if (name === "none") return;
    const cursor = this.getLockedCursor(name);
    if (!cursor.visible) cursor.setVisible(true);
    cursor.setPosition(x, y);
  }

  create() {
    this.cameras.main.setBackgroundColor("rgba(0, 0, 0, 0)");
    this.activeCursor = "default";
    this.input.manager.events.on("pointerlockchange", () => {
      this.changeCursor(this.input.activePointer, this.activeCursor);
    });

    this.fpsText = this.add.text(10, 10, "FPS: --", { font: "16px Courier", color: "#00ff00" });

    this.scoreText = this.add
      .text(this.cameras.main.width - 10, 10, "Score: 0", { font: "16px Arial", color: "#ffffff", align: "right" })
      .setOrigin(1, 0);

    this.game.events.on(
      "updateScore",
      (score: number) => {
        this.scoreText.setText(`Score: ${score}`);
      },
      this,
    );
    this.scale.on("resize", this.handleResize, this);
    this.events.on("shutdown", () => {
      this.game.events.off("updateScore"); // Remove specific listener
      this.scale.off("resize", this.handleResize, this);
    });
    this.events.on("destroy", () => {
      this.game.events.off("updateScore");
      this.scale.off("resize", this.handleResize, this);
    });
  }

  handleResize(gameSize: Phaser.Structs.Size) {
    this.scoreText.x = gameSize.width - 10;
  }

  update(time: number, delta: number) {
    // Update FPS (can be done here as it doesn't depend on game state)
    const fps = this.sys.game.loop.actualFps;
    this.fpsText.setText(`FPS: ${fps.toFixed(2)}`);
  }
}
