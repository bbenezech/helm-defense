import { GameScene } from "../GameScene";

interface Solid {
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  gameScene: GameScene;
  invMass: number;
}

const maxSpeed = 600;

/**
 * Collides a sphere against height‑mapped ground using a 'softness' parameter.
 * Calculates bounce vs. splash based on surface softness and impact characteristics.
 *
 * @param s           Solid whose .world and .velocity are Phaser.Math.Vector3
 * @param radius      Distance from sphere centre to its lowest point (≥ 0)
 * @returns           CollisionResult indicating if collision occurred and the splash/bounce factors.
 */
export function sphereToGroundCollision(
  s: Solid,
  radius: number
): number | boolean {
  const epsilon = 1e-6;
  if (s.velocity.z > epsilon) return false; // moving up

  // get ground properties from the tiles
  const height = s.gameScene.getSurfaceZFromWorldPosition(s.world) ?? 0; // null means behind building, assume 0.
  const hardness = s.gameScene.getSurfaceHardnessFromWorldPosition(s.world); // 1 for iron, 0 for mud
  const normal = s.gameScene.getSurfaceNormalFromWorldPosition(s.world); // normal of the surface, -Pi/2 on flat surface
  // Calculate dot product of velocity and normal.
  // vn will be negative if velocity points towards the surface normal (typical impact).
  const vn = s.velocity.dot(normal);

  // If vn >= 0, the object is moving parallel or away from the surface normal.
  // This shouldn't happen if we are penetrating, unless velocity is zero or exactly parallel.
  // We can treat this as a non-colliding case or grazing contact with no bounce.
  if (vn >= -epsilon) {
    s.world.z = height + radius; // Resolve penetration minimally
    // Optionally apply friction here if desired for grazing contact
    return 0; // No bounce/splash from this angle
  }

  const elevation = s.world.z - height;
  if (elevation >= radius - epsilon) return false;

  const softness = 1 - hardness;

  const speed = s.velocity.length();
  // Calculate cos(angle) between velocity and normal. Should be in [-1, 0] for impact.
  const cosAngle = vn / speed; // Assumes normal is normalized, speed != 0

  // Factor representing how parallel the impact is to the surface.
  // abs(cosAngle) = 0 for parallel/grazing (90deg), 1 for perpendicular/head-on (180deg).
  // We want the opposite: 1 for grazing, 0 for head-on.
  const parallelFactor = Phaser.Math.Clamp(1.0 - Math.abs(cosAngle), 0.0, 1.0);
  const fastFactor = Phaser.Math.Clamp(speed / maxSpeed, 0, 1);
  const bullet_bounce_potential = Phaser.Math.Clamp(
    parallelFactor * fastFactor, // Bounce potential higher for fast, grazing impacts
    0,
    1
  );

  let bounce_percentage =
    bullet_bounce_potential > softness ? hardness * bullet_bounce_potential : 0; // SPLAAAAASH IN THE MUD
  if (bounce_percentage < 0.1) bounce_percentage = 0; // small bounces are not interesting
  const splash_percentage = 1.0 - bounce_percentage;

  // TODO
  // when surface_bounce_potential is > 0.5, reduce the velocity on the normal: ball is "rolling" over hard surface
  // when surface_bounce_potential is low, straighten velocity on the normal: ball is "absorbed" by the soft surface, and direction of the restitution is not completely vertical, but a bit more opposite from velocity, the ball is sent back from where it came from.

  s.world.z = height + radius;
  s.velocity.x *= bounce_percentage;
  s.velocity.y *= bounce_percentage;
  s.velocity.z *= -bounce_percentage;

  return 0.5 * splash_percentage * speed * speed * (1 / s.invMass); // part of velocity energy sent back to the surface
}
