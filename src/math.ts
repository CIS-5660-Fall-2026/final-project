export type Vec3 = [number, number, number];

export function cross(a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Returns `a + b * s` as a new vector. */
export function addScaled(
  a: Readonly<Vec3>,
  b: Readonly<Vec3>,
  s: number,
): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}
