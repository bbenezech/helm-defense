import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],

  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
  },
});

const title = document.title;

function blurGame() {
  if (game.isRunning && !game.isPaused) {
    game.pause();

    document.title = `Paused - ${title}`;
  }
}

function focusGame() {
  if (game.isRunning && game.isPaused) {
    game.resume();
    document.title = title;
  }
}

// window.addEventListener("blur", blurGame);
// window.addEventListener("focus", focusGame);
// window.document.body.addEventListener("mouseleave", blurGame);
// window.document.body.addEventListener("mouseenter", focusGame);
