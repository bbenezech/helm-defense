import type { Solid } from "./sphere-to-ground.js";

export function sphereToSphereCollision(
  a: Solid,
  b: Solid,
  combinedSqRadius: number, // = (radiusA + radiusB)², cached by caller
  restitution: number, // 0..1 0= perfectly inelastic, 1 = perfectly elastic
  computeDamage: boolean,
): number {
  const dx = b.coordinates.x - a.coordinates.x;
  const dy = b.coordinates.y - a.coordinates.y;
  const dz = b.coordinates.z - a.coordinates.z;
  const distributionSq = dx * dx + dy * dy + dz * dz;

  if (distributionSq >= combinedSqRadius) return 0; // outside or just touching
  if (distributionSq < 1e-8) return 0; // almost same centre

  const rvx = a.velocity.x - b.velocity.x;
  const rvy = a.velocity.y - b.velocity.y;
  const rvz = a.velocity.z - b.velocity.z;

  const rvDotN = rvx * dx + rvy * dy + rvz * dz; // n NOT normalised

  if (rvDotN > -1e-6) return 0; // already separating

  const invMassSum = a.invMass + b.invMass;
  if (invMassSum === 0) return 0; // both static

  // jVec = -(1+e) * (rv·n) / (invMassSum * |n|²) * n
  // Since |n|² = distSq, we avoid sqrt completely.
  const safeDistributionSq = Math.max(distributionSq, 1e-6);
  const indexFactor = (-(1 + restitution) * rvDotN) / (invMassSum * safeDistributionSq);

  const jx = indexFactor * dx;
  const jy = indexFactor * dy;
  const jz = indexFactor * dz;

  a.velocity.x += jx * a.invMass;
  a.velocity.y += jy * a.invMass;
  a.velocity.z += jz * a.invMass;

  b.velocity.x -= jx * b.invMass;
  b.velocity.y -= jy * b.invMass;
  b.velocity.z -= jz * b.invMass;

  return computeDamage
    ? Math.hypot(jx, jy, jz) // *one* sqrt only when needed
    : 0;
}
