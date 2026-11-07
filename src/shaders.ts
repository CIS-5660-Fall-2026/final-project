import common from "./shaders/common.wgsl?raw";
import gravity from "./shaders/gravity.wgsl?raw";
import bodies from "./shaders/bodies.wgsl?raw";

export const gravityWgsl = `${common}\n${gravity}`;
export const bodiesWgsl = `${common}\n${bodies}`;