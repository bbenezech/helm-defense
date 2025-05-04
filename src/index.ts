import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],
  failIfMajorPerformanceCaveat: true,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
  },
});

window.addEventListener("blur", () => {
  console.log("window blurred, pausing game (window listener).");
  if (game.isRunning && !game.isPaused) {
    game.pause();
  }
});

window.addEventListener("focus", () => {
  console.log("window focused, resuming game (window listener).");
  if (game.isRunning && game.isPaused) {
    game.resume();
  }
});
