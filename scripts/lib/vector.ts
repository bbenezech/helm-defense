export type Vector3 = [number, number, number];

export function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len === 0) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function normalizeInPlace(v: Vector3): Vector3 {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len === 0) {
    v[0] = 0;
    v[1] = 0;
    v[2] = 1;
  } else {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }

  return v;
}

export function normalizeXYZ(x: number, y: number, z: number): Vector3 {
  const len = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  if (len === 0) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

export function dot(v1: Vector3, v2: Vector3): number {
  return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

export function cross(v1: Vector3, v2: Vector3): Vector3 {
  return [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]];
}

export function crossInPlace(v1: Vector3, v2: Vector3): Vector3 {
  const x = v1[1] * v2[2] - v1[2] * v2[1];
  const y = v1[2] * v2[0] - v1[0] * v2[2];
  const z = v1[0] * v2[1] - v1[1] * v2[0];
  v1[0] = x;
  v1[1] = y;
  v1[2] = z;
  return v1;
}

export function subtract(v1: Vector3, v2: Vector3): Vector3 {
  return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
}

export function subtractInPlace(v1: Vector3, v2: Vector3): Vector3 {
  v1[0] -= v2[0];
  v1[1] -= v2[1];
  v1[2] -= v2[2];
  return v1;
}

export function scale(v: Vector3, s: number): Vector3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function scaleInPlace(v: Vector3, s: number): Vector3 {
  v[0] *= s;
  v[1] *= s;
  v[2] *= s;
  return v;
}

export type Matrix3 = [Vector3, Vector3, Vector3];

export function mat3_mul_vec3(m: Matrix3, v: Vector3): Vector3 {
  const x = m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2];
  const y = m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2];
  const z = m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2];
  return [x, y, z];
}

export function mat3_mul_vec3_in_place(m: Matrix3, v: Vector3): Vector3 {
  const x = m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2];
  const y = m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2];
  const z = m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2];
  v[0] = x;
  v[1] = y;
  v[2] = z;
  return v;
}
