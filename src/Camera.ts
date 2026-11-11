//import CameraControls from '3d-view-controls';
import {vec3, mat4} from 'gl-matrix';

function toRadians(deg: number) { return deg * Math.PI / 180; }

class Camera {
  //controls: any;
  projectionMatrix: mat4 = mat4.create();
  viewMatrix: mat4 = mat4.create();
  fovy: number = 45;
  aspectRatio: number = 1;
  near: number = 0.1;
  far: number = 10000;

  position: vec3 = vec3.create();
  front: vec3 = vec3.fromValues(0,0,-1);
  right: vec3 = vec3.fromValues(1,0,0);
  up: vec3 = vec3.fromValues(0,1,0);
  yaw: number = -90;
  pitch: number = 0;
  moveSpeed: number = 2.0;
  sensitivity: number = 0.15;

  keys: Set<string> = new Set();
  private lastTime: number = performance.now();

  constructor(position: vec3, target: vec3) {
    vec3.copy(this.position, position);
    const canvas = document.getElementById('canvas')!;

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup',   (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur',    () => this.keys.clear());
    
    canvas.addEventListener('click', () => canvas.requestPointerLock());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas){
        this.rotateCamera(e.movementX * this.sensitivity, e.movementY * this.sensitivity);
      }
    });

    this.rotateCamera(0,0);

  }

  setAspectRatio(aspectRatio: number) {
    this.aspectRatio = aspectRatio;
  }

  updateProjectionMatrix() {
    mat4.perspective(this.projectionMatrix, this.fovy, this.aspectRatio, this.near, this.far);
  }

  rotateCamera(dx: number, dy: number) {
    this.yaw += dx;
    this.pitch = Math.max(-89, Math.min(89, this.pitch - dy));

    const y = toRadians(this.yaw), p = toRadians(this.pitch);
    vec3.set(this.front, Math.cos(y) * Math.cos(p), Math.sin(p), Math.sin(y) * Math.cos(p));
    vec3.normalize(this.front, this.front);
    vec3.cross(this.right, this.front, [0, 1, 0]);
    vec3.normalize(this.right, this.right);
  }

  update() {
    const now = performance.now();
    const dt = Math.min((now-this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const move = vec3.create();
    if (this.keys.has('w')) vec3.add(move,move,this.front);
    if (this.keys.has('s')) vec3.sub(move,move,this.front);
    if (this.keys.has('d')) vec3.add(move,move,this.right);
    if (this.keys.has('a')) vec3.sub(move,move,this.right);
    if (this.keys.has('e')) vec3.add(move, move, this.up);
    if (this.keys.has('q')) vec3.sub(move, move, this.up);

    if(vec3.length(move) > 0) {
      vec3.normalize(move,move);
      vec3.scaleAndAdd(this.position, this.position, move, this.moveSpeed * dt);
    }

    const target = vec3.create();
    vec3.add(target, this.position, this.front);
    mat4.lookAt(this.viewMatrix, this.position, target, this.up);
  }
};

export default Camera;
