import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

new Phaser.Game({
  type: Phaser.WEBGL,
  scene: [GameScene, UIScene],

  failIfMajorPerformanceCaveat: true,
  disableContextMenu: true,
  disablePostFX: true,
  disablePreFX: true,
  roundPixels: true,
  pixelArt: true,
  antialias: false,
});
