import Phaser from "phaser";
import { GameScene } from "../GameScene"; // Assuming GameScene has the methods
import { SMALL_WORLD_FACTOR } from "../constants";

export interface Solid {
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  gameScene: GameScene;
  invMass: number; // Inverse mass (1/mass), or 0 for static objects
}

const EPSILON = 1e-6;
const MAX_SPEED = 600; // Max speed for normalization factor
const MIN_BOUNCE_THRESHOLD = 0.1; // Calculated bounce percentages below this become zero

const targetWorkspace = new Phaser.Math.Vector3();

/**
 * Modifies a velocity vector in-place to simulate a bounce off a surface,
 * preserving speed and interpolating the bounce direction. Uses a single sqrt.
 *
 * - Velocity magnitude remains constant.
 * - Normal is the normalized surface normal vector.
 * - interpolationFactor interpolates the output direction:
 *   -  0: Output velocity is along the normal (soft "trampoline" bounce).
 *   - 1: Output velocity is a specular reflection (hard "billiard" bounce).
 *
 * @param velocity The velocity vector to modify in-place.
 * @param normal The normalized surface normal vector (unit-length).
 * @param hardnessFactor A value typically between 0 and 1 controlling the bounce direction.
 * @returns The modified velocity vector.
 */
export function bounce(
  velocity: Phaser.Math.Vector3,
  normal: Phaser.Math.Vector3, // unit-length
  hardnessFactor: number,
  initialSpeed: number
) {
  // 1. Calculate the dot product of velocity and normal.
  // This represents the component of velocity projecting onto the normal.
  // A negative value means the velocity is heading towards the surface.
  const dotVN = velocity.dot(normal);

  // Note: Standard physics often only reflects if dotVN < 0.
  // Here, we follow the prompt to always interpolate based on the factor.
  // If dotVN >= 0, the object is technically already moving away from the normal,
  // but the reflection formula still works mathematically.

  // 2. Clamp the interpolation factor to the valid range [0, 1].
  const softnessFactor = 1 - hardnessFactor;

  // 3. Calculate the target velocity components for the two extreme cases:

  // Case A: Pure Normal Bounce (interpolationFactor = 0)
  // The velocity should be directly along the normal, with the original speed.
  const vNormX = normal.x * initialSpeed;
  const vNormY = normal.y * initialSpeed;
  const vNormZ = normal.z * initialSpeed;

  // Case B: Pure Specular Reflection (interpolationFactor = 1)
  // Use the reflection formula: v' = v - 2 * (v . n) * n
  // This reflected vector inherently preserves the magnitude ('speed').
  // Store original velocity components before modifying 'velocity' if we were
  // calculating this in-place directly. Since we calculate components separately,
  // we can use the current velocity values.
  const twoDotVN = 2 * dotVN;
  const vSpecX = velocity.x - twoDotVN * normal.x;
  const vSpecY = velocity.y - twoDotVN * normal.y;
  const vSpecZ = velocity.z - twoDotVN * normal.z;

  // 4. Linearly interpolate between the normal bounce and specular reflection velocities.
  // result = (1 - t) * vNormal + t * vSpecular
  // Update the velocity vector in-place with the interpolated components.
  velocity.x = softnessFactor * vNormX + hardnessFactor * vSpecX;
  velocity.y = softnessFactor * vNormY + hardnessFactor * vSpecY;
  velocity.z = softnessFactor * vNormZ + hardnessFactor * vSpecZ;
}

const SMALL_WORLD_FACTOR_SQ = SMALL_WORLD_FACTOR * SMALL_WORLD_FACTOR;
const TNT_KG_IN_JOULES = 4.184 * 10e6; // 1 TNT kg = 4.184 MJ

/**
 * Collides a sphere against height-mapped ground. Calculates bounce magnitude
 * and direction based on impact characteristics and surface properties.
 * Uses bounceOptimized for efficient directional calculation.
 *
 * @param s Solid object with position, velocity, etc.
 * @param radius Sphere radius (center to lowest point).
 * @returns Splash energy in TNT kg eq. (number), or false if no collision.
 */
export function sphereToGroundCollision(
  s: Solid,
  speedSq: number,
  speed?: number
): number | false {
  const groundZ = s.gameScene.getSurfaceZFromWorldPosition(s.world) ?? 0;

  // Penetration & Impact Angle Check ---
  const elevation = s.world.z - groundZ; // Elevation above ground
  const penetrationDepth = -elevation;

  // Check for penetration
  if (penetrationDepth <= EPSILON) return false; // Not penetrating or just touching

  // Check relative direction (velocity vs normal)
  const normal = s.gameScene.getSurfaceNormalFromWorldPosition(s.world);
  const velocityDotNormal = s.velocity.dot(normal);

  // Cosine of the angle between -velocity and normal (impact angle relative to normal)
  // velocityDotNormal is negative, so -velocityDotNormal is positive.
  speed ??= Math.sqrt(speedSq);
  const cosImpactAngle = -velocityDotNormal / speed; // Range [0, 1]

  // parallelFactor: 1 for grazing (cosImpactAngle=0), 0 for head-on (cosImpactAngle=1)
  const parallelFactor = Phaser.Math.Clamp(1.0 - cosImpactAngle, 0.0, 1.0);
  // fastFactor: How fast relative to max speed
  const fastFactor = Phaser.Math.Clamp(speed / MAX_SPEED, 0.0, 1.0);

  // Potential for bounce based purely on impact angle and speed
  const impactBouncePotential = Phaser.Math.Clamp(
    parallelFactor * fastFactor, // Higher for fast, grazing impacts
    0.0,
    1.0
  );

  // Combine impact potential with surface properties. Bounce if impact potential > softness.
  const hardness = s.gameScene.getSurfaceHardnessFromWorldPosition(s.world);

  let bounce_percentage = hardness * impactBouncePotential;

  // Apply threshold: weak uninteresting bounces become splashes (no speed retained)
  if (bounce_percentage < MIN_BOUNCE_THRESHOLD) bounce_percentage = 0.0;

  const explosion_percentage = 1.0 - bounce_percentage;
  const energy =
    (explosion_percentage *
      0.5 *
      ((speedSq * SMALL_WORLD_FACTOR_SQ) / s.invMass)) /
    TNT_KG_IN_JOULES;

  if (bounce_percentage === 0) {
    // No bounce, just resolve position
    s.velocity.reset();
    s.world.z = groundZ;
    return energy;
  }

  // Push object out along the normal by the penetration depth
  s.world.add(targetWorkspace.copy(normal).scale(penetrationDepth + EPSILON)); // Reuse workspace vec

  bounce(s.velocity, normal, hardness, speed); // Modifies s.velocity in-place
  s.velocity.normalize().scale(speed * bounce_percentage); // Maintain the original speed

  return energy;
}
