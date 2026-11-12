import {vec3, vec4, quat, mat4} from 'gl-matrix';
import {gl} from '../../globals';

abstract class Drawable {
  count: number = 0;
  color: vec4 = vec4.fromValues(1.0, 0.0, 0.0, 1.0);

  // Transform
  position: vec3 = vec3.create();
  rotation: quat = quat.create();
  scale: vec3 = vec3.fromValues(1, 1, 1);
  private model: mat4 = mat4.create();

  bufIdx: WebGLBuffer;
  bufPos: WebGLBuffer;
  bufNor: WebGLBuffer;

  idxBound: boolean = false;
  posBound: boolean = false;
  norBound: boolean = false;

  // False for instances created with shareBuffersFrom(), so destroying one
  // instance doesn't delete buffers the others still use.
  private ownsBuffers: boolean = true;

  abstract create(): void;

  /** Called once per frame by Scene.update. Override for animation. */
  update(dt: number): void {}

  // ---- transform helpers (chainable) -------------------------------------

  setPosition(x: number, y: number, z: number): this {
    vec3.set(this.position, x, y, z);
    return this;
  }

  /** setScale(2) scales uniformly; setScale(50, 50, 1) scales per axis. */
  setScale(x: number, y: number = x, z: number = x): this {
    vec3.set(this.scale, x, y, z);
    return this;
  }

  /** Euler angles in degrees. */
  setRotationEuler(xDeg: number, yDeg: number, zDeg: number): this {
    quat.fromEuler(this.rotation, xDeg, yDeg, zDeg);
    return this;
  }

  /** Model matrix built from position/rotation/scale. Returned matrix is owned by this drawable. */
  modelMatrix(): mat4 {
    return mat4.fromRotationTranslationScale(this.model, this.rotation, this.position, this.scale);
  }

  // ---- buffers ------------------------------------------------------------

  /** Reuse another drawable's GPU buffers (many squares, one set of vertex data). */
  shareBuffersFrom(src: Drawable) {
    this.bufIdx = src.bufIdx;
    this.bufPos = src.bufPos;
    this.bufNor = src.bufNor;
    this.idxBound = src.idxBound;
    this.posBound = src.posBound;
    this.norBound = src.norBound;
    this.count = src.count;
    this.ownsBuffers = false;
  }

  destroy() {
    if (!this.ownsBuffers) return;
    gl.deleteBuffer(this.bufIdx);
    gl.deleteBuffer(this.bufPos);
    gl.deleteBuffer(this.bufNor);
  }

  generateIdx() {
    this.idxBound = true;
    this.bufIdx = gl.createBuffer();
  }

  generatePos() {
    this.posBound = true;
    this.bufPos = gl.createBuffer();
  }

  generateNor() {
    this.norBound = true;
    this.bufNor = gl.createBuffer();
  }

  bindIdx(): boolean {
    if (this.idxBound) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufIdx);
    }
    return this.idxBound;
  }

  bindPos(): boolean {
    if (this.posBound) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    }
    return this.posBound;
  }

  bindNor(): boolean {
    if (this.norBound) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNor);
    }
    return this.norBound;
  }

  elemCount(): number {
    return this.count;
  }

  drawMode(): GLenum {
    return gl.TRIANGLES;
  }
};

export default Drawable;
