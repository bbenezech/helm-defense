import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

new Phaser.Game({
  type: Phaser.AUTO,
  scene: [GameScene, UIScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
  },
});
