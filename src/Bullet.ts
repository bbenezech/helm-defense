import { World } from "./World";
import { FlyingObject } from "./FlyingObject";

export class Bullet extends FlyingObject {
  constructor(
    scene: World,
    x: number,
    y: number,
    z: number, // Initial world position
    vx: number,
    vy: number,
    vz: number // Initial velocity
  ) {
    super(scene, x, y, z, vx, vy, vz, "bullet");
    scene.add.existing(this);
  }

  update(time: number, delta: number): boolean {
    return super.update(time, delta);
  }

  destroy(): void {
    super.destroy();
  }
}
