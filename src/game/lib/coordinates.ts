import Phaser from "phaser";
import { GameScene } from "../scene/game";

export type Coordinates = Phaser.Math.Vector3 & {
  readonly screen: Phaser.Math.Vector2;
  readonly world: Phaser.Math.Vector3;
};

type GameObject = Phaser.GameObjects.GameObject & { gameScene: GameScene };

export interface CoordinatesConstructor {
  new (parent: GameObject | GameScene, x?: number, y?: number, z?: number): Coordinates;
  new (parent: GameObject | GameScene, coordinates: Phaser.Math.Vector3): Coordinates;
}

// Phaser.Math.Vector3 with screen coordinates that updates automatically
class CoordinatesImpl {
  private readonly gameScene: GameScene;
  private readonly world = new Phaser.Math.Vector3();
  public readonly screen = new Phaser.Math.Vector2();

  constructor(parent: GameObject | GameScene, xOrCoordinates: number | Phaser.Math.Vector3 = 0, y = 0, z = 0) {
    if (typeof xOrCoordinates === "number") {
      this.world.set(xOrCoordinates, y, z);
    } else {
      this.world.copy(xOrCoordinates);
    }
    this.gameScene = parent instanceof GameScene ? parent : parent.gameScene;

    this.refresh();
    this.gameScene.events.on("perspective-change", this.refresh, this);
    if (parent instanceof Phaser.GameObjects.GameObject)
      parent.once("destroy", () => {
        this.gameScene.events.off("perspective-change", this.refresh, this);
      });
    this.gameScene.events.once("destroy", () => {
      this.gameScene.events.off("perspective-change", this.refresh, this);
    });

    // sweet Jesus, let's hope Gemini knows his shit
    return new Proxy(this, {
      set: (target, prop, value): boolean => {
        Reflect.set(target.world, prop, value);
        this.refresh();
        return true;
      },
      get: (target, prop, receiver) => {
        // Prioritize properties on our implementation class ('screen')
        if (prop in target) return Reflect.get(target, prop, receiver);
        const valueFromWorld = Reflect.get(target.world, prop);
        if (typeof valueFromWorld === "function") {
          return (...args: any[]) => {
            const result = valueFromWorld.apply(target.world, args);
            this.refresh();
            // Return the proxy for chaini ng
            return result === target.world ? receiver : result;
          };
        }
        return valueFromWorld;
      },
    });
  }

  private refresh() {
    this.gameScene.getScreenPosition(this.world, this.screen);
  }
}

export const Coordinates = CoordinatesImpl as unknown as CoordinatesConstructor;
