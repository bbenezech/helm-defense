import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],
  failIfMajorPerformanceCaveat: true,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
  },
});
