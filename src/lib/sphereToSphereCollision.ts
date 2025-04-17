interface Solid {
  world: Phaser.Math.Vector3;
  velocity: Phaser.Math.Vector3;
  invMass: number; // = 1 / mass. Use 0 for infinite mass if needed by calculations.
}

export function sphereToSphereCollision(
  a: Solid,
  b: Solid,
  combinedSqRadius: number, // = (radiusA + radiusB)², cached by caller
  restitution: number, // 0..1 0= perfectly inelastic, 1 = perfectly elastic
  computeDamage: boolean
): number {
  const dx = b.world.x - a.world.x;
  const dy = b.world.y - a.world.y;
  const dz = b.world.z - a.world.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq >= combinedSqRadius) return 0; // outside or just touching
  if (distSq < 1e-8) return 0; // almost same centre

  const rvx = a.velocity.x - b.velocity.x;
  const rvy = a.velocity.y - b.velocity.y;
  const rvz = a.velocity.z - b.velocity.z;

  const rvDotN = rvx * dx + rvy * dy + rvz * dz; // n NOT normalised

  if (rvDotN > -1e-6) return 0; // already separating

  const invMassSum = a.invMass + b.invMass;
  if (invMassSum === 0) return 0; // both static

  // jVec = -(1+e) * (rv·n) / (invMassSum * |n|²) * n
  // Since |n|² = distSq, we avoid sqrt completely.
  const safeDistSq = Math.max(distSq, 1e-6);
  const jFactor = (-(1 + restitution) * rvDotN) / (invMassSum * safeDistSq);

  const jx = jFactor * dx;
  const jy = jFactor * dy;
  const jz = jFactor * dz;

  a.velocity.x += jx * a.invMass;
  a.velocity.y += jy * a.invMass;
  a.velocity.z += jz * a.invMass;

  b.velocity.x -= jx * b.invMass;
  b.velocity.y -= jy * b.invMass;
  b.velocity.z -= jz * b.invMass;

  return computeDamage
    ? Math.sqrt(jx * jx + jy * jy + jz * jz) // *one* sqrt only when needed
    : 0;
}
