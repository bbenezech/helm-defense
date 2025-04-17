interface Solid {
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
}

/**
 * Collides a vertical‑moving sphere against height‑mapped ground.
 *
 * @param s           Solid whose .world and .velocity are Phaser.Math.Vector3
 * @param radius      Distance from sphere centre to its lowest point (≥ 0)
 * @param groundZ     Callback returning ground height (z) at (x,y)
 * @param restitution Normal‑bounce coefficient in [0, 1] (0 = stick, 1 = elastic)
 * @returns           true if the sphere is touching the ground after the call
 */
export function sphereToGroundCollision(
  s: Solid,
  radius: number,
  groundZ: (x: number, y: number) => number,
  restitution: number
): boolean {
  // Height of centre above terrain
  const gZ = groundZ(s.world.x, s.world.y);
  const dz = s.world.z - gZ;

  // No contact: sphere fully above the ground
  if (dz >= radius) return false;

  // Resolve overlap by popping the sphere to the surface
  s.world.z = gZ + radius;

  // Velocity response
  if (s.velocity.z < -1e-6) {
    // Falling into the ground → bounce
    s.velocity.z = -s.velocity.z * restitution;
  } else {
    // Rising or resting → zero‑out vertical speed
    s.velocity.z = 0;
  }

  return true; // sphere is resting or has just bounced
}
