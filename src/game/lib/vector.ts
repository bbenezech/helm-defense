export type Vector3 = [number, number, number];

export function normalize(v: Vector3, out: Vector3): Vector3 {
  return normalizeXYZ(v[0], v[1], v[2], out);
}

export function normalizeXYZ(x: number, y: number, z: number, out: Vector3): Vector3 {
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 1;
  } else {
    out[0] = x / length;
    out[1] = y / length;
    out[2] = z / length;
  }

  return out;
}

export function dot(v1: Vector3, v2: Vector3): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function cross(v1: Vector3, v2: Vector3, out: Vector3): Vector3 {
  const x = v1[1] * v2[2] - v1[2] * v2[1];
  const y = v1[2] * v2[0] - v1[0] * v2[2];
  const z = v1[0] * v2[1] - v1[1] * v2[0];

  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function subtract(v1: Vector3, v2: Vector3, out: Vector3): Vector3 {
  const x = v1[0] - v2[0];
  const y = v1[1] - v2[1];
  const z = v1[2] - v2[2];

  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function scale(v: Vector3, s: number, out: Vector3): Vector3 {
  const x = v[0] * s;
  const y = v[1] * s;
  const z = v[2] * s;

  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export type Matrix3 = [Vector3, Vector3, Vector3];

export function multiplyMatrix3x3Vec3(m0: Vector3, m1: Vector3, m2: Vector3, v: Vector3, out: Vector3): Vector3 {
  const x = m0[0] * v[0] + m1[0] * v[1] + m2[0] * v[2];
  const y = m0[1] * v[0] + m1[1] * v[1] + m2[1] * v[2];
  const z = m0[2] * v[0] + m1[2] * v[1] + m2[2] * v[2];

  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

export function barycentricWeights(
  x: number,
  y: number,
  v1: { x: number; y: number },
  v2: { x: number; y: number },
  v3: { x: number; y: number },
  out: Vector3,
): Vector3 {
  const den = (v2.y - v3.y) * (v1.x - v3.x) + (v3.x - v2.x) * (v1.y - v3.y);
  const a = ((v2.y - v3.y) * (x - v3.x) + (v3.x - v2.x) * (y - v3.y)) / den;
  const b = ((v3.y - v1.y) * (x - v3.x) + (v1.x - v3.x) * (y - v3.y)) / den;
  const c = 1 - a - b;

  out[0] = a;
  out[1] = b;
  out[2] = c;
  return out;
}
