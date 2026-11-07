import { type Mat4, mat4, type Vec3, vec3, utils } from "wgpu-matrix";
const { degToRad } = utils;

class CameraUniforms {
    public readonly buffer = new ArrayBuffer(16 * 4);
    private readonly floatView = new Float32Array(this.buffer);

    set viewProjection(mat: Float32Array) {
        this.floatView.set(mat, 0);
    }
}

export default class Camera {
    public position: Vec3 = vec3.create(0, 0, 10);
    public yaw: number = 0;
    public pitch: number = 0;
    
    public fovY: number = degToRad(60);
    public near: number = 0.1;
    public far: number = 1000;
    public aspect: number = 16 / 9;
    
    public readonly uniforms: CameraUniforms = new CameraUniforms();

    private view: Mat4 = mat4.identity();
    private projection: Mat4 = mat4.perspective(this.fovY, 16 / 9, this.near, this.far);

    constructor() {
        this.updateView();
    }

    public rotate(yawDegree: number, pitchDegree: number) {
        this.yaw += degToRad(yawDegree);
        this.pitch += degToRad(pitchDegree);

        this.pitch = Math.min(degToRad(89), Math.max(degToRad(-89), this.pitch));
    }

    public updateProjection() {
        this.projection = mat4.perspective(this.fovY, this.aspect, this.near, this.far);
    }

    public updateView() {
        const front = mat4.create();
        front[0] = Math.cos(this.yaw) * Math.cos(this.pitch);
        front[1] = Math.sin(this.pitch);
        front[2] = Math.sin(this.yaw) * Math.cos(this.pitch);

        const target = vec3.add(this.position, vec3.scale(front, 1));
        this.view = mat4.lookAt(this.position, target, [0, 1, 0]);
    }

    public updateViewProjection() {
        this.updateView();
        this.updateProjection();
    }

    public onFrame() {
        this.uniforms.viewProjection = mat4.mul(this.projection, this.view);
    }
}