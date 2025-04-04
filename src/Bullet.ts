import { World } from "./World";
import { FlyingObject } from "./FlyingObject";
import { BULLET_SPRITE } from "./constants";

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
    super(scene, x, y, z, vx, vy, vz, BULLET_SPRITE);
    scene.add.existing(this);
  }

  destroy(): void {
    super.destroy();
  }
}
