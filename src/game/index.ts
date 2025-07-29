import Phaser from "phaser";
import { GameScene } from "./scene/game.js";
import packageJson from "../../package.json" with { type: "json" };

const title = document.title;
const url = import.meta.env.PROD ? "https://bbenezech.github.io/helm-defense" : window.location.href;

export function start(parent: string) {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    scene: [GameScene],
    scale: { mode: Phaser.Scale.RESIZE },
    disableContextMenu: import.meta.env.PROD,
    render: { smoothPixelArt: true },
    title,
    url,
    version: packageJson.version,
    banner: { text: "yellow" },
    parent,
  });
}
