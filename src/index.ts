import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { UIScene } from "./UIScene";

new Phaser.Game({
  type: Phaser.WEBGL,
  // @ts-expect-error
  width: window.innerWidth,
  // @ts-expect-error
  height: window.innerHeight,
  backgroundColor: "#2d2d2d",
  parent: "phaser",
  pixelArt: true,
  antialias: false,
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
