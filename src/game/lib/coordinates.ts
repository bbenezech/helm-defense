import Phaser from "phaser";
import { GameScene } from "../scene/game";

export type Coordinates = {
  readonly screen: Phaser.Math.Vector2;
  isEmpty(): boolean;
  length(): number;
  screenLength(): number;
} & Phaser.Math.Vector3;

type GameObject = Phaser.GameObjects.GameObject & { gameScene: GameScene };

export interface CoordinatesConstructor {
  new (parent: GameObject | GameScene, x?: number, y?: number, z?: number): Coordinates;
  new (parent: GameObject | GameScene, coordinates: Phaser.Math.Vector3): Coordinates;
}

const vectorProps = ["x", "y", "z"];

// Phaser.Math.Vector3 for world coordinates that update screen coordinates automatically
class CoordinatesImpl {
  private readonly gameScene: GameScene;
  private readonly world = new Phaser.Math.Vector3();
  private screenVector = new Phaser.Math.Vector2();
  private worldLengthCache: number | undefined = undefined;
  private screenLengthCache: number | undefined = undefined;
  private screenUpToDate = false;

  constructor(parent: GameObject | GameScene, xOrCoordinates: number | Phaser.Math.Vector3 = 0, y = 0, z = 0) {
    if (typeof xOrCoordinates === "number") {
      this.world.set(xOrCoordinates, y, z);
    } else {
      this.world.copy(xOrCoordinates);
    }
    this.gameScene = parent instanceof GameScene ? parent : parent.gameScene;
    if (this.gameScene === undefined)
      throw new Error("Coordinates must be created on a GameScene or an initialized GameObject that has a gameScene.");

    this.gameScene.events.on("perspective-change", this.refreshScreen, this);
    const cleanup = () => this.gameScene.events.off("perspective-change", this.refreshScreen, this);
    this.gameScene.events.once("destroy", cleanup, this);
    if (parent instanceof Phaser.GameObjects.GameObject) parent.once("destroy", cleanup, this);

    return new Proxy(this, {
      set: (target, prop, value): boolean => {
        if (vectorProps.includes(String(prop))) {
          // console.log(`0.1 Setting property ${String(prop)} to ${value} on world instance`);
          Reflect.set(target.world, prop, value);
          // Refresh the screen coordinates and prune caches
          target.refresh();
        } else {
          // Set the property directly on the CoordinatesImpl instance.
          // console.log(`0.2 Setting property ${String(prop)} to ${value} on Coordinates instance`);
          Reflect.set(target, prop, value);
        }

        return true;
      },
      get: (target, prop, receiver) => {
        // Prioritize properties on our implementation
        if (prop in target) {
          // console.log(`1.Getting property ${String(prop)}`);
          return Reflect.get(target, prop, receiver);
        } else {
          const valueFromWorld = Reflect.get(target.world, prop);
          if (typeof valueFromWorld === "function") {
            // console.log(`2.Getting property ${String(prop)}`);
            return (...args: any[]) => {
              const result = valueFromWorld.apply(target.world, args);
              // Only refresh if a mutator method was called
              // This is a good optimization to prevent refreshes on .length(), for example
              if (result === target.world) {
                // console.log(`2.1. mutator called ${String(prop)}`);
                target.refresh();
              } else {
                // console.log(`2.2. non mutator method called ${String(prop)}`);
              }
              // Return the proxy for chaining
              return result === target.world ? receiver : result;
            };
          } else {
            // console.log(`3.Getting property ${String(prop)}`);
            return valueFromWorld;
          }
        }
      },
    });
  }

  private refresh() {
    this.worldLengthCache = undefined;
    this.refreshScreen();
  }

  private refreshScreen() {
    this.screenUpToDate = false;
    this.screenLengthCache = undefined;
  }

  public isEmpty() {
    return this.world.x === 0 && this.world.y === 0 && this.world.z === 0;
  }

  public length() {
    return this.worldLength();
  }

  public worldLength() {
    return (this.worldLengthCache ??= this.world.length());
  }
  public screenLength() {
    return (this.screenLengthCache ??= this.screen.length());
  }

  public get screen() {
    if (!this.screenUpToDate) {
      this.gameScene.getScreenPosition(this.world, this.screenVector);
      this.screenUpToDate = true;
    }
    return this.screenVector;
  }
}

export const Coordinates = CoordinatesImpl as unknown as CoordinatesConstructor;
