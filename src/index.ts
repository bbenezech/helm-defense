import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
});
