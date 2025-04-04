export class UIScene extends Phaser.Scene {
  scoreText!: Phaser.GameObjects.Text;
  fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "UIScene" });
  }

  preload() {
    // Optional: Preload specific UI assets (fonts, button images)
    // Not strictly necessary if assets are loaded globally or by GameScene
  }

  create() {
    this.cameras.main.setBackgroundColor("rgba(0, 0, 0, 0)");
    // --- UI Element Creation ---
    // Positioned relative to the UIScene's camera (which matches viewport)
    this.fpsText = this.add.text(10, 10, "FPS: --", {
      font: "16px Courier",
      color: "#00ff00",
    });

    this.scoreText = this.add
      .text(this.cameras.main.width - 10, 10, "Score: 0", {
        font: "16px Arial",
        color: "#ffffff",
        align: "right",
      })
      .setOrigin(1, 0);

    // --- Get Reference to Game Scene (Optional, use carefully) ---
    // const gameScene = this.scene.get('GameScene');

    // --- Listen for Events from Game Scene ---
    // Use the global game event emitter
    this.game.events.on(
      "updateScore",
      (score: number) => {
        if (this.scoreText) {
          // Ensure text object exists
          this.scoreText.setText(`Score: ${score}`);
        }
      },
      this
    );

    // --- Listen for Resize ---
    // UI scene also needs to adapt to resize if elements are anchored to edges
    this.scale.on("resize", this.handleResize, this);

    // --- Clean up listeners ---
    // Important to avoid memory leaks when scene restarts
    this.events.on("shutdown", () => {
      this.game.events.off("updateScore"); // Remove specific listener
      // OR remove all listeners for this context:
      // this.game.events.off(null, null, this);
      this.scale.off("resize", this.handleResize, this);
    });
    this.events.on("destroy", () => {
      // Ensure cleanup on destroy as well (sometimes shutdown isn't enough if stopped externally)
      this.game.events.off("updateScore");
      this.scale.off("resize", this.handleResize, this);
    });
  }

  handleResize(gameSize: Phaser.Structs.Size) {
    this.scoreText.x = gameSize.width - 10;
    // Note: Camera viewport might adjust automatically based on scale mode
  }

  update(time: number, delta: number) {
    // Update FPS (can be done here as it doesn't depend on game state)
    const fps = this.sys.game.loop.actualFps;
    this.fpsText.setText(`FPS: ${fps.toFixed(2)}`);
  }
}
