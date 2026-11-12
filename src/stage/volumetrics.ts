import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

export class Volumetrics {
    private camera: Camera;

    constructor(camera: Camera) {
        this.camera = camera;
    }
}
