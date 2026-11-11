// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import ditherVertRaw from './dither.vs.wgsl?raw';
import ditherFragRaw from './dither.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    bindGroup_dither: 3,

    moveLightsWorkgroupSize: 128,
    lightRadius: 2,
    maxLightsPerCluster: 1024,

    clusterDimX: 12,
    clusterDimY: 6,
    clusterDimZ: 12,

    clusterWorkgroupSizeX: 8,
    clusterWorkgroupSizeY: 4,
    clusterWorkgroupSizeZ: 4,
    clusterWorkgroupSize: 128,

    nearPlane: 0.1,
    farPlane: 1000.0,
};

// =================================

// function evalShaderRaw(raw: string) {
//     return eval('`' + raw.replaceAll('${', '${constants.') + '`');
// }

function evalShaderRaw(raw: string) {
    return raw.replace(/\$\{(\w+)\}/g, (_, name) => {
        const value = (constants as any)[name];
        if (value === undefined) {
            console.warn(`⚠️ Shader constant '${name}' not found`);
            return '0'; // or throw an error
        }
        return value.toString();
    });
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const ditherVertSrc: string = processShaderRaw(ditherVertRaw);
export const ditherFragSrc: string = processShaderRaw(ditherFragRaw);
export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);