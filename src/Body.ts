import type { Vec3 } from "wgpu-matrix";

export interface BodyInitialState {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  radius: number;
}

export const BODY_STRIDE = 32;

export function packBodies(
  bodies: readonly BodyInitialState[],
  capacity: number
) {
  const data = new Float32Array(capacity * BODY_STRIDE / 4);

  bodies.forEach((body, index) => {
    data.set([
      body.position[0], body.position[1], body.position[2], 
      body.mass,
      body.velocity[0], body.velocity[1], body.velocity[2],
      body.radius
    ], index * 8);
  })

  return data;
}