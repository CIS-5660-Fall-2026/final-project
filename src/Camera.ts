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
  public position: Vec3 = vec3.create(0, 0, 30);
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

  public get forward(): Vec3 {
    return vec3.create(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  public get right(): Vec3 {
    return vec3.create(
      Math.cos(this.yaw),
      0,
      Math.sin(this.yaw),
    );
  }

  public updateView() {
    const target = vec3.add(this.position, this.forward);
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