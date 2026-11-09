import common from "./shaders/common.wgsl?raw";
import noise from "./shaders/noise.wgsl?raw";
import gravity from "./shaders/gravity.wgsl?raw";
import bodies from "./shaders/bodies.wgsl?raw";
import bodiesDebug from "./shaders/bodies_debug.wgsl?raw";
import collision from "./shaders/collision.wgsl?raw";

export const gravityWgsl = `${common}\n${gravity}`;
export const bodiesWgsl = `${common}\n${noise}\n${bodies}`;
export const bodiesDebugWgsl = `${common}\n${bodiesDebug}`;
export const collisionWgsl = `${common}\n${collision}`;