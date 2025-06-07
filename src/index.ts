import Phaser from "phaser";
import { GameScene } from "./scene/game";
import { UIScene } from "./scene/ui";
import { version } from "../package.json";

const title = document.title;
const url = import.meta.env.PROD ? "https://bbenezech.github.io/helm-defense" : window.location.href;
const NODE_ENV = import.meta.env.PROD ? "production" : "development";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],
  scale: { mode: Phaser.Scale.RESIZE, autoRound: true },
  disableContextMenu: true,
  parent: "game-container",
  title,
  url,
  version,
  banner: { text: "yellow" },
});

if (NODE_ENV === "development")
  console.log(`Running with NODE_ENV=${NODE_ENV}, mode=${import.meta.env.MODE}, BASE_URL=${import.meta.env.BASE_URL}`);

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

window.addEventListener("blur", blurGame);
window.addEventListener("focus", focusGame);
