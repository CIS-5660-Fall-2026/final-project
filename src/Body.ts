import type { Quat, Vec3 } from "wgpu-matrix";

export interface BodyInitialState {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  radius: number;
  orientation: Quat;
  angularVelocity: Vec3;
}

export const BODY_STRIDE = 64;

export function packBodies(
  bodies: readonly BodyInitialState[],
  capacity: number
) {
  const data = new Float32Array(capacity * BODY_STRIDE / 4);

  bodies.forEach((body, index) => {
    data.set([
      body.position[0], body.position[1], body.position[2], body.mass, 
      body.velocity[0], body.velocity[1], body.velocity[2], body.radius, 
      body.orientation[0], body.orientation[1],
      body.orientation[2], body.orientation[3],
      body.angularVelocity[0], body.angularVelocity[1], body.angularVelocity[2]
    ], index * 16);
  })

  return data;
}