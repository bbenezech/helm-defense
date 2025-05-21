import { PLAY_SOUNDS } from "../constants";
import { GameScene } from "../GameScene";
import { log } from "./log";
import { randomNormal } from "./random";

export class Sound {
  private gameScene: GameScene;
  private keys: string[] = [];
  private pool: {
    [key: string]: Phaser.Sound.WebAudioSound[];
  } = {};
  private lastKeyIndex: number | null = null;

  constructor(gameScene: GameScene, keys: string[]) {
    this.gameScene = gameScene;
    this.keys = keys;

    for (const key of this.keys) this.pool[key] = [];
  }

  play(config?: Phaser.Types.Sound.SoundConfig) {
    if (PLAY_SOUNDS === false) return;

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

    let instance = this.pool[key].find((i) => !i.isPlaying);
    if (instance === undefined) {
      const newInstance = this.gameScene.sound.add(key);
      if (!(newInstance instanceof Phaser.Sound.WebAudioSound)) {
        throw new Error(`Failed to create sound instance for key: ${key}`);
      }
      this.pool[key].push(newInstance);
      instance = newInstance;
      log("Sound instance added to pool", key);
    }

    instance.setDetune(randomNormal(0, 25));
    instance.setRate(randomNormal(1, 0.1));
    instance.setVolume(randomNormal(1, 0.1));
    instance.play(config);
  }
}
