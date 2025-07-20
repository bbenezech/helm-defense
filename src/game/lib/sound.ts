import { PLAY_SOUNDS } from "../constants.js";
import { GameScene } from "../scene/game.js";
import { randomNormal } from "./random.js";
import { cameraHeight } from "./trigo.js";

export class Sound {
  private gameScene: GameScene;
  private keys: string[] = [];
  private pool: { [key: string]: Phaser.Sound.WebAudioSound[] } = {};
  private lastKeyIndex: number | null = null;
  private invMaxDistance: number;
  private invMaxWidth: number;

  constructor(gameScene: GameScene, keys: string[]) {
    this.gameScene = gameScene;
    this.keys = keys;
    const elevationInPixels = cameraHeight(this.gameScene.map.widthInPixels);
    const maxDistance = Math.hypot(
      this.gameScene.map.widthInPixels,
      this.gameScene.map.heightInPixels,
      elevationInPixels,
    );

    this.invMaxDistance = 1 / maxDistance;
    this.invMaxWidth = 1 / this.gameScene.map.widthInPixels;
    for (const key of this.keys) this.pool[key] = [];
  }

  play(screenX: number, screenY: number) {
    if (PLAY_SOUNDS === false || this.gameScene.sound.locked) return;

    let key;
    if (this.keys.length > 1) {
      let keyIndex: number;
      while (true) {
        keyIndex = Math.floor(Math.random() * this.keys.length);
        if (keyIndex !== this.lastKeyIndex) break;
      }
      this.lastKeyIndex = keyIndex;
      key = this.keys[keyIndex];
    } else {
      key = this.keys[0];
    }

    let instance = this.pool[key].find((index) => !index.isPlaying);
    if (instance === undefined) {
      const newInstance = this.gameScene.sound.add(key);
      if (!(newInstance instanceof Phaser.Sound.WebAudioSound)) return;

      this.pool[key].push(newInstance);
      instance = newInstance;
    }

    const { centerX, centerY } = this.gameScene.cameras.main.worldView;

    const dx = screenX - centerX;
    const dy = screenY - centerY;
    const dz = cameraHeight(this.gameScene.cameras.main.worldView.width);

    const distance = Math.hypot(dx, dy, dz);
    const volume = 1 - distance * this.invMaxDistance;
    const pan = dx * this.invMaxWidth;
    instance.setVolume(volume);
    instance.setPan(pan);
    instance.setDetune(randomNormal(0, 50));
    instance.setRate(randomNormal(1, 0.2));
    instance.play();
  }
}
