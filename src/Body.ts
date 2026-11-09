import type { Quat, Vec3 } from "wgpu-matrix";

export interface BodyInitialState {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  radius: number;
  orientation: Quat;
  angularVelocity: Vec3;
  seed: number;
}

export const BODY_STRIDE = 64;

export function packBodies(
  bodies: readonly BodyInitialState[],
  capacity: number
) {
  const buffer = new ArrayBuffer(capacity * BODY_STRIDE);
  const floatView = new Float32Array(buffer);
  const uintView = new Uint32Array(buffer);

  bodies.forEach((body, index) => {
    const offset = index * 16;

    floatView.set([
      body.position[0], body.position[1], body.position[2], body.mass, 
      body.velocity[0], body.velocity[1], body.velocity[2], body.radius, 
      body.orientation[0], body.orientation[1],
      body.orientation[2], body.orientation[3],
      body.angularVelocity[0], body.angularVelocity[1], body.angularVelocity[2],
    ], index * 16);

    uintView[offset + 15] = body.seed;
  })

  return buffer;
}