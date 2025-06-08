import Phaser from "phaser";
import { GameScene } from "./scene/game";
import { UIScene } from "./scene/ui";
import { version } from "../../package.json";

const title = document.title;
const url = import.meta.env.PROD ? "https://bbenezech.github.io/helm-defense" : window.location.href;

export function start(parent: string) {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    scene: [GameScene, UIScene],
    scale: { mode: Phaser.Scale.RESIZE, autoRound: true },
    disableContextMenu: true,
    title,
    url,
    version,
    banner: { text: "yellow" },
    parent,
  });
}
